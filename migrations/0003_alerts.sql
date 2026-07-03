CREATE TABLE IF NOT EXISTS goodtrading_alerts (
  id text PRIMARY KEY,
  user_id integer REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  severity text NOT NULL,
  domain text NOT NULL,
  symbol text,
  status text NOT NULL,
  deduplication_key text NOT NULL,
  created_at timestamptz NOT NULL,
  detected_at timestamptz NOT NULL,
  expires_at timestamptz,
  payload jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS goodtrading_alerts_user_created_idx ON goodtrading_alerts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS goodtrading_alerts_user_status_idx ON goodtrading_alerts (user_id, status);
CREATE INDEX IF NOT EXISTS goodtrading_alerts_severity_idx ON goodtrading_alerts (severity);
CREATE INDEX IF NOT EXISTS goodtrading_alerts_type_idx ON goodtrading_alerts (type);
CREATE INDEX IF NOT EXISTS goodtrading_alerts_symbol_idx ON goodtrading_alerts (symbol);
CREATE INDEX IF NOT EXISTS goodtrading_alerts_status_idx ON goodtrading_alerts (status);
CREATE INDEX IF NOT EXISTS goodtrading_alerts_dedupe_idx ON goodtrading_alerts (deduplication_key);
CREATE UNIQUE INDEX IF NOT EXISTS goodtrading_alerts_open_dedupe_idx
  ON goodtrading_alerts (COALESCE(user_id, 0), type, deduplication_key)
  WHERE status NOT IN ('acknowledged', 'dismissed', 'expired');

CREATE TABLE IF NOT EXISTS goodtrading_alert_preferences (
  user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS goodtrading_alert_deliveries (
  id text PRIMARY KEY,
  alert_id text NOT NULL,
  user_id integer REFERENCES users(id) ON DELETE CASCADE,
  channel text NOT NULL,
  status text NOT NULL,
  provider text NOT NULL DEFAULT 'noop',
  device_id text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL,
  delivered_at timestamptz,
  failed_at timestamptz,
  error_code text,
  error text,
  retry_count integer NOT NULL DEFAULT 0,
  payload jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS goodtrading_alert_deliveries_alert_idx ON goodtrading_alert_deliveries (alert_id);
CREATE INDEX IF NOT EXISTS goodtrading_alert_deliveries_user_idx ON goodtrading_alert_deliveries (user_id);
CREATE INDEX IF NOT EXISTS goodtrading_alert_deliveries_status_idx ON goodtrading_alert_deliveries (status);
CREATE INDEX IF NOT EXISTS goodtrading_alert_deliveries_user_status_idx ON goodtrading_alert_deliveries (user_id, status);

CREATE TABLE IF NOT EXISTS goodtrading_alert_history (
  id text PRIMARY KEY,
  alert_id text NOT NULL,
  user_id integer REFERENCES users(id) ON DELETE CASCADE,
  action text NOT NULL,
  at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS goodtrading_alert_history_alert_idx ON goodtrading_alert_history (alert_id, at DESC);
CREATE INDEX IF NOT EXISTS goodtrading_alert_history_user_idx ON goodtrading_alert_history (user_id, at DESC);

CREATE TABLE IF NOT EXISTS goodtrading_alert_devices (
  id text PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform text NOT NULL,
  push_token text NOT NULL,
  device_name text,
  app_version text,
  enabled boolean NOT NULL,
  last_seen_at timestamptz NOT NULL,
  payload jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS goodtrading_alert_devices_user_idx ON goodtrading_alert_devices (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS goodtrading_alert_devices_user_token_idx ON goodtrading_alert_devices (user_id, push_token);
