/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
    // Step 1: Remove duplicate attendance rows, keeping the earliest created record
    // for each (game_id, player_id) pair.
    pgm.sql(`
    DELETE FROM attendance
    WHERE id NOT IN (
      SELECT DISTINCT ON (game_id, player_id) id
      FROM attendance
      ORDER BY game_id, player_id, created_at ASC
    );
  `);

    // Step 2: Add the unique constraint to prevent future duplicates.
    // Uses a DO block to check pg_constraint first — ADD CONSTRAINT IF NOT EXISTS
    // is not valid Postgres syntax (only CREATE INDEX supports IF NOT EXISTS).
    pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_attendance_game_player'
          AND conrelid = 'attendance'::regclass
      ) THEN
        ALTER TABLE attendance
          ADD CONSTRAINT uq_attendance_game_player UNIQUE (game_id, player_id);
      END IF;
    END;
    $$;
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
    pgm.sql(`
    ALTER TABLE attendance
    DROP CONSTRAINT IF EXISTS uq_attendance_game_player;
  `);
    // Deleted duplicate rows cannot be restored.
};
