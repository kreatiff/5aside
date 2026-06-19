# Manual Game Sync — Design Spec

- **Date:** 2026-06-19
- **Status:** Implemented
- **Scope:** Frontend + one additive API response field

## Summary

Add a **"Sync from Facebook"** button to `GameDetailPage` that triggers the n8n
workflow to scrape that game's Facebook event and import attendance, showing
progress and a result report in a modal. Reuses the existing browser→n8n pattern
(the "Sync from Bank" button) and the existing `POST /api/webhooks/facebook-attendance`
endpoint. The webhook response gains two additive fields (`players`, `unmatched`)
so the modal can name who was synced; no DB, schema, or dependency changes.

## Decisions (from brainstorming)

| Decision | Choice |
| --- | --- |
| Transport | Browser → n8n directly (matches `TransactionsPage` bank sync) |
| Payload | `POST` JSON body `{ gameId, facebook_event_url }` (field names match the n8n nodes) |
| Feedback | Synchronous; **modal** with a spinner then a report (counts + player names) |
| Placement | `GameDetailPage` only, inside the "Import Facebook Poll" card |
| n8n URL | `https://n8n.dominus.casa/webhook/3ed0312a-f102-4278-9f8c-2d2215ad79de` |

## Frontend changes — `apps/web/src/pages/GameDetailPage.tsx`

Module-level constant:

```ts
const GAME_SYNC_WEBHOOK_URL =
  "https://n8n.dominus.casa/webhook/3ed0312a-f102-4278-9f8c-2d2215ad79de";
```

Pure, unit-testable helpers (kept separate so the wiring stays thin):

- `canSyncGame(game)` → `boolean` — `game.facebookEventUrl` is non-empty **and**
  `game.status !== "cancelled"`.
- `buildGameSyncBody(gameId, eventUrl)` → `{ gameId, facebook_event_url }` —
  the JSON body POSTed to n8n (field names match the workflow's nodes).

Handler `handleSyncFromFacebook()` — drives a modal (`isSyncModalOpen`,
`syncResult`, `syncError`):

1. Guard on `canSyncGame`; open the modal, `setIsSyncing(true)`, clear prior result/error.
2. `fetch(GAME_SYNC_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(buildGameSyncBody(...)) })`.
3. `if (!res.ok) throw new Error(...)`.
4. Parse JSON `{ imported, charged, queued, warning, players, unmatched }` (read
   leniently). n8n's `lastNode` response may be a single object or a 1-element
   array, so normalise `Array.isArray(raw) ? raw[0] : raw`; store as `syncResult`.
5. Invalidate queries: `["games", id]`, `["games", id, "payment-status"]`,
   `["games"]`, `["dashboard"]`, `["reconciliation"]`.
6. `catch` → `setSyncError(message)`.
7. `finally` → `setIsSyncing(false)`.

UI:

- A `RefreshCw` button labelled **"Sync from Facebook"** in the Import Facebook
  Poll card header. Disabled while syncing; disabled with tooltip
  `"No Facebook event linked"` when the game has no `facebookEventUrl`; not
  rendered when the game is `cancelled`.
- A **modal** that shows a spinner while `isSyncing`, then either the error or a
  report: Imported / Charged / Unmatched counts, the misroute/0-rows `warning`,
  the matched **players** synced (badge list), and any **unmatched** names. The
  modal can't be dismissed mid-sync.

## API change — `POST /api/webhooks/facebook-attendance`

The response gains two additive fields so the modal can name names (and so the
n8n flow needs no fragile cross-node reference to build the report):

- `players: string[]` — matched **going** roster (canonical display names),
  including players already on file (so a re-sync still reports who's in the game).
- `unmatched: string[]` — raw scraped names that matched no player (now queued).

Existing fields (`imported, charged, queued, importId, warning`) are unchanged.

## n8n contract (confirmed against the workflow)

- **Trigger:** `POST` JSON body `{ "gameId": "<uuid>", "facebook_event_url": "<event url>" }`.
  - The `Webhook` node is `POST` / `responseMode: lastNode` (synchronous) with
    `allowedOrigins: "*"` for the browser's preflighted POST.
  - The body lands under `body`, so reference `$json.body.facebook_event_url` and
    `$('Webhook').item.json.body.gameId`.
  - The `TextManipulation1` node rewrites
    `https://facebook.com/events/<id>` → `https://www.facebook.com/events/report/?eid=<id>&av=...`.
    ⚠️ That `replace` only matches `https://facebook.com/events/...` exactly — a
    stored URL with `www.` or a trailing path/query won't rewrite correctly.
- **Work:** fetch the event report → parse the "Going" responders → build
  `rows = [{ playerName, sourceStatus: "going" }]`.
- **Callback:** `POST http://<app-host>/api/webhooks/facebook-attendance`
  - header `x-webhook-secret: <WEBHOOK_SHARED_SECRET>`
  - body `{ gameId, rows }` (carry `gameId` through from the trigger body)
- **Respond:** the `HTTP Request` (callback) node is the **last node** — its JSON
  (now including `players` / `unmatched`) is returned to the browser directly. No
  "Respond to Webhook" node and no extra response-builder node are needed.
- **CORS:** `allowedOrigins` must include the app origin.

The receiving endpoint already (a) transitions the game `scheduled|pending →
synced` once attendance exists, and (b) flags a misrouted payload (N rows in, 0
applied, game still empty) as a `failed` import — both shipped in the prior task.

## Testing

The web workspace has no test runner configured (no frontend tests exist in this
project), so verification is:

- **`npm run typecheck`** — covers the extracted pure helpers and the page.
- **Manual:** click Sync on a real game → toast shows counts → SYNC column flips
  to "Synced" → attendees appear.

The two pure helpers live in `apps/web/src/utils/gameSync.ts` so they stay
isolated and could be unit-tested if/when vitest is added to the web workspace.

## Out of scope

- Backend changes (none needed).
- Games-list row button (detail page only, per decision).
- Moving the n8n URL into a `VITE_` env var (possible later change).

## Risks

- The n8n URL ships in the client bundle — identical to today's bank-sync button.
- Relies on the n8n flow responding synchronously with CORS headers. If it does
  not, the `fetch` rejects and we show an error toast — but the attendance may
  still have imported via the callback, so the toast advises a refresh.
