import { pool } from "../db/pool.js";

async function run() {
  const result = await pool.query("SELECT email, totp_secret_enc FROM admins");
  console.log(JSON.stringify(result.rows, null, 2));
  await pool.end();
}

run().catch(console.error);
