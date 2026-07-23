# AI-7.3.6 — Knowledge Provenance Engine

Append-only, deterministic audit trail for methodological rules: origin, justification history, rationale, lineage, impact, and PENDING proposal context.

## Flag
`GOODTRADING_AI_KNOWLEDGE_PROVENANCE_ENABLED` — default **OFF**.

## Hard rules
- Append-only only (never overwrite/delete justifications)
- No OpenAI / LLM / embeddings / vector DB
- No Brain mutation; no proposal apply
- Does **not** alter Decision Graph, Evolution, or Distillation engine semantics (reference ingest only)
- Stable IDs: `RULE_*` (aligned with Knowledge Evolution)

## Engines
1. Provenance Registry
2. Justification History (CREATED…DEPRECATED)
3. Rationale Store (never retrospective edit)
4. Rule Lineage (cycle break)
5. Provenance Queries
6. Knowledge Timeline (per-rule)
7. Impact Trace
8. Proposal Context (PENDING only)

## API
`/api/internal/ai/knowledge-provenance/{status,run,latest,registry,timeline,lineage,rationale,impact,query,proposal-context,related-rules}`

## UI
`/admin/knowledge-provenance` — Registry, Timeline, Lineage, Rationale, Dependencies, Impact, Related Rules, Proposal Context.

## Persistence
Gitignored: `server/storage/knowledge-provenance/`

## Tests
```bash
npm run test:goodtrading-ai:knowledge-provenance
npm run test:goodtrading-ai:knowledge-evolution
npm run test:goodtrading-ai:knowledge-distillation
npm run test:goodtrading-ai:critical-calibration
```