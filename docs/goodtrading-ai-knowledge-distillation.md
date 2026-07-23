# AI-7.3.4 — Knowledge Distillation & Adaptive Learning

Deterministic distillation of **Human Review** + **Critical Calibration** answers into structured methodological knowledge. Never treats Brain as source of truth. Never auto-applies.

## Flag
`GOODTRADING_AI_KNOWLEDGE_DISTILLATION_ENABLED` — default **OFF**.

## Hard rules
- Deterministic only: **no** OpenAI / LLM / embeddings / vector DB
- No Brain mutation, no Apply, no Mentor/Chat/Market Snapshot/Decision Graph wiring
- No real market data, no BUY/SELL, no market probabilities
- Proposals always `PENDING` + `NOT_SAFE_FOR_BRAIN_APPLICATION` + `PROPOSAL_SCHEMA_NOT_READY_FOR_BRAIN_APPLICATION`
- Compatible with AI-7.2 / AI-7.3 Critical Calibration + Human Review patterns

## Engines
1. **Session Analyzer** — HR + CC answers/signals only
2. **Rule Clustering** — structural token/lens/priority similarity (no NLP)
3. **Knowledge Compression** — duplicates/variants/redundant/too-specific/too-general
4. **Conflict Heatmap** — lens-pair matrix (count/frequency/lastSeen/confidence) as data
5. **Coverage Heatmap** — per-lens/concept coverage metrics
6. **Confidence Model** — coverage/consistency/repetition/conflicts/uncertainty (no win rate)
7. **Knowledge Gaps** — never discussed / low coverage / unresolved conflicts / ambiguous rules
8. **Adaptive Question Engine** — only HIGH_CONFLICT | HIGH_UNCERTAINTY | LOW_COVERAGE | LOW_CONFIDENCE (+ info-gain tag)
9. **Challenge Engine** — Challenge Me; never answers; prioritizes hypothesis discrimination
10. **Proposal Compression** — ~5 grouped PENDING proposals (title/reason/conditions debt)
11. **Knowledge Evolution Report** — sessions, rules, conflicts, confidence, unused concepts, next questions, opportunities
12. **Adaptive Queue** — HIGH_CONFLICT → HIGH_INFORMATION_GAIN → LOW_COVERAGE → LOW_CONFIDENCE → RANDOM
13. **Challenge Score** — robustness/contradictions/exceptions/counterexamples/humanAgreement/reviewCount (no accuracy)

## API
Base: `/api/internal/ai/knowledge-distillation/`

| Route | Purpose |
|-------|---------|
| `GET /status` | Flag + safety note |
| `POST /run` | Run distillation pipeline |
| `GET /latest` | Latest persisted run |
| `GET /heatmaps` | Conflict + coverage |
| `GET /gaps` | Knowledge gaps |
| `GET /adaptive-queue` | Prioritized questions |
| `GET /challenges` | Challenge Me items + scores |
| `GET /proposals` | Compressed PENDING proposals |
| `GET /evolution` | Evolution report |

Admin-only via `requireKnowledgeDistillationAccess` (flag + admin auth).

## UI
`/admin/knowledge-distillation` — modes: Overview / Distillation / Heatmaps / Gaps / Adaptive Queue / Challenge Me / Compressed Proposals / Evolution Report.

- `credentials: include`
- Link from Admin page
- **No** Brain apply buttons

## Persistence
Gitignored: `server/storage/knowledge-distillation/` (observations/proposals/reports). Never commit answers.

## Tests
```bash
npm run test:goodtrading-ai:knowledge-distillation
```

Also keep green:
```bash
npm run test:goodtrading-ai:critical-calibration
npm run test:goodtrading-ai:critical-calibration-ui
```

## Challenge / hypothesis discrimination
Prefer questions where answering one way vs another **changes the reasoning model** (e.g. Absorption-first vs Delta-first). Challenge prompts never suggest the answer.