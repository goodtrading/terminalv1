# GoodTrading AI Calibration Lab (FASE AI-2.1)

Uso interno — Metodología GoodTrading. **No** es el panel Mentor de producto.

## Activar

```bash
GOODTRADING_AI_CALIBRATION_ENABLED=true
# Mentor product flag is independent:
# GOODTRADING_AI_ENABLED=true
```

Reiniciar server. Acceso: usuario **admin** autenticado (sesión/JWT vía `requireSaasAuth` + `isAdminRole`).

UI: `/admin/ai-lab` (también link desde Admin Panel).

No confiar en: hide de UI, email del cliente, localStorage, query params, headers custom.

## Flujo editorial

```
Case → respuesta AI actual (Mentor engine) → revisión Ignacio
  → proposal (PENDING) → aprobación manual de proposal
  → CLI dry-run → patch export → (apply real solo cuando el árbol esté limpio y con --force)
  → validación registry → tests → Golden Case (solo APPROVED)
```

**Nunca** se auto-aplican cambios al guardar una review. HTTP **no** muta archivos de knowledge.

## CLI entrevista

```bash
npm run goodtrading-ai:calibrate
```

Sin red, sin API keys, sin mutar knowledge. Exporta JSON al final.

## Apply offline

```bash
npm run goodtrading-ai:calibration:apply -- --proposal <id> --dry-run
npm run goodtrading-ai:calibration:apply -- --proposal <id> --approve-first --dry-run
```

Si el working tree está dirty (estado actual del repo): **auto-apply NO-GO** → solo dry-run + `calibration/data/patch-<id>.md`.

## Persistencia

Archivo local: `server/ai/goodTradingAi/calibration/data/calibration-store.json`  
(dev/single-instance; documentado — no es store distribuido).

Changelog: `server/ai/goodTradingAi/knowledge/changelog/editorial-changelog.jsonl`

## Tests

```bash
npm run test:goodtrading-ai
npm run test:goodtrading-ai:evals
npm run goodtrading-ai:calibration:test
```

## Checklist never-introduce

- [ ] No live market / Bookmap / `buildLiveMarketContext`
- [ ] No embeddings / providers externos
- [ ] No auto-apply en review save
- [ ] No inventar approvals de Ignacio / golden cases
- [ ] No exponer corpus completo al cliente
- [ ] No commit/push desde el applicator
- [ ] No confiar en claims de rol del cliente

## Recover / revert

1. Restaurar `calibration-store.json` desde backup/export
2. Ignorar patches en `calibration/data/patch-*.md` si no se aplicaron
3. Knowledge modules no se tocan automáticamente en AI-2.1 dry-run mode
