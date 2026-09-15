CREATE TABLE IF NOT EXISTS goodtrading_order_intents (
  id text PRIMARY KEY,
  logical_order_uid text NOT NULL UNIQUE,
  goodtrading_account_uid text NOT NULL REFERENCES goodtrading_accounts(account_uid) ON DELETE RESTRICT,
  execution_broker text NOT NULL,
  execution_environment text NOT NULL,
  execution_market_instrument text NOT NULL,
  execution_market_venue text NOT NULL,
  execution_market_type text NOT NULL CHECK (execution_market_type IN ('Spot', 'Perpetual')),
  canonical_base_asset text NOT NULL,
  canonical_quote_asset text NOT NULL,
  canonical_settlement_asset text NOT NULL,
  canonical_product_type text NOT NULL CHECK (canonical_product_type IN ('Spot', 'Perpetual')),
  canonical_contract_style text,
  canonical_expiry timestamptz,
  source_native_symbol text NOT NULL,
  source_native_instrument_id text,
  market_metadata_source text NOT NULL,
  market_mapping_policy text NOT NULL,
  requested_side text NOT NULL CHECK (requested_side IN ('buy', 'sell')),
  order_type text NOT NULL CHECK (order_type = 'LIMIT'),
  requested_size numeric NOT NULL,
  requested_size_unit text NOT NULL CHECK (requested_size_unit IN ('BTC', 'USDT')),
  requested_sizing_mode text CHECK (requested_sizing_mode IS NULL OR requested_sizing_mode IN ('quantity', 'notional', 'margin')),
  resolved_quantity numeric NOT NULL,
  resolved_quantity_unit text NOT NULL CHECK (resolved_quantity_unit IN ('BTC', 'USDT')),
  limit_price numeric NOT NULL,
  stop_loss_price numeric,
  take_profit_price numeric,
  time_in_force text CHECK (time_in_force IS NULL OR time_in_force IN ('GTC', 'IOC', 'FOK', 'GTD', 'DAY')),
  post_only boolean,
  reduce_only boolean,
  request_idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT goodtrading_order_intents_canonical_shape_chk CHECK (
    (canonical_product_type = 'Spot' AND canonical_contract_style IS NULL)
    OR (canonical_product_type = 'Perpetual' AND canonical_contract_style IN ('Linear', 'Inverse'))
  ),
  CONSTRAINT goodtrading_order_intents_expiry_chk CHECK (canonical_expiry IS NULL),
  CONSTRAINT goodtrading_order_intents_positive_decimals_chk CHECK (
    requested_size > 0
    AND resolved_quantity > 0
    AND limit_price > 0
    AND (stop_loss_price IS NULL OR stop_loss_price > 0)
    AND (take_profit_price IS NULL OR take_profit_price > 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS goodtrading_order_intents_account_idempotency_idx
  ON goodtrading_order_intents (goodtrading_account_uid, request_idempotency_key)
  WHERE request_idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS goodtrading_order_intents_account_created_idx
  ON goodtrading_order_intents (goodtrading_account_uid, created_at DESC);

CREATE TABLE IF NOT EXISTS goodtrading_order_submission_attempts (
  id text PRIMARY KEY,
  intent_id text NOT NULL REFERENCES goodtrading_order_intents(id) ON DELETE RESTRICT,
  attempt_number integer NOT NULL CHECK (attempt_number >= 1),
  broker_client_order_id text NOT NULL UNIQUE,
  submitted_quantity numeric,
  transport_state text NOT NULL CHECK (transport_state IN (
    'PERSISTED',
    'SUBMISSION_STARTED',
    'SUBMISSION_RESPONSE_OBSERVED',
    'SUBMISSION_REJECTED',
    'UNKNOWN_SUBMISSION_OUTCOME',
    'RECONCILIATION_REQUIRED'
  )),
  started_at timestamptz,
  response_at timestamptz,
  outcome_at timestamptz,
  reconciliation_required_at timestamptz,
  broker_order_id text,
  raw_broker_status text,
  http_status integer,
  error_code text,
  error_class text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT goodtrading_order_attempts_http_status_chk CHECK (
    http_status IS NULL OR (http_status >= 100 AND http_status <= 599)
  ),
  CONSTRAINT goodtrading_order_attempts_submitted_quantity_chk CHECK (
    submitted_quantity IS NULL OR submitted_quantity > 0
  ),
  CONSTRAINT goodtrading_order_attempts_intent_number_uq UNIQUE (intent_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS goodtrading_order_attempts_intent_idx
  ON goodtrading_order_submission_attempts (intent_id, attempt_number);
