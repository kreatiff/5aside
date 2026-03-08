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
    DELETE FROM player_aliases
    WHERE id NOT IN (
      SELECT DISTINCT ON (player_id, source, alias_normalized) id
      FROM player_aliases
      ORDER BY player_id, source, alias_normalized, created_at ASC
    );
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  // DOWN is a no-op: we cannot restore deleted duplicate aliases without
  // the original creation timestamps and metadata. Down migrations should
  // generally be avoided for destructive operations like this.
  pgm.sql(`SELECT 1;`);
};
