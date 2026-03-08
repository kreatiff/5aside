export type PlayerRow = {
  id: string;
  display_name: string;
  active: boolean;
  current_balance_cents: number;
  notes: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type GameRow = {
  id: string;
  external_event_id: string | null;
  facebook_event_url: string | null;
  game_date: Date | string;
  kickoff_at_utc: Date | string | null;
  fee_cents: number;
  venue_fee_cents: number | null;
  source: string;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
};

export function toIso(value: Date | string | null): string | null {
  if (value === null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return parsed.toISOString();
}

export function toDateString(value: Date | string): string {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

export function mapPlayer(row: PlayerRow) {
  return {
    id: row.id,
    displayName: row.display_name,
    active: row.active,
    currentBalanceCents: row.current_balance_cents,
    notes: row.notes,
    createdAt: toIso(row.created_at)!,
    updatedAt: toIso(row.updated_at)!,
  };
}

export function mapGame(row: GameRow) {
  return {
    id: row.id,
    externalEventId: row.external_event_id,
    facebookEventUrl: row.facebook_event_url,
    gameDate: toDateString(row.game_date),
    kickoffAtUtc: toIso(row.kickoff_at_utc),
    feeCents: row.fee_cents,
    venueFeeCents: row.venue_fee_cents,
    source: row.source,
    status: row.status,
    createdAt: toIso(row.created_at)!,
    updatedAt: toIso(row.updated_at)!,
  };
}
