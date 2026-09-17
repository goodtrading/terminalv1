CREATE TABLE goodtrading_paper_execution_evidence (
  id bigserial PRIMARY KEY,
  account_id text NOT NULL CHECK (length(trim(account_id)) > 0),
  session_id text NOT NULL CHECK (length(trim(session_id)) > 0),
  execution_id text NOT NULL CHECK (length(trim(execution_id)) > 0),
  environment text NOT NULL CHECK (environment = 'PAPER'),
  source text NOT NULL CHECK (source = 'NAUTILUS_PAPER'),
  instrument_venue text NOT NULL CHECK (length(trim(instrument_venue)) > 0),
  instrument_market_type text NOT NULL CHECK (instrument_market_type IN ('spot', 'perpetual', 'future', 'option')),
  instrument_symbol text NOT NULL CHECK (length(trim(instrument_symbol)) > 0),
  side text NOT NULL CHECK (side IN ('BUY', 'SELL')),
  price text NOT NULL CHECK (price ~ '^(0|[1-9][0-9]*)([.][0-9]+)?$' AND price !~ '^0([.]0+)?$'),
  quantity text NOT NULL CHECK (quantity ~ '^(0|[1-9][0-9]*)([.][0-9]+)?$' AND quantity !~ '^0([.]0+)?$'),
  simulation_event_time_ms bigint NOT NULL CHECK (simulation_event_time_ms >= 0),
  fee_amount text CHECK (fee_amount IS NULL OR fee_amount ~ '^(0|[1-9][0-9]*)([.][0-9]+)?$'),
  fee_asset text CHECK (fee_asset IS NULL OR length(trim(fee_asset)) > 0),
  fee_quality text NOT NULL CHECK (fee_quality = 'SIMULATED_CONFIGURED_FEE'),
  liquidity_role text NOT NULL CHECK (liquidity_role IN ('MAKER', 'TAKER', 'UNKNOWN')),
  order_id text CHECK (order_id IS NULL OR length(trim(order_id)) > 0),
  client_order_id text CHECK (client_order_id IS NULL OR length(trim(client_order_id)) > 0),
  persisted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, session_id, source, execution_id)
);

CREATE INDEX goodtrading_paper_execution_evidence_order_idx
  ON goodtrading_paper_execution_evidence (account_id, session_id, client_order_id, simulation_event_time_ms, id);
