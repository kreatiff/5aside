/** @type {import("node-pg-migrate").MigrationBuilder} */
exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE settings ADD COLUMN cutoff_date DATE DEFAULT NULL`);
};

exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE settings DROP COLUMN cutoff_date`);
};
