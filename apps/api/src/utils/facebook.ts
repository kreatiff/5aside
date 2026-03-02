/**
 * Extracts the numeric event ID from a Facebook event URL.
 * Supports formats:
 *   - https://www.facebook.com/events/1234567890
 *   - https://www.facebook.com/events/1234567890/
 *   - https://facebook.com/events/1234567890/?active_tab=...
 *   - https://m.facebook.com/events/1234567890
 * Returns null if the URL does not match.
 */
export function extractFacebookEventId(url: string): string | null {
  const match = url.match(/facebook\.com\/events\/(\d+)/);
  return match?.[1] ?? null;
}
