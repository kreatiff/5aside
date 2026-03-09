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
  pgm.addColumns('bank_transactions', {
    import_id: {
      type: 'uuid',
      references: '"imports"',
      onDelete: 'SET NULL',
    },
  });

  pgm.addColumns('attendance', {
    import_id: {
      type: 'uuid',
      references: '"imports"',
      onDelete: 'SET NULL',
    },
  });

  pgm.addColumns('reconciliation_queue', {
    import_id: {
      type: 'uuid',
      references: '"imports"',
      onDelete: 'SET NULL',
    },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropColumns('reconciliation_queue', ['import_id']);
  pgm.dropColumns('attendance', ['import_id']);
  pgm.dropColumns('bank_transactions', ['import_id']);
};
