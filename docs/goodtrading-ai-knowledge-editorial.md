# GoodTrading AI — Guía editorial de conocimiento (AI-2)

Server-only knowledge modules live under `server/ai/goodTradingAi/knowledge/`.
Never expose full `statement`/`explanation` trees to the public client bundle.
Client may only receive `knowledgeReferences` (id, title, kind, category).

## Cómo agregar una entrada

1. Elegí el módulo correcto (`constitution`, `gamma`, `liquidity`, `orderFlow`, …).
2. Usá `ke({...})` o `setup({...})` de `types.ts`.
3. ID estable: `gt_<area>_<slug>` (no renombrar sin nota de migración).
4. Completá: `title`, `kind`, `category`, `concepts`, `aliases`, `statement`, `explanation`.
5. Agregá `prohibitedInterpretations` cuando haya anti-patrones típicos.
6. Relacioná con `relatedEntryIds` solo a IDs existentes.
7. Corré:
   - `npm run test:goodtrading-ai`
   - `npm run test:goodtrading-ai:evals`

## Checklist editorial

- [ ] ¿Es PRINCIPLE/RULE/HEURISTIC/DEFINITION/EXAMPLE/ANTI_PATTERN/SETUP correcto?
- [ ] ¿El statement es una sola idea clara en español?
- [ ] ¿La explanation enseña el “por qué” sin pretender mercado en vivo?
- [ ] ¿Hay prohibitedInterpretations para malentendidos comunes?
- [ ] ¿Confirmaciones/invalidaciones son objetivas cuando aplica?
- [ ] ¿Evita % universales y órdenes de compra/venta?
- [ ] ¿Relations válidas? (`validateKnowledgeRegistry`)
- [ ] ¿Concepts/aliases cubren ES + EN común?
- [ ] ¿No duplica un ID existente?
- [ ] ¿Si es SETUP: hypothesis, traps, managementNotes, relatedKnowledgeIds?

## Constitución

Las entradas `category: "constitution"` tienen prioridad de retrieval sobre heurísticas.
No diluir principios con texto genérico: cada uno debe ser accionable en el proceso de pensamiento.
