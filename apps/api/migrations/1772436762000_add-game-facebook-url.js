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
  pgm.sql(`
ALTER TABLE games ADD COLUMN IF NOT EXISTS facebook_event_url TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_games_facebook_event_url
  ON games(facebook_event_url) WHERE facebook_event_url IS NOT NULL;
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.sql(`
DROP INDEX IF EXISTS idx_games_facebook_event_url;
ALTER TABLE games DROP COLUMN IF EXISTS facebook_event_url;
  `);
};
