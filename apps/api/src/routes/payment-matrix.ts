import type { FastifyInstance } from "fastify";
import { query } from "../db/helpers.js";
import { pairPaymentsToCharges, type ChargeEntry, type PaymentEntry } from "../services/payment-pairing.js";

export async function paymentMatrixRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  /**
   * GET /api/payment-matrix
   *
   * Returns the full heatmap grid data: active players × games in date range,
   * with FIFO payment status per cell.
   *
   * Query params:
   *   - months: number of months to look back (default 3)
   */
  app.get("/api/payment-matrix", async (request) => {
    const months = Number((request.query as any).months) || 3;

    // 1. Get cutoff date from settings
    const settingsResult = await query<{ cutoff_date: string | null }>(
      `SELECT cutoff_date::text FROM settings WHERE id = 1`
    );
    const cutoffDate = settingsResult.rows[0]?.cutoff_date?.slice(0, 10) ?? null;

    // 2. Fetch all games in the date range
    const gamesResult = await query<{
      id: string;
      game_date: string;
      fee_cents: number;
    }>(
      `SELECT id, game_date::text AS game_date, fee_cents
       FROM games
       WHERE game_date >= (CURRENT_DATE - ($1 || ' months')::interval)
         AND status != 'cancelled'
       ORDER BY game_date ASC`,
      [months]
    );
    const games = gamesResult.rows;

    if (games.length === 0) {
      return { games: [], players: [] };
    }

    // 3. Fetch all active players
    const playersResult = await query<{
      id: string;
      display_name: string;
    }>(
      `SELECT id, display_name FROM players WHERE active = true ORDER BY display_name ASC`
    );
    const players = playersResult.rows;
    const playerIds = players.map((p) => p.id);

    if (playerIds.length === 0) {
      return {
        games: games.map((g) => ({
          id: g.id,
          gameDate: g.game_date,
          feeCents: g.fee_cents,
        })),
        players: [],
      };
    }

    // 4. Fetch ALL charge + payment + adjustment ledger entries for all active players
    //    Only entries on or after the cutoff date
    const ledgerResult = await query<{
      player_id: string;
      type: string;
      amount_cents: number;
      game_id: string | null;
      attendance_id: string | null;
      created_at: string;
      game_date: string | null;
    }>(
      `SELECT le.player_id,
              le.type,
              le.amount_cents,
              le.game_id,
              le.attendance_id,
              le.created_at::text AS created_at,
              g.game_date::text AS game_date
       FROM ledger_entries le
       LEFT JOIN games g ON g.id = le.game_id
       WHERE le.player_id = ANY($1)
         AND ($2::date IS NULL OR COALESCE(g.game_date, le.created_at::date) >= $2)
       ORDER BY le.created_at ASC`,
      [playerIds, cutoffDate]
    );

    // 5. Check for pre-cutoff credit per player (only if cutoff exists)
    let preCutoffCreditSet = new Set<string>();
    if (cutoffDate) {
      const preCutoffResult = await query<{
        player_id: string;
        net: string;
      }>(
        `SELECT le.player_id,
                SUM(le.amount_cents)::text AS net
         FROM ledger_entries le
         LEFT JOIN games g ON g.id = le.game_id
         WHERE le.player_id = ANY($1)
           AND COALESCE(g.game_date, le.created_at::date) < $2
         GROUP BY le.player_id
         HAVING SUM(le.amount_cents) < 0`,
        [playerIds, cutoffDate]
      );
      preCutoffCreditSet = new Set(preCutoffResult.rows.map((r) => r.player_id));
    }

    // 6. Group ledger entries by player
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
        });
        paymentsByPlayer.set(entry.player_id, arr);
      } else if (entry.type === "adjustment") {
        // Positive adjustments (credit) → treat as payment
        // Negative adjustments (debit) → treat as charge
        if (entry.amount_cents < 0) {
          const arr = paymentsByPlayer.get(entry.player_id) ?? [];
          arr.push({
            playerId: entry.player_id,
            amountCents: Math.abs(entry.amount_cents),
            createdAt: entry.created_at,
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

    // 7. Build the game ID set for the date range
    const gameIdSet = new Set(games.map((g) => g.id));

    // 8. Run FIFO pairing per player and build the matrix
    const matrixPlayers = players.map((player) => {
      const charges = chargesByPlayer.get(player.id) ?? [];
      const payments = paymentsByPlayer.get(player.id) ?? [];
      const pairings = pairPaymentsToCharges(charges, payments);

      // Build a map of gameId → pairing for quick lookup
      const pairingMap = new Map(pairings.map((p) => [p.gameId, p]));

      // Build cell array — one per game in range
      const cells = games.map((game) => {
        const pairing = pairingMap.get(game.id);
        if (!pairing) {
          return null; // Player didn't attend this game
        }
        return {
          gameId: game.id,
          status: pairing.status,
          chargeCents: pairing.chargeCents,
          paidCents: pairing.paidCents,
        };
      });

      // Only include players who attended at least one game in the range
      const hasAnyCells = cells.some((c) => c !== null);

      return {
        id: player.id,
        displayName: player.display_name,
        hasPreCutoffCredit: preCutoffCreditSet.has(player.id),
        cells,
        _hasAnyCells: hasAnyCells,
      };
    }).filter((p) => p._hasAnyCells).map(({ _hasAnyCells, ...rest }) => rest);

    return {
      games: games.map((g) => ({
        id: g.id,
        gameDate: g.game_date,
        feeCents: g.fee_cents,
      })),
      players: matrixPlayers,
    };
  });
}
