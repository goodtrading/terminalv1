/**
 * AI-8.1.1 — Postgres schema for durable Decision Context.
 * Parameterized SQL only. No secrets / raw BingX / full MS/DG payloads.
 */
import { pool } from "../../../db";

const DDL = `
CREATE TABLE IF NOT EXISTS gt_ai_trade_decisions (
  decision_id uuid PRIMARY KEY,
  user_id integer NOT NULL,
  account_id text NOT NULL,
  symbol text NOT NULL,
  position_side text NOT NULL DEFAULT 'unknown',
  account_mode text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  closed_at timestamptz,
  payload jsonb NOT NULL,
  context_fingerprint text NOT NULL,
  mentor_eligible boolean NOT NULL DEFAULT false,
  brain_mutate boolean NOT NULL DEFAULT false,
  learning boolean NOT NULL DEFAULT false,
  auto_apply boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS gt_ai_trade_decisions_user_updated_idx
  ON gt_ai_trade_decisions (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS gt_ai_trade_decisions_account_idx
  ON gt_ai_trade_decisions (user_id, account_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS gt_ai_trade_decisions_active_idx
  ON gt_ai_trade_decisions (user_id, account_id, symbol, position_side, account_mode, status);

CREATE TABLE IF NOT EXISTS gt_ai_decision_contexts (
  decision_id uuid PRIMARY KEY REFERENCES gt_ai_trade_decisions(decision_id) ON DELETE CASCADE,
  trader_action_event_id text NOT NULL,
  context jsonb NOT NULL,
  context_fingerprint text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (trader_action_event_id)
);

CREATE TABLE IF NOT EXISTS gt_ai_decision_timeline_events (
  event_id text PRIMARY KEY,
  decision_id uuid NOT NULL REFERENCES gt_ai_trade_decisions(decision_id) ON DELETE CASCADE,
  trader_action_event_id text NOT NULL,
  type text NOT NULL,
  at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  UNIQUE (trader_action_event_id)
);
CREATE INDEX IF NOT EXISTS gt_ai_decision_timeline_decision_idx
  ON gt_ai_decision_timeline_events (decision_id, at ASC);

CREATE TABLE IF NOT EXISTS gt_ai_decision_journals (
  decision_id uuid PRIMARY KEY REFERENCES gt_ai_trade_decisions(decision_id) ON DELETE CASCADE,
  journal jsonb NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS gt_ai_decision_context_event_dedup (
  trader_action_event_id text PRIMARY KEY,
  decision_id uuid NOT NULL REFERENCES gt_ai_trade_decisions(decision_id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gt_ai_decision_active_index (
  active_key text PRIMARY KEY,
  decision_id uuid NOT NULL REFERENCES gt_ai_trade_decisions(decision_id) ON DELETE CASCADE,
  user_id integer NOT NULL,
  updated_at timestamptz NOT NULL
);
`;

let ready: Promise<void> | null = null;

export async function ensureDecisionContextPostgresSchema(): Promise<void> {
  if (!pool) throw new Error("DATABASE_UNAVAILABLE");
  if (!ready) {
    ready = pool.query(DDL).then(() => undefined);
  }
  await ready;
}

export function resetDecisionContextPostgresSchemaReadyForTests(): void {
  ready = null;
}

export function getDecisionContextPool() {
  return pool;
}
