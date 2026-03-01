import { pool } from "../db/pool.js";
import { hashPassword } from "../services/auth.js";
import { authenticator } from "otplib";
import { normalizeName } from "@fiveaside/recon";

async function seed() {
  console.log("🌱 Seeding database...");
  
  // Create an admin if none exist
  const adminResult = await pool.query(`SELECT id FROM admins LIMIT 1`);
  if (adminResult.rowCount === 0) {
    console.log("Creating admin user admin@example.com / password");
    const hashedPassword = await hashPassword("password");
    const mfaSecret = authenticator.generateSecret();
    await pool.query(
      `INSERT INTO admins (email, password_hash, totp_secret_enc, role) VALUES ($1, $2, $3, 'owner')`,
      ["admin@example.com", hashedPassword, mfaSecret]
    );
  }

  // Create Players
  console.log("Creating players...");
  const players = ["Alice", "Bob", "Charlie", "David", "Eve", "Frank", "Grace", "Heidi", "Ivan", "Judy"];
  const playerIds: string[] = [];
  
  for (const name of players) {
    const res = await pool.query<{ id: string }>(
      `INSERT INTO players (display_name, current_balance_cents) VALUES ($1, 0) RETURNING id`,
      [name]
    );
    const id = res.rows[0]!.id;
    playerIds.push(id);
    
    // Add aliases
    await pool.query(
      `INSERT INTO player_aliases (player_id, source, alias_raw, alias_normalized) VALUES ($1, 'facebook', $2, $3)`,
      [id, name, normalizeName(name)]
    );
  }

  // Create Games
  console.log("Creating games...");
  const gameIds: string[] = [];
  for (let i = 0; i < 20; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (i * 7)); // 1 game per week backwards
    
    const res = await pool.query<{ id: string }>(
      `INSERT INTO games (game_date, kickoff_at_utc, fee_cents, source, status) 
       VALUES ($1, $2, 1000, 'manual', 'completed') RETURNING id`,
      [d.toISOString().substring(0, 10), d.toISOString()]
    );
    gameIds.push(res.rows[0]!.id);
  }

  // Add Attendance & Charges
  console.log("Generating attendance and ledger entries...");
  for (const gameId of gameIds) {
    // Random 5-8 players per game
    const shuffled = [...playerIds].sort(() => 0.5 - Math.random());
    const attendees = shuffled.slice(0, Math.floor(Math.random() * 4) + 5);
    
    for (const playerId of attendees) {
      const attRes = await pool.query<{ id: string }>(
        `INSERT INTO attendance (game_id, player_id, source_status, chargeable) 
         VALUES ($1, $2, 'going', true) RETURNING id`,
        [gameId, playerId]
      );
      
      const attendanceId = attRes.rows[0]!.id;
      
      await pool.query(
        `INSERT INTO ledger_entries (player_id, type, amount_cents, game_id, attendance_id)
         VALUES ($1, 'charge', 1000, $2, $3)`,
        [playerId, gameId, attendanceId]
      );
      
      // Update balance
      await pool.query(`UPDATE players SET current_balance_cents = current_balance_cents + 1000 WHERE id = $1`, [playerId]);
    }
  }

  // Add some bank transactions / payments
  console.log("Generating payments...");
  for (const playerId of playerIds) {
    const txId = `txn_${Math.random().toString(36).substring(7)}`;
    const txRes = await pool.query<{ id: string }>(
      `INSERT INTO bank_transactions (external_txn_id, posted_at_utc, amount_cents, description_raw)
       VALUES ($1, NOW(), 5000, 'Payment from player') RETURNING id`,
      [txId]
    );
    
    await pool.query(
      `INSERT INTO ledger_entries (player_id, type, amount_cents, bank_transaction_id)
       VALUES ($1, 'payment', -5000, $2)`,
      [playerId, txRes.rows[0]!.id]
    );
    
    await pool.query(`UPDATE players SET current_balance_cents = current_balance_cents - 5000 WHERE id = $1`, [playerId]);
  }

  // Add a recon queue item
  console.log("Generating reconciliation queue items...");
  await pool.query(
    `INSERT INTO reconciliation_queue (item_type, source_record_id, payload, confidence, reason)
     VALUES ('attendance', $1, '{"playerName": "Unknown User", "sourceStatus": "going"}'::jsonb, 0, 'No match found')`,
    [gameIds[0]]
  );

  console.log("✅ Seed complete");
  await pool.end();
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
