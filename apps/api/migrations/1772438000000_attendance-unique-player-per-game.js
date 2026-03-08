/** @type {import("node-pg-migrate").MigrationBuilder} */
export const shorthands = undefined;

/**
 * This migration was applied directly to the database on 2026-03-02.
 * Adding the local file retroactively so node-pg-migrate history is coherent.
 *
 * Adds a UNIQUE constraint on (game_id, player_id) in attendance to prevent
 * duplicate attendance records for the same player in the same game.
 */
export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE attendance
      ADD CONSTRAINT uq_attendance_game_player UNIQUE (game_id, player_id);
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    ALTER TABLE attendance
      DROP CONSTRAINT IF EXISTS uq_attendance_game_player;
  `);
};
