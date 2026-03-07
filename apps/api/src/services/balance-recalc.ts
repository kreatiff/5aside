import type { PoolClient } from "pg";

export async function recalculateAllBalances(
  client: PoolClient,
  cutoffDate: string | null
): Promise<void> {
  const cutoffFilter = cutoffDate
    ? `AND COALESCE(g.game_date, bt.posted_at_utc::date, le.created_at::date) >= $1`
    : "";
  const params = cutoffDate ? [cutoffDate] : [];

  // Update players who have qualifying ledger entries
  await client.query(
    `UPDATE players p
     SET current_balance_cents = sub.total,
         updated_at = NOW()
     FROM (
       SELECT le.player_id,
              COALESCE(SUM(le.amount_cents), 0)::int AS total
       FROM ledger_entries le
       LEFT JOIN games g ON g.id = le.game_id
       LEFT JOIN bank_transactions bt ON bt.id = le.bank_transaction_id
       WHERE 1=1 ${cutoffFilter}
       GROUP BY le.player_id
     ) sub
     WHERE p.id = sub.player_id`,
    params
  );

  // Zero out players with no qualifying ledger entries
  await client.query(
    `UPDATE players
     SET current_balance_cents = 0, updated_at = NOW()
     WHERE id NOT IN (
       SELECT DISTINCT le.player_id
       FROM ledger_entries le
       LEFT JOIN games g ON g.id = le.game_id
       LEFT JOIN bank_transactions bt ON bt.id = le.bank_transaction_id
       WHERE 1=1 ${cutoffFilter}
     )
     AND current_balance_cents != 0`,
    params
  );
}
