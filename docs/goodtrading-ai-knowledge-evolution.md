# AI-7.3.5 — Knowledge Evolution Engine

Living measurement system over methodological rules distilled from Human Review + Critical Calibration. Brain stays immutable. Reports + PENDING proposals only.

## Flag
`GOODTRADING_AI_KNOWLEDGE_EVOLUTION_ENABLED` — default **OFF**.

## Hard rules
- Deterministic only: no OpenAI / LLM / embeddings / vector DB
- No Brain mutation, Mentor, Chat, Market Snapshot, Decision Graph mutation
- No real market data, BUY/SELL, win-rate
- Obsolete detector **never deletes**
- Proposals always `PENDING` + `NOT_SAFE_FOR_BRAIN_APPLICATION`
- Compatible with AI-7.2 / AI-7.3 / AI-7.3.3 / AI-7.3.4 (does **not** replace Distillation dashboard)

## Engines
1. **Rule Registry** — stable IDs `RULE_<LENSES>_<KIND>` (never free-text)
2. **Rule History** — agree/disagree/defer/conditions/evidence/revisions counters
3. **Stability** — repetition/consistency/revisions/contradictions/exceptions (no accuracy)
4. **Volatility** — change/exception/revision/recent disagreement → Active Learning
5. **Dependency Graph** — requires/supports/invalidates/strengthens/weakens/dependsOn + cycle break
6. **Keystone Detection** — dependencyCount / downstream / upstream / keystoneScore
7. **Obsolete Detector** — report only
8. **Stability Report** — most/least stable, volatility, challenged/confirmed, never challenged, recently changed
9. **Evolution Timeline** — append-only events
10. **Adaptive Priority v2** — HIGH_VOLATILITY → HIGH_CONFLICT → HIGH_INFORMATION_GAIN → LOW_COVERAGE → LOW_STABILITY → LOW_CONFIDENCE → RANDOM
11. **Knowledge Health** — stability/coverage/volatility/density/age/growth/churn
12. **Proposal Ranking** — PENDING sorted by impact/stability/dependency/coverage/volatility
13. **Feedback Loop** — after session: update history/stability/volatility/deps/health only

## API
Base: `/api/internal/ai/knowledge-evolution/`

`status | run | latest | rules | dependencies | timeline | volatility | stability | health | obsolete | keystone | adaptive-priority | proposals | feedback`

## UI
`/admin/knowledge-evolution` — Rules, Dependencies, Timeline, Volatility, Stability, Health, Obsolete, Keystone (+ Adaptive Priority, Ranked Proposals). Separate from `/admin/knowledge-distillation`.

## Persistence
Gitignored: `server/storage/knowledge-evolution/`

## Tests
```bash
npm run test:goodtrading-ai:knowledge-evolution
npm run test:goodtrading-ai:knowledge-distillation
npm run test:goodtrading-ai:critical-calibration
```