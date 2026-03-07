import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgresql://postgres:cur8qwe4AXC3kmx@192.168.1.76:5432/5aside' });

async function run() {
  const client = await pool.connect();
  try {
    // 1. Detail of one 3x duplicate
    console.log("=== DETAIL: Sergio Koulakov 2026-02-23 charges ===");
    const detail = await client.query(`
      SELECT le.id, le.amount_cents, le.attendance_id, le.created_at::text
      FROM ledger_entries le
      JOIN players p ON p.id = le.player_id
      JOIN games g ON g.id = le.game_id
      WHERE le.type = 'charge'
        AND p.display_name = 'Sergio Koulakov'
        AND g.game_date = '2026-02-23'
      ORDER BY le.created_at
    `);
    detail.rows.forEach(r => console.log(`  id=${r.id} | amt=${r.amount_cents} | att_id=${r.attendance_id} | created=${r.created_at}`));

    // 2. Attendance for same
    console.log("\n=== Attendance for Sergio + 2026-02-23 ===");
    const att = await client.query(`
      SELECT a.id, a.source_status, a.chargeable, a.source_ref, a.created_at::text
      FROM attendance a
      JOIN players p ON a.player_id = p.id
      JOIN games g ON a.game_id = g.id
      WHERE p.display_name = 'Sergio Koulakov' AND g.game_date = '2026-02-23'
    `);
    att.rows.forEach(r => console.log(`  id=${r.id} | status=${r.source_status} | chargeable=${r.chargeable} | ref=${r.source_ref} | created=${r.created_at}`));

    // 3. Do the duplicate charges reference the SAME attendance_id?
    console.log("\n=== Duplicate charge attendance_id patterns ===");
    const attPattern = await client.query(`
      WITH dupes AS (
        SELECT player_id, game_id
        FROM ledger_entries
        WHERE type = 'charge' AND game_id IS NOT NULL
        GROUP BY player_id, game_id
        HAVING COUNT(*) > 1
      )
      SELECT 
        COUNT(*) as total_dupe_entries,
        COUNT(*) FILTER (WHERE le.attendance_id IS NULL) as no_att_id,
        COUNT(*) FILTER (WHERE le.attendance_id IS NOT NULL) as has_att_id
      FROM ledger_entries le
      JOIN dupes d ON le.player_id = d.player_id AND le.game_id = d.game_id
      WHERE le.type = 'charge'
    `);
    console.log(JSON.stringify(attPattern.rows[0]));

    // 4. Check created_at timestamps per duplicate group
    console.log("\n=== Created timestamps for one duplicate ===");
    const ts = await client.query(`
      WITH sample AS (
        SELECT player_id, game_id
        FROM ledger_entries
        WHERE type = 'charge' AND game_id IS NOT NULL
        GROUP BY player_id, game_id
        HAVING COUNT(*) = 3
        LIMIT 1
      )
      SELECT le.created_at::text, le.attendance_id
      FROM ledger_entries le
      JOIN sample s ON le.player_id = s.player_id AND le.game_id = s.game_id
      WHERE le.type = 'charge'
      ORDER BY le.created_at
    `);
    ts.rows.forEach(r => console.log(`  ${r.created_at} | att_id=${r.attendance_id}`));

    // 5. Wrong-sign payments summary
    console.log("\n=== WRONG-SIGN PAYMENTS ===");
    const ws = await client.query(`
      SELECT COUNT(*) as count, COALESCE(SUM(amount_cents), 0) as total
      FROM ledger_entries WHERE type = 'payment' AND amount_cents > 0
    `);
    console.log(JSON.stringify(ws.rows[0]));

    // 6. Sample wrong-sign payments
    const wsSample = await client.query(`
      SELECT p.display_name, le.amount_cents as ledger, bt.amount_cents as bank, 
             LEFT(bt.description_raw, 40) as desc, le.created_at::text
      FROM ledger_entries le
      LEFT JOIN bank_transactions bt ON le.bank_transaction_id = bt.id
      JOIN players p ON le.player_id = p.id
      WHERE le.type = 'payment' AND le.amount_cents > 0
      LIMIT 5
    `);
    console.log("\nSample wrong-sign:");
    wsSample.rows.forEach(r => console.log(`  ${r.display_name} | ledger:${r.ledger} | bank:${r.bank} | ${r.desc}`));

    // 7. How many payment entries per source — legacy vs recent
    console.log("\n=== PAYMENT ENTRIES BY CREATION DATE ===");
    const paymentsByDate = await client.query(`
      SELECT 
        CASE WHEN created_at < '2026-03-01' THEN 'legacy' ELSE 'recent' END as era,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE amount_cents > 0) as positive_amt,
        COUNT(*) FILTER (WHERE amount_cents < 0) as negative_amt,
        COUNT(*) FILTER (WHERE amount_cents = 0) as zero_amt
      FROM ledger_entries
      WHERE type = 'payment'
      GROUP BY 1
    `);
    paymentsByDate.rows.forEach(r => console.log(`  ${r.era}: total=${r.total} pos=${r.positive_amt} neg=${r.negative_amt} zero=${r.zero_amt}`));

    // 8. Same for charges
    console.log("\n=== CHARGE ENTRIES BY CREATION DATE ===");
    const chargesByDate = await client.query(`
      SELECT 
        CASE WHEN created_at < '2026-03-01' THEN 'legacy' ELSE 'recent' END as era,
        COUNT(*) as total
      FROM ledger_entries
      WHERE type = 'charge'
      GROUP BY 1
    `);
    chargesByDate.rows.forEach(r => console.log(`  ${r.era}: total=${r.total}`));

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);
