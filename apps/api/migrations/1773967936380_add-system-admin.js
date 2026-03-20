/** @type {import("node-pg-migrate").MigrationBuilder} */
export const shorthands = undefined;

export async function up(pgm) {
  pgm.sql(`
    INSERT INTO admins (id, email, password_hash, totp_secret_enc, role)
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      'system@5aside.internal',
      'DISABLED',
      'DISABLED',
      'owner'
    )
    ON CONFLICT (id) DO NOTHING;
  `);
}

export async function down(pgm) {
  pgm.sql("DELETE FROM admins WHERE id = '00000000-0000-0000-0000-000000000000'");
}
