# GoodTrading AI — Redis Latency Diagnostic (AI-6.4.4e)

## Why

Smoke reports `repo.putAsync` wall-clock latency. On STORED that path is **3 Redis round-trips**:

1. Lua CAS `EVAL`
2. `SADD` session index
3. `EXPIRE` session index

`removeSession` is **outside** the smoke timer. Thresholds (PASS ≤25ms / ACCEPTABLE ≤80ms) apply to that wall-clock put.

Near-identical p50/p95 (~455/460) suggests either multi-RTT stacking or a fixed delay — use the diagnostic to separate them.

## Run (Railway TERMINAL preferred)

```bash
GOODTRADING_AI_ALLOW_REDIS_DIAGNOSTIC=true \
npm run goodtrading-ai:telemetry:redis:latency-diagnostic
```

Then **unset** the flag (do not persist in Railway Variables).

Does **not** write validation proof. Does **not** replace full smoke.

## Blocks reported

config / createClient / connect / warm-up / raw SET·GET·PTTL·DEL / Lua CAS / serialization CPU / `repo_putAsync_full` / get / E2E put+get+remove.

## Route class (no host printed)

`PRIVATE_RAILWAY` | `PUBLIC_PROXY` | `LOCAL` | `UNKNOWN`  
Note: `REDIS_URL` may still point at `*.railway.internal`.
