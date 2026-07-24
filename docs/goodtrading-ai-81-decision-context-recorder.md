# GoodTrading AI-8.1 / AI-8.1.1 — Decision Context Recorder

## Purpose

Permanently join **Market Snapshot** + **Decision Graph** + **TraderActionContext** (BingX read-only) into an immutable **DecisionContext**, wrapped by a lifecycle **TradeDecision**, with an append-only **Timeline** and automatic data-only **Decision Journal**.

This phase **only records**. It does **not** connect Mentor, mutate Brain, enable learning, call OpenAI, create new Market Snapshots, create new Decision Graphs, or wire Knowledge Distillation / Evolution / Provenance.

## AI-8.1.1 durability

- Default `GOODTRADING_DECISION_CONTEXT_RECORDER_ENABLED=false`
- `GOODTRADING_DECISION_CONTEXT_REPOSITORY=memory|postgres` (production default postgres)
- Production + recorder ON + memory → `UNSAFE_NON_DURABLE_DECISION_CONTEXT_STORE` — **no capture**, no silent fallback
- Postgres tables: `gt_ai_trade_decisions`, `gt_ai_decision_contexts`, `gt_ai_decision_timeline_events`, `gt_ai_decision_journals`, `gt_ai_decision_context_event_dedup`, `gt_ai_decision_active_index`
- Active match key: `userId:accountId:symbol:positionSide:accountMode` (LONG ≠ SHORT hedge)
- Storage health: `DURABLE_READY | DEGRADED | UNSAFE_MEMORY | UNAVAILABLE | RECORDER_DISABLED`

## Architecture

```
BingX refresh → reconcileAccountSnapshots
  → POSITION_* events
  → DecisionContextRecorder.recordFromBingxReconciliation
       → freeze DecisionContext (eligible MS/DG refs only)
       → TradeDecision (stable UUID)
       → Timeline + Journal
  → DecisionContextRepository (memory | postgres)
  → GET /api/account/decision-context/* (read-only)
```

## Feature flags (deploy OFF)

```
GOODTRADING_BINGX_ACCOUNT_ENABLED=false
GOODTRADING_BINGX_ACCOUNT_AUTO_REFRESH=false
GOODTRADING_DECISION_CONTEXT_RECORDER_ENABLED=false
GOODTRADING_DECISION_CONTEXT_REPOSITORY=postgres
```

## APIs

| Method | Path |
|--------|------|
| GET | `/api/account/decision-context/status` |
| GET | `/api/account/decision-context/health` |
| GET | `/api/account/decision-context/decisions` |
| GET | `/api/account/decision-context/decisions/:id` |
| GET | `/api/account/decision-context/decisions/:id/journal` |
| GET | `/api/account/decision-context/decisions/:id/timeline` |
| GET | `/api/account/decision-context/decisions/:id/export` |

No journal edit endpoint. Auth + user isolation. Export = `TradeDecisionExport/v1` (never commit exports to git).

## Journal close semantics

STOP/TP require `classificationConfidence` + evidence codes. Weak hints → `POSITION_CLOSED` / `UNCERTAIN`. **Never invent MANUAL_CLOSE.**

## Tests

```
npm run test:decision-context
npm run test:decision-context:durable
npm run test:bingx-account
npm run test:bingx-b1
```
