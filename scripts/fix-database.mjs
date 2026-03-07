import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgresql://postgres:cur8qwe4AXC3kmx@192.168.1.76:5432/5aside' });

async function fix() {
  const client = await pool.connect();
  let totalDeletedDupes = 0;
  let totalFixedPayments = 0;

  try {
    await client.query("BEGIN");
    
    // 1. DEDUPLICATE CHARGES
    // For every player_id, game_id combo that has > 1 charge, keep the first one based on created_at / id, and delete the rest.
    console.log("Removing duplicate charge ledger entries...");
    const dupeResult = await client.query(`
      WITH ranked_charges AS (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY player_id, game_id ORDER BY created_at ASC, id ASC) as rn
        FROM ledger_entries
        WHERE type = 'charge'
          AND game_id IS NOT NULL
      )
      DELETE FROM ledger_entries
      WHERE id IN (
        SELECT id FROM ranked_charges WHERE rn > 1
      )
      RETURNING id;
    `);
    totalDeletedDupes = dupeResult.rowCount;
    console.log(`✅ Deleted ${totalDeletedDupes} duplicate charge entries.`);

    // 2. FIX WRONG-SIGN PAYMENTS
    console.log("\nFixing positive payment ledger entries...");
    const paymentResult = await client.query(`
      UPDATE ledger_entries
      SET amount_cents = -1 * amount_cents
      WHERE type = 'payment'
        AND amount_cents > 0
      RETURNING id;
    `);
    totalFixedPayments = paymentResult.rowCount;
    console.log(`✅ Flipped sign on ${totalFixedPayments} positive payment entries.`);

    // 3. RECALCULATE PLAYER BALANCES
    // Player balance = sum of all ledger entry amounts
    console.log("\nRecalculating player balances from corrected ledger entries...");
    const balanceResult = await client.query(`
      WITH totals AS (
        SELECT player_id, COALESCE(SUM(amount_cents), 0) as new_balance
        FROM ledger_entries
        GROUP BY player_id
      )
      UPDATE players p
      SET current_balance_cents = t.new_balance
      FROM totals t
      WHERE p.id = t.player_id
        AND p.current_balance_cents != t.new_balance;
    `);
    console.log(`✅ Corrected balance for ${balanceResult.rowCount} players.`);

    // Update players with no ledger entries to 0 balance just in case
    const resetResult = await client.query(`
      UPDATE players
      SET current_balance_cents = 0
      WHERE id NOT IN (SELECT player_id FROM ledger_entries);
    `);
    if (resetResult.rowCount > 0) {
      console.log(`✅ Reset balance to 0 for ${resetResult.rowCount} players with no ledger activity.`);
    }

    await client.query("COMMIT");
    console.log("\n🚀 All done! Database successfully repaired.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Error occurred, rolled back changes:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

fix().catch(console.error);
