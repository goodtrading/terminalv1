# GoodTrading AI — Critical Calibration (AI-7.3)

Synthetic Brain-structure calibration lab for the deterministic Decision Graph **before** Mentor live.

## Scope

- Seeded synthetic scenarios from Brain lenses
- Deterministic mutations, critical review, improvement proposals (pending only)
- Active-learning question queue for Ignacio review
- File-backed memory under server/storage/critical-calibration/ (gitignored)

## Explicit non-goals

- No OpenAI / LLM oracle
- No /api/ai/chat live wiring
- No Mentor live (mentorEligible=false)
- No Brain mutation (brainMutate=false, autoApply=false)
- No BUY/SELL outcomes or win-rate metrics
- No real market data (realMarketData=false)

## Flag

GOODTRADING_AI_CRITICAL_CALIBRATION_ENABLED — default OFF. Admin + SaaS auth required.

## Script

npm run test:goodtrading-ai:critical-calibration

## Admin UI

/admin/critical-calibration — scenarios, engine/human review, proposals approve/reject, question queue, statistics.

## Status

Educational calibration only. Proposals never auto-apply to the knowledge registry.

## AI-7.3.1

- evidenceStatus: METHODOLOGICAL | HYPOTHETICAL only by default
- POTENTIAL_EDGE requires EDGE_NOT_EMPIRICALLY_VALIDATED (never proven edge)
- Active-learning scoreComponents + whyThisQuestion; no suggested answers
- Observations before high-impact proposal ACCEPT; autoApply/brainMutate false
- Session: /api/internal/ai/critical-calibration/sessions/start (blind until submit)
- Batch seed example: 73001 / 120 scenarios

## AI-7.3.3 Blind Session UI
- Admin UI: /admin/critical-calibration modes Overview | Batch | Queue | Blind Session | Report
- credentials:include only; no JWT prompt; no localStorage answer authority
- Flow: status → batch/generate (seed 73001) → questions/active-learning → sessions/start → answer → reveal
- Proposal debt: SAFE_FOR_CALIBRATION_SESSION / NOT_SAFE_FOR_BRAIN_APPLICATION / PROPOSAL_SCHEMA_NOT_READY_FOR_BRAIN_APPLICATION
- No Approve-to-Brain button; mentorEligible=false; brainMutate=false; realMarketData=false