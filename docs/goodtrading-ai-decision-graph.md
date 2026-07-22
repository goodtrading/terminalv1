# GoodTrading AI — Deterministic Decision Graph Engine (AI-7)

## Goal

Brain + optional **validated** `MarketSnapshot` → deterministic **Decision Graph** (hypothesis paths, confirmations, invalidations, conflicts, quality).

- **NO** trading outcomes (`BUY` / `SELL` / `LONG` / `SHORT`)
- **NO** OpenAI building or replacing the graph
- **NOT** connected to Mentor live chat (AI-8 later)
- **NOT** full Brain traversal; template-bounded nodes/depth

## Pipeline

Question/Scenario → Retrieved Knowledge → optional validated MarketSnapshot (quality/staleness/provenance) → **Decision Context** → Template Graph → Node evaluation → Path evaluation → Validator → client-safe projection / Admin debug UI.

## Feature flag

```bash
GOODTRADING_AI_DECISION_GRAPH_ENABLED=false   # default
```

Optional internal attach (still not `/api/ai/chat` live wiring):

```bash
GOODTRADING_AI_DECISION_GRAPH_INTERNAL_ATTACH=false   # default
```

`mentorEligible` is always **false**.

## Internal API (admin)

Base: `/api/internal/ai/decision-graph`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/status` | Flag + safety notes |
| GET | `/templates` | Versioned template list |
| POST | `/evaluate` | Evaluate question (+ optional validated snapshot) |

Returns **client-safe** projection only (not full internal graph dump).

## Admin UI

`/admin/decision-graph` — debug evaluate + status. Requires admin + flag ON.

## Templates (versioned)

Examples: `absorption_reclaim_v1`, `gamma_regime_read_v1`, `liquidity_wall_reference_v1`, `sweep_reclaim_setup_v1`, `multi_lens_conflict_v1`, `stale_evidence_guard_v1`, `untrusted_scenario_v1`, `confirmation_stack_v1`, `generic_hypothesis_v1`.

## Evidence rules

- **STALE** evidence cannot `SUPPORTS`
- **UNTRUSTED_SCENARIO** cannot elevate to live-grade support
- Conflicts reuse AI-4 `detectReasoningContradictions`

## Quality (not win %)

`WELL_SUPPORTED` | `PARTIALLY_SUPPORTED` | `CONFLICTED` | `INVALIDATED` | `INSUFFICIENT_EVIDENCE` | `STALE_CONTEXT` | `UNTRUSTED_SCENARIO`

## Redis performance semantics

Unchanged: HIGH latency remains a **warning**; `performancePassed` never true for HIGH; Mentor still disconnected.

## Tests

```bash
npm run test:goodtrading-ai:decision
```

## Hard exclusions

No Bookmap / heatmap / canvas / feeds / WS. No embeddings / vector DB. No chat live snapshot wiring in this phase.
