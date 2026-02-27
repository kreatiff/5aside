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

  await client.query("UPDATE players SET current_balance_cents = current_balance_cents + $1, updated_at = NOW() WHERE id = $2", [
    entry.amountCents,
    entry.playerId
  ]);
}
