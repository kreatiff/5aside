import { parseArgs } from "node:util";
import { authenticator } from "otplib";
import { hashPassword } from "../services/auth.js";
import { pool } from "../db/pool.js";

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      password: { type: "string" }
    }
  });

  if (!values.email || !values.password) {
    console.error("Usage: tsx create-admin.ts --email <email> --password <password>");
    process.exit(1);
  }

  const hashedPassword = await hashPassword(values.password);
  const mfaSecret = authenticator.generateSecret();
  
  const otpauth = authenticator.keyuri(values.email, "5-a-Side Admin", mfaSecret);

  try {
    const result = await pool.query(
      `INSERT INTO admins (email, password_hash, totp_secret_enc, role)
       VALUES ($1, $2, $3, 'owner')
       RETURNING id`,
      [values.email, hashedPassword, mfaSecret]
    );

    console.log(`✅ Admin created with ID: ${result.rows[0]!.id}`);
    console.log(`\n🔐 ACTION REQUIRED: Set up MFA for this admin.`);
    console.log(`Scan the following URI in Google Authenticator or Authy:\n`);
    console.log(otpauth);
    console.log(`\nOr enter the secret manually: ${mfaSecret}\n`);
  } catch (err: any) {
    if (err.code === "23505") { // unique constraint violation
      console.error(`❌ Admin with email ${values.email} already exists.`);
    } else {
      console.error(`❌ Error creating admin:`, err);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
