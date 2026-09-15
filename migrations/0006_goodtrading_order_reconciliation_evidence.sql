CREATE TABLE goodtrading_order_reconciliation_runs (
  id text PRIMARY KEY,
  attempt_id text NOT NULL REFERENCES goodtrading_order_submission_attempts(id) ON DELETE RESTRICT,
  intent_id text NOT NULL REFERENCES goodtrading_order_intents(id) ON DELETE RESTRICT,
  logical_order_uid text NOT NULL,
  run_key text NOT NULL,
  run_status text NOT NULL CHECK (run_status IN ('STARTED', 'COMPLETED')),
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  result text CHECK (result IS NULL OR result IN ('MATCHED', 'CONFLICT', 'NO_MATCH_IN_OBSERVED_WINDOW', 'UNRESOLVED')),
  queried_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_statuses jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_error_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  absence_proven boolean NOT NULL DEFAULT false CHECK (absence_proven = false),
  retry_authorized boolean NOT NULL DEFAULT false CHECK (retry_authorized = false),
  conflict_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  query_window_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT goodtrading_reconciliation_run_key_uq UNIQUE (attempt_id, run_key),
  CONSTRAINT goodtrading_reconciliation_run_completion_chk CHECK (
    (run_status = 'STARTED' AND completed_at IS NULL AND result IS NULL)
    OR (run_status = 'COMPLETED' AND completed_at IS NOT NULL AND result IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS goodtrading_order_attempt_id_intent_uq
  ON goodtrading_order_submission_attempts (id, intent_id);

CREATE TABLE goodtrading_broker_objects (
  id text PRIMARY KEY,
  broker_account_identity text NOT NULL,
  classification text NOT NULL CHECK (classification IN ('BROKER_OBSERVED_ONLY', 'GT_LINKED')),
  attempt_id text,
  intent_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT goodtrading_broker_object_linkage_chk CHECK (
    (classification = 'BROKER_OBSERVED_ONLY' AND attempt_id IS NULL AND intent_id IS NULL)
    OR (classification = 'GT_LINKED' AND attempt_id IS NOT NULL AND intent_id IS NOT NULL)
  ),
  CONSTRAINT goodtrading_broker_object_attempt_intent_fk
    FOREIGN KEY (attempt_id, intent_id)
    REFERENCES goodtrading_order_submission_attempts(id, intent_id)
    ON DELETE RESTRICT,
  CONSTRAINT goodtrading_broker_object_intent_fk
    FOREIGN KEY (intent_id) REFERENCES goodtrading_order_intents(id) ON DELETE RESTRICT
);

CREATE TABLE goodtrading_broker_identity_aliases (
  id text PRIMARY KEY,
  broker_object_id text NOT NULL REFERENCES goodtrading_broker_objects(id) ON DELETE RESTRICT,
  broker_account_identity text NOT NULL,
  identity_kind text NOT NULL CHECK (identity_kind IN ('CLIENT_ORDER_ID', 'TRUSTED_BROKER_ORDER_ID', 'EXECUTION_ID')),
  identity_value text NOT NULL,
  precision_trusted boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT goodtrading_broker_identity_precision_chk CHECK (
    identity_kind <> 'TRUSTED_BROKER_ORDER_ID' OR precision_trusted = true
  ),
  CONSTRAINT goodtrading_broker_identity_value_chk CHECK (length(identity_value) > 0),
  CONSTRAINT goodtrading_broker_identity_alias_uq UNIQUE (broker_account_identity, identity_kind, identity_value)
);

CREATE TABLE goodtrading_broker_observation_snapshots (
  id text PRIMARY KEY,
  broker_object_id text NOT NULL REFERENCES goodtrading_broker_objects(id) ON DELETE RESTRICT,
  source text NOT NULL,
  client_order_id text,
  broker_order_id text,
  broker_order_id_precision_trusted boolean NOT NULL DEFAULT false,
  execution_id text,
  symbol text NOT NULL,
  side text,
  quantity numeric,
  price numeric,
  raw_broker_status text,
  source_timestamp timestamptz,
  observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT goodtrading_broker_snapshot_decimal_chk CHECK ((quantity IS NULL OR quantity > 0) AND (price IS NULL OR price > 0))
);

CREATE INDEX IF NOT EXISTS goodtrading_reconciliation_attempt_created_idx
  ON goodtrading_order_reconciliation_runs (attempt_id, created_at DESC);
CREATE INDEX IF NOT EXISTS goodtrading_broker_object_account_idx
  ON goodtrading_broker_objects (broker_account_identity, created_at DESC);
CREATE INDEX IF NOT EXISTS goodtrading_broker_snapshot_object_created_idx
  ON goodtrading_broker_observation_snapshots (broker_object_id, created_at DESC);
