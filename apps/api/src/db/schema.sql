-- Full schema reflecting all applied migrations.
-- Used by db:init to bootstrap a fresh database.
-- Keep this in sync with apps/api/migrations/*.js

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  totp_secret_enc TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  current_balance_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS player_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  alias_raw TEXT NOT NULL,
  alias_normalized TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(player_id, source, alias_normalized)
);

-- singleton row; cutoff_date and venue_game_fee_cents added by later migrations
CREATE TABLE IF NOT EXISTS settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  current_game_fee_cents INTEGER NOT NULL,
  app_timezone TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cutoff_date DATE DEFAULT NULL,
  venue_game_fee_cents INTEGER NOT NULL DEFAULT 15000
);

CREATE TABLE IF NOT EXISTS fee_change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  old_fee_cents INTEGER NOT NULL,
  new_fee_cents INTEGER NOT NULL,
  changed_by_admin_id UUID NOT NULL REFERENCES admins(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- facebook_event_url and venue_fee_cents added by later migrations
CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_event_id TEXT,
  game_date DATE NOT NULL,
  kickoff_at_utc TIMESTAMPTZ,
  fee_cents INTEGER NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  facebook_event_url TEXT,
  venue_fee_cents INTEGER DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_games_facebook_event_url
  ON games(facebook_event_url) WHERE facebook_event_url IS NOT NULL;

CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  source_status TEXT NOT NULL,
  chargeable BOOLEAN NOT NULL,
  source_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_attendance_game_player UNIQUE (game_id, player_id)
);

-- updated_at, is_outgoing, venue_category added by later migrations
CREATE TABLE IF NOT EXISTS bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_txn_id TEXT,
  posted_at_utc TIMESTAMPTZ NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  description_raw TEXT NOT NULL,
  source_ref TEXT,
  import_id UUID REFERENCES imports(id) ON DELETE SET NULL,
  is_outgoing BOOLEAN NOT NULL DEFAULT FALSE,
  venue_category TEXT DEFAULT NULL CHECK (venue_category IN ('game_fees', 'equipment')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(external_txn_id)
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('charge', 'payment', 'adjustment')),
  amount_cents INTEGER NOT NULL,
  game_id UUID REFERENCES games(id) ON DELETE SET NULL,
  attendance_id UUID REFERENCES attendance(id) ON DELETE SET NULL,
  bank_transaction_id UUID REFERENCES bank_transactions(id) ON DELETE SET NULL,
  adjustment_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL,
  mode TEXT NOT NULL,
  checksum TEXT,
  record_count INTEGER NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_summary TEXT
);

-- created_at added here (was added by migration 1772369087602)
CREATE TABLE IF NOT EXISTS reconciliation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type TEXT NOT NULL CHECK (item_type IN ('attendance', 'bank_transaction')),
  source_record_id UUID NOT NULL,
  payload JSONB,
  suggested_player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  confidence NUMERIC(5, 2) NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolved_by UUID REFERENCES admins(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  import_id UUID REFERENCES imports(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_aliases_normalized ON player_aliases(alias_normalized);
CREATE INDEX IF NOT EXISTS idx_recon_status ON reconciliation_queue(status);
CREATE INDEX IF NOT EXISTS idx_ledger_player ON ledger_entries(player_id);

INSERT INTO settings (id, current_game_fee_cents, app_timezone)
VALUES (1, 1000, 'Australia/Brisbane')
ON CONFLICT (id) DO NOTHING;
