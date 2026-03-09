# Plan

Agent-Executable Plan: 5-a-Side Attendance/Payments App (Fee Snapshot Correctness)
Summary
Build an admin-only attendance/payment reconciliation app with:

Frontend: React + Vite + TypeScript
Backend: Fastify + TypeScript
Database: PostgreSQL
Deploy: Dockerized single app container + Postgres (Compose)
Scope: players, games, attendance, payments, CSV/webhook imports, reconciliation queue, dashboards, migration from last 12 months
Progress Update (2026-02-28)
Completed in this execution cycle:

Backend/API

- Added Fastify server bootstrap and runtime entrypoint in `apps/api/src/main.ts`.
- Implemented health route:
  - GET /health
- Implemented Players routes:
  - GET /api/players
  - POST /api/players
  - GET /api/players/:id
  - PATCH /api/players/:id
  - POST /api/players/:id/aliases
- Implemented Settings routes:
  - GET /api/settings
  - PATCH /api/settings/game-fee
  - Includes fee_change_log writes and header-based admin id (`x-admin-id`) validation.
- Implemented Games/Attendance routes:
  - GET /api/games
  - POST /api/games
  - GET /api/games/:id
  - PATCH /api/games/:id
  - POST /api/games/:id/attendance/import
  - Enforced fee snapshot on game creation from settings.current_game_fee_cents.
  - Enforced fee lock once charge ledger entries exist for a game.
- Implemented Imports/Reconciliation routes:
  - POST /api/imports/bank-csv
  - POST /api/webhooks/facebook-attendance
  - POST /api/webhooks/bank-transactions
  - GET /api/reconciliation-queue
  - POST /api/reconciliation-queue/:id/resolve
  - Added webhook secret check via `x-webhook-secret`.
- Implemented Ledger route:
  - POST /api/ledger/adjustments
- Implemented Auth endpoints and session lifecycle:
  - POST /api/auth/login
  - POST /api/auth/mfa/verify
  - POST /api/auth/refresh
  - POST /api/auth/logout
  - Added JWT-backed MFA token flow and refresh-token rotation/revocation via `admin_refresh_tokens` plus secure refresh cookie handling.

Validation and Tests

- Added unit tests for fee rule helpers in `apps/api/src/services/fees.test.ts`:
  - snapshotFeeForGame
  - canEditGameFee
- Existing recon matching tests remain passing.
- Workspace validation passes:
  - `npm run test`
  - `npm run typecheck`

Tooling and Build Stability

- Added local pg typing shim (`apps/api/src/types/pg.d.ts`) for strict TypeScript compatibility.
- Updated API build/typecheck scripts to build shared workspace packages first.
- Resolved tsconfig include/rootDir mismatches for `apps/api` and `packages/recon`.
- Updated contracts test script to pass when no tests are present.

Still Pending (next milestones)

- Frontend app (`apps/web`) scaffolding and wiring to API workflows.
- Integration/E2E tests for full fee-change timeline and import->reconcile->ledger path.
- Docker/runtime composition, backup/restore flow, and migration tooling workstreams.

Critical Pricing Rule (Locked)
Global fee is a default for new games only, not retroactive.

The app has one active global fee setting (current_game_fee_cents).
Each game stores its own immutable fee snapshot (games.fee_cents) at creation/import time.
If global fee changes from 1000 to 1500 cents, previously created games keep 1000.
Charges are derived from each game’s stored fee, never from current global setting at runtime.
Existing games are not auto-updated when global fee changes.
Data Model
admins(id, email, password_hash, totp_secret_enc, role, created_at, updated_at)
players(id, display_name, active, current_balance_cents, notes, created_at, updated_at)
player_aliases(id, player_id, source, alias_raw, alias_normalized, created_at)
settings(id, current_game_fee_cents, app_timezone, updated_at)
fee_change_log(id, old_fee_cents, new_fee_cents, changed_by_admin_id, changed_at)
games(id, external_event_id, game_date, kickoff_at_utc, fee_cents, source, status, created_at, updated_at)
attendance(id, game_id, player_id, source_status, chargeable, source_ref, created_at, updated_at)
bank_transactions(id, external_txn_id, posted_at_utc, amount_cents, description_raw, source_ref, created_at, updated_at)
ledger_entries(id, player_id, type, amount_cents, game_id, attendance_id, bank_transaction_id, adjustment_reason, created_at, updated_at)
imports(id, source_type, mode, checksum, record_count, status, started_at, completed_at, error_summary)
reconciliation_queue(id, item_type, source_record_id, suggested_player_id, confidence, reason, status, resolved_by, resolved_at)
Rules:

All money fields are integer cents.
UTC timestamps in DB, local timezone rendering in UI.
Going is the only chargeable attendance status.
Partial and overpayments are allowed.
Balance is detailed ledger + cached players.current_balance_cents.
API Contract
Auth
POST /api/auth/login
POST /api/auth/mfa/verify
POST /api/auth/refresh
POST /api/auth/logout
Players
GET /api/players
POST /api/players
GET /api/players/:id
PATCH /api/players/:id
POST /api/players/:id/aliases
Games/Attendance
GET /api/games
POST /api/games
GET /api/games/:id
PATCH /api/games/:id (allowed to edit fee only before lock rule below)
POST /api/games/:id/attendance/import
Imports/Reconciliation
POST /api/imports/bank-csv
POST /api/webhooks/facebook-attendance
POST /api/webhooks/bank-transactions
GET /api/reconciliation-queue
POST /api/reconciliation-queue/:id/resolve
Ledger/Adjustments
POST /api/ledger/adjustments
Settings
GET /api/settings
PATCH /api/settings/game-fee (writes settings + fee_change_log)
Fee Handling Logic
Game creation/import flow:
Read current global fee from settings.current_game_fee_cents.
Persist it into games.fee_cents.
Charge creation flow:
For each chargeable attendance row, create ledger charge using games.fee_cents.
Fee update flow:
Update only settings.current_game_fee_cents.
Insert record in fee_change_log.
Do not modify any existing games.fee_cents.
Lock rule:
Once a game has any charge ledger entry, games.fee_cents becomes non-editable via API.
Frontend Screens
Login + MFA
Dashboard (finance + attendance charts)
Players list/profile/aliases/balance history
Games list/detail with visible per-game fee
Imports center (CSV + webhook status + history)
Reconciliation queue
Settings page with global fee and fee-change history
Agent Workstreams (Parallel)
A: DB schema/migrations + shared Zod contracts
B: Auth + admin security
C: Import/reconciliation engine
D: Frontend workflows
E: Docker/deploy/backups/monitoring
F: Migration tooling (Google Sheets -> CSV -> DB)
G: Test automation
Merge gates:

Freeze contracts + schema.
Implement backend to contracts.
Wire frontend to API.
Validate reconciliation and fee-snapshot behavior on historical data.
Complete deploy + backup/restore + E2E acceptance.
Testing and Acceptance
Required tests:

Unit
Fee snapshot logic (global update does not mutate existing games)
Reconciliation scoring/matching
Balance caching integrity
Integration
Game created before fee change remains old fee
Game created after fee change uses new fee
Import -> match -> queue -> resolve -> ledger pipeline
E2E
Admin changes fee from $10 to $15
Older game still charges $10
New game charges $15
Dashboard and player balances reflect both correctly
Acceptance criteria:

Weekly workflow runs fully in-app.
Existing games retain original fees after global updates.
Ledger integrity passes (sum(ledger) == cached balance per player).
Backup restore succeeds.
Assumptions
Single tenant, single currency, single bank account.
Multiple admin accounts, admin-only app.
No player self-service and no notifications in v1.
Imported data remains editable; adjustment reason optional.
Existing automations can provide CSV and/or webhook payloads.
