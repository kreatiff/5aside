/** @type {import("node-pg-migrate").MigrationBuilder} */
export const shorthands = undefined;

export function up(pgm) {
  pgm.sql(`
    -- Settings: global venue game fee default ($150)
    ALTER TABLE settings ADD COLUMN IF NOT EXISTS venue_game_fee_cents INTEGER NOT NULL DEFAULT 15000;

    -- Games: per-game venue fee (nullable = pre-tracking, always editable)
    ALTER TABLE games ADD COLUMN IF NOT EXISTS venue_fee_cents INTEGER DEFAULT NULL;

    -- Bank transactions: support outgoing + venue categorization
    ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS is_outgoing BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS venue_category TEXT DEFAULT NULL
      CHECK (venue_category IN ('game_fees', 'equipment'));
  `);
}

export function down(pgm) {
  pgm.sql(`
    ALTER TABLE bank_transactions DROP COLUMN IF EXISTS venue_category;
    ALTER TABLE bank_transactions DROP COLUMN IF EXISTS is_outgoing;
    ALTER TABLE games DROP COLUMN IF EXISTS venue_fee_cents;
    ALTER TABLE settings DROP COLUMN IF EXISTS venue_game_fee_cents;
  `);
}
