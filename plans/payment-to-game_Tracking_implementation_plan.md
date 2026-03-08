# Payment-to-Game Tracking Feature

## Problem

Payments in the ledger are linked to players (via `bank_transaction_id`) but **not to specific games**. Charges are linked to games (via `game_id` + `attendance_id`), but payments just credit the player's overall balance. There is currently no UI to see "has Player X paid for Game Y?"

## Solution

Build a **FIFO (first-in-first-out) pairing engine** that virtually maps payments to game charges chronologically, and surface that data in multiple UI views. **No new database tables or migrations needed** — the pairing is computed on-the-fly from existing `ledger_entries`.

---

## Proposed Changes

### Backend: FIFO Pairing Engine

#### [NEW] [payment-pairing.ts](file:///h:/dev/5aside/apps/api/src/services/payment-pairing.ts)

Pure-logic service with **no DB access** — takes arrays of charges and payments, returns pairing results. This enables easy unit testing.

**Core algorithm:**
1. Sort a player's `charge` entries by game date ascending (oldest first)
2. Sort their `payment` entries by `created_at` ascending (oldest first)
3. Walk through charges; for each charge, consume available payment capacity:
   - If payment capacity ≥ charge → mark **paid**, reduce capacity
   - If payment capacity > 0 but < charge → mark **partial**, note amounts
   - If no payment capacity → mark **unpaid**

**Types exported:**
```ts
type ChargeEntry = {
  gameId: string;
  attendanceId: string;
  playerId: string;
  amountCents: number;   // positive (the fee)
  gameDate: string;       // for sorting
};

type PaymentEntry = {
  playerId: string;
  amountCents: number;   // positive (abs value of the negative ledger entry)
  createdAt: string;      // for sorting
};

type GamePaymentStatus = 'paid' | 'partial' | 'unpaid';

type PlayerGamePairing = {
  playerId: string;
  gameId: string;
  chargeCents: number;
  paidCents: number;
  status: GamePaymentStatus;
};
```

**Exported function:**
```ts
export function pairPaymentsToCharges(
  charges: ChargeEntry[],
  payments: PaymentEntry[]
): PlayerGamePairing[];
```

---

#### [NEW] [payment-pairing.test.ts](file:///h:/dev/5aside/apps/api/src/services/payment-pairing.test.ts)

Unit tests for the pairing logic covering:
- Single charge, single exact payment → `paid`
- Single charge, no payments → `unpaid`
- Single charge, partial payment → `partial`
- Multiple charges, one large payment covering all → all `paid`
- Multiple charges, one payment covering some → mixed `paid`/`unpaid`
- Overpayment (more paid than charged) → all `paid`, excess ignored
- Empty inputs (no charges, no payments)

---

### Backend: API Routes

#### [MODIFY] [games.ts](file:///h:/dev/5aside/apps/api/src/routes/games.ts)

**New endpoint: `GET /api/games/:id/payment-status`**

Returns per-player payment status for a specific game:

1. Fetch all chargeable attendees for the game
2. For each attendee, fetch their full ledger history (all charges + payments)
3. Run `pairPaymentsToCharges()` for each player
4. Extract the entry matching this `gameId` and return

Response shape:
```json
{
  "gameId": "...",
  "feeCents": 1000,
  "playerStatuses": [
    { "playerId": "...", "displayName": "John", "chargeCents": 1000, "paidCents": 1000, "status": "paid" },
    { "playerId": "...", "displayName": "Sarah", "chargeCents": 1000, "paidCents": 500, "status": "partial" },
    { "playerId": "...", "displayName": "Mike", "chargeCents": 1000, "paidCents": 0, "status": "unpaid" }
  ],
  "summary": {
    "totalExpectedCents": 3000,
    "totalPaidCents": 1500,
    "paidCount": 1,
    "partialCount": 1,
    "unpaidCount": 1
  }
}
```

**SQL approach:** Two queries:
1. Get all chargeable attendance for the game (inner join players for display_name)
2. For each player with a charge, fetch ALL their charges + payments (respecting cutoff_date) to run FIFO pairing, then filter for just this game's result


#### [NEW] [payment-matrix.ts](file:///h:/dev/5aside/apps/api/src/routes/payment-matrix.ts)

**New endpoint: `GET /api/payment-matrix`**

Returns the full heatmap grid data — every active player × every game — with payment status per cell.

Query params: `?months=3` (default 3, how far back to go)

1. Fetch all games in date range, ordered by date ascending
2. Fetch all active players
3. Fetch all charge + payment ledger entries for those players
4. For each player, run `pairPaymentsToCharges()` once to get all game pairings
5. Build matrix

Response shape:
```json
{
  "games": [
    { "id": "...", "gameDate": "2026-03-01", "feeCents": 1000 },
    { "id": "...", "gameDate": "2026-03-08", "feeCents": 1500 }
  ],
  "players": [
    {
      "id": "...",
      "displayName": "John",
      "cells": [
        { "gameId": "...", "status": "paid", "chargeCents": 1000, "paidCents": 1000 },
        { "gameId": "...", "status": "unpaid", "chargeCents": 1500, "paidCents": 0 }
      ]
    }
  ]
}
```

> [!NOTE]
> Players who didn't attend a game will have `null` in that cell position (no attendance record = not applicable). This is different from `"unpaid"` where they attended but haven't paid.

**Register the route** in `apps/api/src/index.ts` alongside the other route registrations.

---

#### [MODIFY] [games.ts routes — GET /api/games](file:///h:/dev/5aside/apps/api/src/routes/games.ts)

Add a subquery to the games list query to include `outstanding_cents` per game:

```sql
(SELECT COALESCE(SUM(le.amount_cents), 0)::text
 FROM ledger_entries le
 WHERE le.game_id = g.id) AS net_balance_cents
```

This gives us the net balance per game (charges are positive, payments on charges don't exist directly — but the total charges for the game are already calculable). We'll compute outstanding as `sum of charges for game - (count of fully-paid charges × fee)`. Actually, since payments aren't linked to games, the simpler approach is to return the charge count and total charge amount, and let the payment-status endpoint handle the detailed pairing.

**Simpler approach:** Just add `total_charge_cents` to the games list:
```sql
(SELECT COALESCE(SUM(amount_cents), 0)::text
 FROM ledger_entries
 WHERE game_id = g.id AND type = 'charge') AS total_charge_cents
```

The frontend can then call the payment matrix endpoint to get the paid amounts — or we add a lightweight summary in a batch.

> [!IMPORTANT]
> **Decision:** For the games list "Outstanding" column, we'll add a **new batch payment-status endpoint** OR compute it inside the payment-matrix endpoint and let the frontend use that data. The simplest approach is to add the total charges per game in the existing query, then let the frontend cross-reference from the matrix data. An alternative is a dedicated `GET /api/games/payment-summary` endpoint that returns just `{ gameId, totalChargeCents, totalPaidCents }[]` for all games. **I'll go with the batch approach** via the payment-matrix endpoint since we're building that anyway.

---

### Frontend: Game Detail Page

#### [MODIFY] [GameDetailPage.tsx](file:///h:/dev/5aside/apps/web/src/pages/GameDetailPage.tsx)

1. **New query**: Fetch `GET /api/games/:id/payment-status` alongside the game detail
2. **Payment Summary Card**: Add a new card in the `grid-2` section showing:
   - Expected total, received total, outstanding total
   - Progress bar: percentage collected
   - Counts: X paid, Y partial, Z unpaid
3. **Payment Status Column**: Add to the attendance DataTable:
   - Column renders a `StatusBadge`:
     - `paid` → green badge with "Paid"
     - `partial` → yellow badge with "Partial ($X/$Y)"
     - `unpaid` → red badge with "Unpaid"

---

### Frontend: Games List Page

#### [MODIFY] [GamesPage.tsx](file:///h:/dev/5aside/apps/web/src/pages/GamesPage.tsx)

Add a new column **"Collected"** to the `columns` array that shows a compact indicator:
- Fetch payment summary from payment-matrix endpoint (or pass down from a combined query)
- Show as `$30/$50` with color-coded text (green if fully collected, yellow if partial, red if 0)
- Alternatively show a mini progress bar in the cell

> [!NOTE]
> To avoid loading the full payment matrix just for the games list, we can add an optional `?summary=true` query param to `GET /api/payment-matrix` that returns just per-game totals. Or simpler: add summary stats directly to the `GET /api/games` response.

**Decided approach:** Add a paymentSummary field to the `GET /api/games` list response using a subquery that calculates total charges per game. The "paid" portion is harder without FIFO, so we'll use a simpler heuristic on the list page: show **charge count × fee** as expected, and the FIFO detail is only on the game detail/matrix pages.

---

### Frontend: Payment Matrix (Heatmap) Page

#### [NEW] [PaymentMatrixPage.tsx](file:///h:/dev/5aside/apps/web/src/pages/PaymentMatrixPage.tsx)

A new top-level page, accessible from the sidebar/nav.

**Layout:**
- Sticky left column with player names
- Horizontal scroll for game date columns
- Each cell is color-coded:
  - 🟢 Green (`paid`): `background: rgba(34, 197, 94, 0.25)`
  - 🟡 Yellow (`partial`): `background: rgba(245, 158, 11, 0.25)`
  - 🔴 Red (`unpaid`): `background: rgba(239, 68, 68, 0.25)`
  - ⬜ Grey (`null`/not attended): `background: transparent`
- Hovering a cell shows a tooltip with `"$X / $Y paid"`
- Clicking a cell navigates to the game detail page
- Months selector at top (default: last 3 months)
- Summary row at bottom showing per-game collection percentage

#### [MODIFY] [router.tsx](file:///h:/dev/5aside/apps/web/src/router.tsx)

Add route: `{ path: "/payments", element: <PaymentMatrixPage /> }`

#### [MODIFY] [Layout.tsx](file:///h:/dev/5aside/apps/web/src/components/Layout.tsx)

Add "Payments" nav item to the sidebar with the `DollarSign` icon from lucide-react. Position it after "Games" in the nav order.

#### [NEW] CSS additions in [index.css](file:///h:/dev/5aside/apps/web/src/index.css)

- `.payment-matrix` — the grid container
- `.payment-matrix__header-cell` — sticky header for date columns
- `.payment-matrix__player-cell` — sticky left column
- `.payment-matrix__cell` — individual cell with hover, transition, border-radius
- `.payment-matrix__cell--paid`, `--partial`, `--unpaid`, `--absent` variants
- `.payment-matrix__tooltip` — hover tooltip
- `.payment-summary-card` — the summary card on game detail
- `.payment-progress-bar` — the progress bar component

---

## Verification Plan

### Unit Tests

**File:** `apps/api/src/services/payment-pairing.test.ts`

Run with:
```bash
cd h:\dev\5aside && npm run test -- --run apps/api/src/services/payment-pairing.test.ts
```

Test cases:
1. Single player, 1 charge ($10), 1 payment ($10) → `paid`
2. Single player, 1 charge ($10), 0 payments → `unpaid`
3. Single player, 1 charge ($10), 1 payment ($5) → `partial`, paidCents=500
4. Single player, 3 charges ($10 each), 1 payment ($25) → two `paid`, one `partial` ($5)
5. Single player, 2 charges ($10 each), 1 payment ($30) → two `paid` (excess ignored)
6. Multiple players, independent pairing
7. Empty charges array → empty result
8. Empty payments array → all `unpaid`

### Manual Browser Verification

After implementation, test visually via `npm run dev:api` + `npm run dev:web`:

1. **Game Detail Page**: Navigate to a game with attendees → verify Payment Summary card shows correct counts and progress bar, and the attendance table has a "Payment Status" column with colored badges
2. **Payment Matrix Page**: Navigate to `/payments` → verify the heatmap renders with player rows and game columns, cells are colored correctly, tooltips work on hover, and clicking navigates to game detail
3. **Games List Page**: Navigate to `/games` → verify the "Collected" column appears with amounts for each game

> [!TIP]
> Testing will be easier with existing seed data. Run `npm run db:seed` first to populate test data if needed.
