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
  const defaultFee = process.env.DEFAULT_GAME_FEE_CENTS || 1000;
  pgm.sql(`
    UPDATE settings
    SET current_game_fee_cents = ${defaultFee}, updated_at = NOW()
    WHERE id = 1;
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.sql(`
    UPDATE settings
    SET current_game_fee_cents = 1000, updated_at = NOW()
    WHERE id = 1;
  `);
};
