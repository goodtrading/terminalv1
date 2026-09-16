ALTER TABLE goodtrading_order_intents
  ADD COLUMN IF NOT EXISTS decision_at timestamptz,
  ADD COLUMN IF NOT EXISTS decision_market_source text,
  ADD COLUMN IF NOT EXISTS decision_market_source_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS decision_best_bid numeric,
  ADD COLUMN IF NOT EXISTS decision_best_ask numeric,
  ADD COLUMN IF NOT EXISTS decision_market_evidence_quality text;

ALTER TABLE goodtrading_order_intents
  ADD CONSTRAINT goodtrading_order_intents_decision_market_quality_chk
  CHECK (decision_market_evidence_quality IS NULL OR decision_market_evidence_quality IN ('EXACT_OBSERVED', 'UNAVAILABLE'));

ALTER TABLE goodtrading_order_intents
  ADD CONSTRAINT goodtrading_order_intents_decision_bbo_chk
  CHECK ((decision_best_bid IS NULL OR decision_best_bid > 0) AND (decision_best_ask IS NULL OR decision_best_ask > 0));

ALTER TABLE goodtrading_order_intents
  ADD CONSTRAINT goodtrading_order_intents_decision_evidence_shape_chk
  CHECK (
    decision_at IS NULL
    OR (
      decision_market_source IS NOT NULL
      AND decision_market_evidence_quality IS NOT NULL
      AND ((decision_market_evidence_quality = 'EXACT_OBSERVED' AND decision_market_source_timestamp IS NOT NULL AND decision_best_bid IS NOT NULL AND decision_best_ask IS NOT NULL)
        OR (decision_market_evidence_quality = 'UNAVAILABLE' AND decision_market_source_timestamp IS NULL AND decision_best_bid IS NULL AND decision_best_ask IS NULL))
    )
  );
