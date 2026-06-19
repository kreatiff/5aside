import type { PoolClient } from "pg";
import { query } from "../db/helpers.js";
import { pairPaymentsToCharges, type ChargeEntry, type PaymentEntry, type GamePaymentStatus } from "./payment-pairing.js";

/**
 * Mark a game 'synced' once it actually has attendance on file, and return the
 * resulting attendance count.
 *
 * Transitions from BOTH 'scheduled' and 'pending':
 *  - 'scheduled' — the Facebook attendance webhook normally fires on game day,
 *    while the game is still 'scheduled' (the scheduled→pending auto-flip only
 *    happens lazily in GET /api/games once game_date < today). Transitioning
 *    only from 'pending' meant freshly-synced games never reached 'synced' and
 *    later got stuck on 'pending' after the date passed.
 *  - 'pending' — normal post-date sync, plus re-runs where every row hits
 *    ON CONFLICT DO NOTHING (so `imported` stays 0 even though the game IS synced).
 *
 * Keyed off the resulting attendance count — never off `imported` — so it is
 * correct for first imports, re-runs and queued-only imports alike. A game with
 * no attendance is left un-synced (correctly flagged as still needing a sync).
 *
 * Shared by the webhook (imports.ts) and the manual import route (games.ts) so
 * the two paths cannot drift apart.
 */
export async function markGameSyncedIfAttendanceExists(client: PoolClient, gameId: string): Promise<number> {
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM attendance WHERE game_id = $1`,
    [gameId]
  );
  const count = Number(result.rows[0]?.count ?? 0);
  if (count > 0) {
    await client.query(
      `UPDATE games SET status = 'synced', updated_at = NOW()
       WHERE id = $1 AND status IN ('scheduled', 'pending')`,
      [gameId]
    );
  }
  return count;
}

export type PlayerPaymentStatus = {
  playerId: string;
  displayName: string;
  chargeCents: number;
  paidCents: number;
  status: GamePaymentStatus;
};

export type GamePaymentStatusResponse = {
  gameId: string;
  gameDate: string;
  feeCents: number;
  playerStatuses: PlayerPaymentStatus[];
  summary: {
    totalExpectedCents: number;
    totalPaidCents: number;
    paidCount: number;
    partialCount: number;
    unpaidCount: number;
  };
};

export async function calculateGamePaymentStatus(gameId: string): Promise<GamePaymentStatusResponse> {
  // Fetch game info
  const gameResult = await query<{ fee_cents: number; status: string; game_date: string }>(
    `SELECT fee_cents, status, game_date::text FROM games WHERE id = $1`,
    [gameId]
  );
  if (gameResult.rowCount === 0) {
    throw new Error("Game not found");
  }
  const feeCents = gameResult.rows[0]!.fee_cents;
  const gameDate = gameResult.rows[0]!.game_date;

  // Get cutoff date
  const settingsResult = await query<{ cutoff_date: string | null }>(
    `SELECT cutoff_date::text FROM settings WHERE id = 1`
  );
  const cutoffDate = settingsResult.rows[0]?.cutoff_date?.slice(0, 10) ?? null;

  // Fetch chargeable attendees for this game
  const attendeesResult = await query<{
    player_id: string;
    display_name: string;
  }>(
    `SELECT a.player_id, p.display_name
     FROM attendance a
     JOIN players p ON p.id = a.player_id
     WHERE a.game_id = $1 AND a.chargeable = true
     ORDER BY p.display_name ASC`,
    [gameId]
  );

  if (attendeesResult.rows.length === 0) {
    return {
      gameId,
      gameDate,
      feeCents,
      playerStatuses: [],
      summary: { totalExpectedCents: 0, totalPaidCents: 0, paidCount: 0, partialCount: 0, unpaidCount: 0 },
    };
  }

  const playerIds = attendeesResult.rows.map((r) => r.player_id);

  // Fetch ALL ledger entries for these players (respecting cutoff)
  const ledgerResult = await query<{
    player_id: string;
    type: string;
    amount_cents: number;
    game_id: string | null;
    attendance_id: string | null;
    created_at: string;
    game_date: string | null;
  }>(
    `SELECT le.player_id, le.type, le.amount_cents, le.game_id, le.attendance_id,
            le.created_at::text AS created_at, g.game_date::text AS game_date
     FROM ledger_entries le
     LEFT JOIN games g ON g.id = le.game_id
     LEFT JOIN bank_transactions bt ON bt.id = le.bank_transaction_id
     WHERE le.player_id = ANY($1)
       AND ($2::date IS NULL OR COALESCE(g.game_date, bt.posted_at_utc::date, le.created_at::date) >= $2)
     ORDER BY le.created_at ASC`,
    [playerIds, cutoffDate]
  );

  // Group by player and run FIFO pairing
  const chargesByPlayer = new Map<string, ChargeEntry[]>();
  const paymentsByPlayer = new Map<string, PaymentEntry[]>();

  for (const entry of ledgerResult.rows) {
    if (entry.type === "charge" && entry.game_id && entry.game_date) {
      const arr = chargesByPlayer.get(entry.player_id) ?? [];
      arr.push({
        gameId: entry.game_id,
        attendanceId: entry.attendance_id ?? "",
        playerId: entry.player_id,
        amountCents: entry.amount_cents,
        gameDate: entry.game_date,
      });
      chargesByPlayer.set(entry.player_id, arr);
    } else if (entry.type === "payment") {
      const arr = paymentsByPlayer.get(entry.player_id) ?? [];
      arr.push({
        playerId: entry.player_id,
        amountCents: Math.abs(entry.amount_cents),
        createdAt: entry.created_at,
        gameId: entry.game_id,
      });
      paymentsByPlayer.set(entry.player_id, arr);
    } else if (entry.type === "adjustment") {
      if (entry.amount_cents < 0) {
        const arr = paymentsByPlayer.get(entry.player_id) ?? [];
        arr.push({
          playerId: entry.player_id,
          amountCents: Math.abs(entry.amount_cents),
          createdAt: entry.created_at,
          gameId: entry.game_id,
        });
        paymentsByPlayer.set(entry.player_id, arr);
      } else if (entry.amount_cents > 0) {
        const arr = chargesByPlayer.get(entry.player_id) ?? [];
        arr.push({
          gameId: entry.game_id ?? "",
          attendanceId: entry.attendance_id ?? "",
          playerId: entry.player_id,
          amountCents: entry.amount_cents,
          gameDate: entry.game_date ?? entry.created_at.slice(0, 10),
        });
        chargesByPlayer.set(entry.player_id, arr);
      }
    }
  }

  // Build per-player status
  const playerStatuses = attendeesResult.rows.map((attendee) => {
    const charges = chargesByPlayer.get(attendee.player_id) ?? [];
    const payments = paymentsByPlayer.get(attendee.player_id) ?? [];
    const pairings = pairPaymentsToCharges(charges, payments);

    const gameMatch = pairings.find((p) => p.gameId === gameId);
    return {
      playerId: attendee.player_id,
      displayName: attendee.display_name,
      chargeCents: gameMatch?.chargeCents ?? feeCents,
      paidCents: gameMatch?.paidCents ?? 0,
      status: gameMatch?.status ?? ("unpaid" as const),
    };
  });

  const summary = {
    totalExpectedCents: playerStatuses.reduce((s, p) => s + p.chargeCents, 0),
    totalPaidCents: playerStatuses.reduce((s, p) => s + p.paidCents, 0),
    paidCount: playerStatuses.filter((p) => p.status === "paid").length,
    partialCount: playerStatuses.filter((p) => p.status === "partial").length,
    unpaidCount: playerStatuses.filter((p) => p.status === "unpaid").length,
  };

  return { gameId, gameDate, feeCents, playerStatuses, summary };
}

export async function getLatestGameId(): Promise<string | null> {
  const result = await query<{ id: string }>(
    `SELECT id FROM games 
     WHERE status NOT IN ('scheduled', 'cancelled') 
     AND game_date <= CURRENT_DATE
     ORDER BY game_date DESC, kickoff_at_utc DESC NULLS LAST 
     LIMIT 1`
  );
  return result.rows[0]?.id ?? null;
}
