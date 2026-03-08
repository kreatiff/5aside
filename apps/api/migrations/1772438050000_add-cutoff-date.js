/** @type {import("node-pg-migrate").MigrationBuilder} */
export const shorthands = undefined;

export const up = (pgm) => {
  pgm.sql(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS cutoff_date DATE DEFAULT NULL`);
};

export const down = (pgm) => {
  pgm.sql(`ALTER TABLE settings DROP COLUMN cutoff_date`);
};
