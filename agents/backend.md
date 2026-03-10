# Backend Agents Instructions

This file provides context and constraints for AI agents modifying the `apps/api/` backend services.

## Stack

- Fastify 5
- TypeScript 5.8
- Node >= 20
- PostgreSQL (via `pg` + `node-pg-migrate`)

## Architecture & Conventions

- **No ORM:** We strictly use raw parameterized SQL via the `query<T>()` helper located in `src/db/`.
- **Validation:** All incoming payloads must be validated using `Zod` schemas shared via the `@fiveaside/contracts` package.
- **Routing:** Routes belong in `src/routes/<feature>.ts` as an async function receiving the `FastifyInstance`.
- **Business Logic:** Logic resides in `src/services/` (e.g., fees, auth, bank imports, ledger).
- **Environment:** Validated by Zod at startup in `src/config.ts`.
- **Errors:** Use Fastify Sensible plugins (e.g., `reply.unauthorized()`, `reply.badRequest()`).
- **Webhooks:** Webhook endpoints must check the `x-webhook-secret` header against the application config.

## Money & Time Constraints

- **Cents:** ALL monetary values must be stored, manipulated, and transferred as **integer cents**. Absolutely no floating-point arithmetic.
- **Time:** All database timestamps must be stored in UTC.

## Authentication Rules

- **Flow:** Login -> Password verify -> MFA TOTP (otplib) -> Short-lived JWT + Refresh Token (HttpOnly cookie).
- **Refresh:** Tokens rotate upon use and are revoked upon logout.
- **Middleware:** `src/middleware/auth.ts` -> `app.requireAuth` preHandler hook.
- **Scope:** All routes _except_ `/api/auth/*` and `/health` require an `Authorization: Bearer <token>` header.

## Fee Snapshot Domain Rules

These rules are immutable and critical. Do not violate them.

- `settings.current_game_fee_cents` is a global default used **only at game creation**.
- Each game stores its own `games.fee_cents` snapshot at creation/import time.
- Changing the global fee **never** updates existing games.
- Charges always use `games.fee_cents` — never the current global setting.
- `games.fee_cents` is **locked** (API rejects edits) once any charge ledger entry exists for the game.

## Attendance & Charges

- Only `going` status is chargeable (checked via `isChargeableStatus` in `packages/recon`).
- Partial and overpayments are allowed.
- A player's balance is the sum of ledger entries, cached in `players.current_balance_cents`.
- **Manual Transactions:** Use `POST /api/transactions/manual` to record transactions that aren't imported from bank/Facebook. This endpoint handles atomic creation of bank transactions and (if applicable) player ledger entries.
