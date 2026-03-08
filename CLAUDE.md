# 5-a-Side Attendance & Payments — Claude Context

## Project Summary

Admin-only attendance/payment reconciliation app for a 5-a-side football league.
Single-tenant, single-currency, admin-only (no player self-service in v1).

Features: player management, game attendance tracking, bank CSV/webhook imports, Facebook webhook
imports, reconciliation queue, ledger-based accounting, per-game fee snapshots, dashboard.

---

## Monorepo Structure (npm workspaces, Node >=20)

```
apps/api/            Fastify 5 API + PostgreSQL (TypeScript)
apps/web/            React 19 + Vite 7 admin frontend (TypeScript)
packages/contracts/  Shared Zod schemas + inferred types
packages/recon/      Pure TS: name normalization, matching, CSV parsing
apps/api/migrations/ node-pg-migrate migration files (JS)
```

---

## Tech Stack

| Layer      | Choice                                                                |
| ---------- | --------------------------------------------------------------------- |
| Backend    | Fastify 5, TypeScript 5.8, Node >=20                                  |
| Database   | PostgreSQL, node-pg-migrate, raw parameterized SQL (no ORM)           |
| Auth       | JWT (`@fastify/jwt`), HttpOnly refresh cookies, TOTP (otplib), Argon2 |
| Validation | Zod — shared via `@fiveaside/contracts`                               |
| Frontend   | React 19, Vite 7, React Router 7, TanStack Query 5, Axios             |
| Testing    | Vitest                                                                |
| Deploy     | Docker Compose (API container serves web build on :4000)              |

---

## Key Scripts (from repo root)

```bash
npm run dev:api        # tsx watch — Fastify on :5170
npm run dev:web        # Vite dev server — proxies /api to :5170
npm run build          # Build all (contracts + recon first, then api, then web)
npm run test           # Vitest across all packages
npm run typecheck      # tsc across all packages
npm run lint           # ESLint

npm run db:migrate     # Run pending migrations
npm run db:seed        # Seed test data
npm run db:create-admin
```

---

## Critical Domain Rules

### Fee Snapshot (immutable — NEVER backfill)

- `settings.current_game_fee_cents` is a global default used **only at game creation**.
- Each game stores its own `games.fee_cents` snapshot at creation/import time.
- Changing the global fee **never** updates existing games.
- Charges always use `games.fee_cents` — never the current global setting.
- `games.fee_cents` is **locked** (API rejects edits) once any charge ledger entry exists for the game.

### Money

- All values are **integer cents** — no floats anywhere.
- DB stores UTC; UI renders in configured app timezone.

### Attendance / Chargeable

- Only `going` status is chargeable (`isChargeableStatus` in `packages/recon`).
- Partial and overpayments are allowed.
- Balance = sum of ledger entries, cached in `players.current_balance_cents`.

### Auth

- Login → password verify → MFA TOTP → short-lived JWT + refresh token (HttpOnly cookie).
- Refresh tokens rotate on use and are revoked on logout.
- All routes except `/api/auth/*` and `/health` require `Authorization: Bearer <token>`.

---

## Architecture Patterns

### API (`apps/api/src/`)

- **No ORM** — raw parameterized SQL via `query<T>()` helper (`src/db/`).
- Routes: `src/routes/<feature>.ts` — async function receiving `FastifyInstance`.
- Auth middleware: `src/middleware/auth.ts` → `app.requireAuth` preHandler hook.
- Business logic in `src/services/` (fees, auth, bank imports, ledger).
- Utilities: `src/utils/` (`parseBody`, `parseUuidParam`, mappers).
- Environment validated by Zod at startup in `src/config.ts`.
- Errors via Fastify Sensible: `reply.unauthorized()`, `reply.notFound()`, `reply.badRequest()`.
- Webhook security: `x-webhook-secret` header checked against config.

### Web (`apps/web/src/`)

- Page-per-route in `src/pages/`, shared layout in `src/components/Layout.tsx`.
- Auth state in `src/contexts/AuthContext.tsx` — JWT stored in a module variable, not localStorage.
- Axios client in `src/lib/api.ts` — intercepts 401 → silent refresh → retry.
- `ProtectedRoute` wraps all authenticated routes in `src/router.tsx`.

### Shared Packages

- **contracts** — Zod schemas + `z.infer<>` types. Import from `@fiveaside/contracts`.
- **recon** — `normalizeName`, `matchPlayerByAlias`, `isChargeableStatus`, `parseCsvLines`.
  Import from `@fiveaside/recon`.

---

## Transaction-to-Player Matching (`packages/recon`)

Matching runs during bank CSV import, bank webhook, and Facebook attendance webhook.
Entry point: `matchPlayerByAlias(rawDescription, candidates)`.

### Candidates always include

1. All active `players.display_name` values — every player is matchable without explicit aliases.
2. All rows from `player_aliases`.

Both are loaded from the DB as `MatchCandidate[]` (`{ playerId, aliasRaw }`) before calling the matcher.

### Algorithm (in priority order)

1. **Spaceless substring match** — strips all non-alphanumeric chars from both the description
   and each alias, then checks if the alias string is contained within the description string.
   Requires alias length ≥ 4 chars to avoid false positives.
   When multiple candidates match, the **longest alias wins** (most specific).
   → `confidence: 1.0`, reason: `exact_substring_match`

2. **Token intersection** — splits both sides on whitespace and filters stop words
   (`payment`, `from`, `ref`, `transfer`, `osko`, `internet`, `credit`, etc.).
   Counts how many alias tokens appear in the description.
   Viability rules:
   - 1-word alias: the matching token must be ≥ 4 chars.
   - Multi-word alias: ≥ 2 tokens match, **OR** 1 token matches and it is ≥ 5 chars.
     → `confidence: 0.85`, reason: `token_intersection_match`

3. **No match** — `matched: false`. The candidate with the highest token overlap (even if not
   viable) is still returned as `playerId`. Callers store this in `reconciliation_queue.suggested_player_id`
   so admins get a useful starting point when resolving items manually.

### Retroactive matching

When aliases are added or updated, call:

- `rescanPendingTransactionsForPlayer(client, playerId)` — re-attempts matching for a single player
  against all open bank transaction queue items.
- `rescanAllPendingTransactions(client)` — same but for all players.

Both are in `apps/api/src/services/bank-import.ts`.

### Common failure cases — fix by adding an alias

- Initials: `"J Smith"` → add alias `"J Smith"` for the player.
- Nicknames: `"Jonno"` → add alias for the player.
- Single surname: `"Smith"` → add alias `"Smith"` if unambiguous in the league.

---

## Data Model (key tables)

```
admins, admin_refresh_tokens
players, player_aliases
settings (singleton row), fee_change_log
games, attendance
bank_transactions
ledger_entries  (type: charge | payment | adjustment)
imports
reconciliation_queue
```

All money: integer cents. All timestamps: UTC.

---

## API Endpoints

```
POST  /api/auth/login                       public
POST  /api/auth/mfa/verify                  public
POST  /api/auth/refresh                     cookie
POST  /api/auth/logout                      auth

GET   /api/players                          auth
POST  /api/players                          auth
GET   /api/players/:id                      auth
PATCH /api/players/:id                      auth
POST  /api/players/:id/aliases              auth

GET   /api/games                            auth
POST  /api/games                            auth  (snapshots fee at creation)
GET   /api/games/:id                        auth
PATCH /api/games/:id                        auth  (fee locked after first charge)
POST  /api/games/:id/attendance/import      auth

POST  /api/imports/bank-csv                auth
POST  /api/webhooks/facebook-attendance    x-webhook-secret
POST  /api/webhooks/bank-transactions      x-webhook-secret
POST  /api/webhooks/bank-pocketsmith      x-webhook-secret
GET   /api/bank-transactions              auth
GET   /api/reconciliation-queue            auth
POST  /api/reconciliation-queue/:id/resolve auth

POST  /api/ledger/adjustments              auth

GET   /api/settings                        auth
PATCH /api/settings/game-fee               auth  (also writes fee_change_log)
GET   /health                              public
```

---

## Testing

- Fee snapshot logic: `apps/api/src/services/fees.test.ts`
- Name matching: `packages/recon/test/matching.test.ts`
- Run all: `npm run test` + `npm run typecheck`
- Integration/E2E tests: still pending.

---

## Project Status (as of 2026-02-28)

**Done:** Full backend API, 3 DB migrations, contracts package, recon package with tests,
frontend scaffolding (router, auth context, login/MFA pages, page stubs for all other routes).

**Pending:** Frontend page implementations, Docker/Compose, integration + E2E tests,
backup/restore workflow, Google Sheets migration tooling.

DISTILLED_AESTHETICS_PROMPT = """
<frontend_aesthetics>
You tend to converge toward generic, "on distribution" outputs. In frontend design, this creates what users call the "AI slop" aesthetic. Avoid this: make creative, distinctive frontends that surprise and delight. Focus on:

Typography: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics.

Color & Theme: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes. Draw from IDE themes and cultural aesthetics for inspiration.

Motion: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions.

Backgrounds: Create atmosphere and depth rather than defaulting to solid colors. Layer CSS gradients, use geometric patterns, or add contextual effects that match the overall aesthetic.

Avoid generic AI-generated aesthetics:

- Overused font families (Inter, Roboto, Arial, system fonts)
- Clichéd color schemes (particularly purple gradients on white backgrounds)
- Predictable layouts and component patterns
- Cookie-cutter design that lacks context-specific character

Interpret creatively and make unexpected choices that feel genuinely designed for the context. Vary between light and dark themes, different fonts, different aesthetics. You still tend to converge on common choices (Space Grotesk, for example) across generations. Avoid this: it is critical that you think outside the box!
</frontend_aesthetics>
"""
