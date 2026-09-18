CREATE TABLE IF NOT EXISTS goodtrading_paper_order_event_evidence (
  id BIGSERIAL PRIMARY KEY,
  account_id TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment = 'PAPER'),
  source TEXT NOT NULL CHECK (source = 'NAUTILUS_PAPER'),
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  ts_event_ns TEXT NOT NULL CHECK (ts_event_ns ~ '^[0-9]+$'),
  ts_init_ns TEXT NOT NULL CHECK (ts_init_ns ~ '^[0-9]+$'),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT goodtrading_paper_order_event_evidence_identity
    UNIQUE (account_id, environment, source, event_id)
);

CREATE INDEX IF NOT EXISTS goodtrading_paper_order_event_evidence_account_time_idx
  ON goodtrading_paper_order_event_evidence (account_id, ts_event_ns, created_at);

CREATE INDEX IF NOT EXISTS goodtrading_paper_order_event_evidence_account_type_idx
  ON goodtrading_paper_order_event_evidence (account_id, event_type);
