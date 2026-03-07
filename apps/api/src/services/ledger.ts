import type { PoolClient } from "pg";

export type LedgerEntryInsert = {
  playerId: string;
  type: "charge" | "payment" | "adjustment";
  amountCents: number;
  gameId?: string | null;
  attendanceId?: string | null;
  bankTransactionId?: string | null;
  adjustmentReason?: string | null;
};

export async function insertLedgerEntry(client: PoolClient, entry: LedgerEntryInsert): Promise<void> {
  await client.query(
    `INSERT INTO ledger_entries (
      player_id,
      type,
      amount_cents,
      game_id,
      attendance_id,
      bank_transaction_id,
      adjustment_reason
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.playerId,
      entry.type,
      entry.amountCents,
      entry.gameId ?? null,
      entry.attendanceId ?? null,
      entry.bankTransactionId ?? null,
      entry.adjustmentReason ?? null
    ]
  );

  // Determine the effective date of this entry for cutoff comparison
  let effectiveDate: string | null = null;
  if (entry.gameId) {
    const game = await client.query<{ game_date: string }>(
      `SELECT game_date::text FROM games WHERE id = $1`, [entry.gameId]
    );
    effectiveDate = game.rows[0]?.game_date?.slice(0, 10) ?? null;
  } else if (entry.bankTransactionId) {
    const bt = await client.query<{ d: string }>(
      `SELECT posted_at_utc::date::text AS d FROM bank_transactions WHERE id = $1`,
      [entry.bankTransactionId]
    );
    effectiveDate = bt.rows[0]?.d ?? null;
  }
  // Adjustments with no linked entity use today's date — always after cutoff

  const settings = await client.query<{ cutoff_date: string | null }>(
    `SELECT cutoff_date::text FROM settings WHERE id = 1`
  );
  const cutoffDate = settings.rows[0]?.cutoff_date?.slice(0, 10) ?? null;

  const isAfterCutoff = !cutoffDate || !effectiveDate || effectiveDate >= cutoffDate;

  if (isAfterCutoff) {
    await client.query("UPDATE players SET current_balance_cents = current_balance_cents + $1, updated_at = NOW() WHERE id = $2", [
      entry.amountCents,
      entry.playerId
    ]);
  }
}
