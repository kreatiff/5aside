import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres:cur8qwe4AXC3kmx@192.168.1.76:5432/5aside'
});

await client.connect();

// Find all pending games that have attendance records (should be synced)
const stuck = await client.query(`
  SELECT g.id, g.game_date::text, g.status, COUNT(a.id)::int AS attendance_count
  FROM games g
  LEFT JOIN attendance a ON a.game_id = g.id
  WHERE g.status = 'pending'
  GROUP BY g.id, g.game_date, g.status
  ORDER BY g.game_date DESC
`);

console.log('\n=== Pending games and their attendance counts ===');
console.table(stuck.rows);

const toFix = stuck.rows.filter(r => r.attendance_count > 0);
if (toFix.length === 0) {
  console.log('\nNo pending games with existing attendance found. Nothing to fix.');
} else {
  console.log(`\n${toFix.length} game(s) have attendance records but are stuck on 'pending':`);
  toFix.forEach(r => console.log(`  - ${r.game_date} (${r.id}) — ${r.attendance_count} attendees`));

  const ids = toFix.map(r => r.id);
  const fix = await client.query(`
    UPDATE games SET status = 'synced', updated_at = NOW()
    WHERE id = ANY($1) AND status = 'pending'
    RETURNING id, game_date::text, status
  `, [ids]);

  console.log('\n✅ Fixed games:');
  console.table(fix.rows);
}

await client.end();
