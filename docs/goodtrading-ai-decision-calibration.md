# GoodTrading AI — Decision Calibration (AI-7.1)

Calibrates the deterministic Decision Graph against Ignacio-style methodology **before** Mentor live.

## Scope

- Golden Decision Suite, methodological invariants, counterfactuals, metamorphic checks
- Node/path limit contract: **internal ≤20**, **rendered ≤12**, **paths ≤2**, **depth ≤5**
- Structured decision traces + Reasoning↔Decision coherence matrix
- Admin **Golden Review** mode (manual; `brainMutate=false`)

## Explicit non-goals

- No OpenAI Provider / LLM as oracle
- No `/api/ai/chat` live wiring
- No Mentor live (`mentorEligible=false`)
- No BUY/SELL outcomes, no win-rate metrics
- No Redis semantics/policy changes
- No Bookmap / feeds / WS
- Telemetry remains OFF for this path

## Limit audit (critical)

| Cap | Value | Notes |
|-----|-------|-------|
| Internal nodes | ≤20 | Was briefly 24 in AI-7; aligned in AI-7.1 |
| Rendered nodes | ≤12 | Client-safe projection |
| Paths | ≤2 | Primary + at most one alternative |
| Depth | ≤5 | Path hops |

Prune retention order (keep first):

1. Data quality / context guards  
2. Critical conflicts  
3. Triggered invalidations  
4. Required confirmations  
5. Primary hypothesis  
6. Alternative paths  
7. Supporting LOW evidence (pruned first)

**Invariant:** never prune a triggered invalidation before LOW unsupported evidence.

## Suites & script

```bash
npm run test:goodtrading-ai:decision:calibration
```

Also keep green:

- `npm run test:goodtrading-ai:decision`
- `npm run test:goodtrading-ai`
- `npm run test:goodtrading-ai:market`
- `npm run build`

## Calibration gates (`DecisionCalibrationReport`)

- Methodological invariants **100%**
- Unsafe trading-outcome tokens **0**
- Golden pass rate gate (≥95% on report sample)
- Counterfactual / metamorphic coverage counts
- p95 evaluate **&lt; 50ms** (local suite)

## Review UI

Admin page `/admin/decision-graph` → **Golden Review** mode:

- Load sample golden prompts
- Evaluate graph
- Mark approved / rejected / needs_template_change / pending
- Records keep `brainMutate: false` (no auto Brain mutate)

## Methodological change log

Documented in `server/ai/goodTradingAi/decision/calibration/priorityCalibrationNotes.ts`.

Primary justified change: node/path caps 24→20 / paths≤2 / rendered≤12 to match contract.

## Status

Educational Decision Graph only. Mentor remains ineligible until a later gated phase.
