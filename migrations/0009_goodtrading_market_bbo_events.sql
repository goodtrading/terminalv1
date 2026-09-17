CREATE TABLE goodtrading_market_bbo_events (
  id text PRIMARY KEY,
  venue text NOT NULL CHECK (venue = 'BINGX'),
  market_type text NOT NULL CHECK (market_type = 'Perpetual'),
  native_symbol text NOT NULL CHECK (native_symbol = 'BTC-USDT'),
  market_source text NOT NULL CHECK (market_source = 'BINGX_BOOK_TICKER'),
  market_source_timestamp_ms bigint NOT NULL CHECK (market_source_timestamp_ms > 0),
  observed_at timestamptz NOT NULL,
  best_bid text NOT NULL CHECK (best_bid ~ '^-?(0|[1-9][0-9]*)([.][0-9]+)?$'),
  best_ask text NOT NULL CHECK (best_ask ~ '^-?(0|[1-9][0-9]*)([.][0-9]+)?$'),
  best_bid_quantity text NOT NULL CHECK (best_bid_quantity ~ '^-?(0|[1-9][0-9]*)([.][0-9]+)?$'),
  best_ask_quantity text NOT NULL CHECK (best_ask_quantity ~ '^-?(0|[1-9][0-9]*)([.][0-9]+)?$'),
  provider_update_id text,
  source_age_at_observation_ms bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT goodtrading_market_bbo_identity_chk CHECK (venue = 'BINGX' AND market_type = 'Perpetual' AND native_symbol = 'BTC-USDT'),
  CONSTRAINT goodtrading_market_bbo_values_chk CHECK (
    best_bid !~ '^-' AND best_ask !~ '^-' AND best_bid_quantity !~ '^-' AND best_ask_quantity !~ '^-' AND
    best_bid <> '0' AND best_ask <> '0'
  )
);

CREATE INDEX IF NOT EXISTS goodtrading_market_bbo_lookup_idx
  ON goodtrading_market_bbo_events (venue, market_type, native_symbol, market_source_timestamp_ms DESC, observed_at DESC, id DESC);
