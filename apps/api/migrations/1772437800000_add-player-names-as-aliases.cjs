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
    INSERT INTO player_aliases (player_id, source, alias_raw, alias_normalized)
    SELECT
      id,
      'system',
      display_name,
      LOWER(REGEXP_REPLACE(display_name, '[^a-z0-9]', '', 'g'))
    FROM players
    WHERE NOT EXISTS (
      SELECT 1 FROM player_aliases pa
      WHERE pa.player_id = players.id
      AND pa.source = 'system'
    )
    ON CONFLICT (player_id, source, alias_normalized) DO NOTHING;
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.sql(`
    DELETE FROM player_aliases
    WHERE source = 'system';
  `);
};
