CREATE INDEX goodtrading_market_bbo_observed_lookup_idx
  ON goodtrading_market_bbo_events (
    venue,
    market_type,
    native_symbol,
    observed_at DESC,
    market_source_timestamp_ms DESC,
    id DESC
  );
