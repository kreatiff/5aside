# Database Agents Instructions

This file outlines the database conventions, tooling, and data model logic to adhere to when modifying database migrations or writing queries in `apps/api/src/db/`.

## Tooling

- **Database Engine:** PostgreSQL
- **Migrations:** Managed via `node-pg-migrate` (files exist in `apps/api/migrations/`).
- **Data Access:** No ORMs (e.g., Prisma, TypeORM, Sequelize) are permitted in this project. All queries must use raw, parameterized SQL via the project's custom `query<T>()` utility.

## Key Tables

Below are the critical tables forming the data model for the application:

- `admins`
- `admin_refresh_tokens`
- `players`
- `player_aliases`
- `settings` (singleton row, used for global settings)
- `fee_change_log`
- `games`
- `attendance`
- `bank_transactions`
- `ledger_entries` (type enum: `charge`, `payment`, or `adjustment`)
- `imports`
- `reconciliation_queue`

## Mandatory Data Conventions

### No Floating Points

- **Strictly use integer cents.** This applies to any column storing monetary values, including:
  - `games.fee_cents`
  - `players.current_balance_cents`
  - `settings.current_game_fee_cents`
  - Values processed in `ledger_entries` and `bank_transactions`

### Timestamp Conventions

- **Strictly store times in UTC.** Do not save localized times in the database.

## Critical Data Handling Rules

- **Game Fee Snapshots:**
  - `settings.current_game_fee_cents` is a default, only referenced when inserting a new row into `games`.
  - The value must be copied to `games.fee_cents`.
  - Do NOT modify existing games if the global fee is updated.
- **Ledger & Balances:**
  - A player's cached balance in `players.current_balance_cents` is merely the aggregate sum of their `ledger_entries`.
  - When writing adjustments, payments, or charges, ensure the ledger entry directly references the relevant IDs (player ID, game ID, etc.).
- **Manual Adjustments:** The `POST /api/transactions/manual` endpoint creates a `bank_transactions` record and (optionally) a `ledger_entries` record atomically. The `source_ref` for these is set to `'manual'`.
