# GoodTrading AI — Human Methodology Review (AI-7.2)

Blind human review of Decision Graph methodology **before** Mentor live. Owner: **IGNACIO**.

## Scope

- ≥80 blind cases: 40 REWORDED_GOLDEN, 20 NEW, 10 AMBIGUOUS, 10 INSUFFICIENT, plus 20 HOLDOUT
- Three-way comparison: Human vs Engine vs Golden
- File-backed repository (not Redis / not localStorage authority)
- Methodology proposals stay **PENDING** (`autoApply:false`, `brainMutate:false`)
- Holdout fingerprint isolation from calibration adjustments

## Explicit non-goals

- No OpenAI / LLM-as-judge
- No `/api/ai/chat` live wiring
- No Mentor live (`mentorEligible=false`)
- No BUY/SELL trading mandate fields
- No auto-approve of golden expectations
- No auto-adjust of expectations from UI

## Flag

`GOODTRADING_AI_DECISION_REVIEW_ENABLED` — default **OFF**.

## Blind UI order (hard)

1. Show scenario (blind case view only)
2. Structured answer form
3. Submit (hash + append revision; **no reveal**)
4. Only then: reveal engine / golden / diff

## Storage

Default: `server/storage/human-decision-review/`  
Override: `GOODTRADING_AI_HUMAN_REVIEW_DIR`

Private answers path is gitignored:

- `server/storage/human-decision-review/`
- `**/human-decision-review/private/`

Answers are **append-only** by revision.

## Routes

Base: `/api/internal/ai/decision-human-review`

- `GET /status`
- `POST /sessions`
- `GET /sessions/:id` (blind cases only)
- `POST /sessions/:id/answers`
- `POST /sessions/:id/reveal/:caseId`
- `GET /sessions/:id/report`
- `GET /proposals`
- `GET /packet`

## Gates

When infrastructure is ready but human review is incomplete:

`gatesStatus.overall = GO_PARCIAL_INFRASTRUCTURE_READY`

Proposed gates include:

- `autoApproveGolden: false`
- `autoAdjustExpectations: false`
- `holdoutRequiredBeforeCalibrationAdjust: true`

## Tests

```bash
npm run test:goodtrading-ai:decision:human-review
```
