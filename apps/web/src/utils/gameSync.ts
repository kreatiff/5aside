// Manual "Sync from Facebook" trigger. The browser calls the n8n webhook
// directly (mirroring the bank-sync button in TransactionsPage); n8n scrapes the
// game's Facebook event and POSTs {gameId, rows} back to
// POST /api/webhooks/facebook-attendance, then returns that response here.

export const GAME_SYNC_WEBHOOK_URL =
  "https://n8n.dominus.casa/webhook/3ed0312a-f102-4278-9f8c-2d2215ad79de";

/** Result shape returned by the facebook-attendance webhook (via n8n). All fields optional — read leniently. */
export type GameSyncResult = {
  imported?: number;
  charged?: number;
  queued?: number;
  warning?: string | null;
  /** Matched "going" roster (canonical display names) returned by the API. */
  players?: string[];
  /** Raw scraped names that didn't match a player (queued for reconciliation). */
  unmatched?: string[];
};

/** A game can be synced only if it has a linked Facebook event and is not cancelled. */
export function canSyncGame(game: {
  facebookEventUrl?: string | null;
  status: string;
}): boolean {
  return !!game.facebookEventUrl && game.status !== "cancelled";
}

/**
 * Body POSTed to the n8n trigger webhook. Field names match the n8n workflow:
 * `facebook_event_url` is read by its TextManipulation node to build the Facebook
 * event report URL; `gameId` is carried through so the workflow can POST it back
 * to /api/webhooks/facebook-attendance.
 */
export function buildGameSyncBody(
  gameId: string,
  eventUrl: string,
): { gameId: string; facebook_event_url: string } {
  return { gameId, facebook_event_url: eventUrl };
}
