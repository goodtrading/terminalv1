# GoodTrading AI — Redis Latency Diagnostic (AI-6.4.4e/f)

## Why

Smoke reports `repo.putAsync` wall-clock latency.

**AI-6.4.4f:** on STORED, `putAsync` is **1 Redis round-trip** — a single Lua `EVAL` that performs CAS + `SADD` + `EXPIRE` atomically. DUPLICATE/REPLAY do not renew TTL and do not touch the session index.

**Pre-6.4.4f (legacy comparison only):** 3 round-trips (CAS EVAL + `SADD` + `EXPIRE`). The diagnostic still samples that path under `legacy_3cmd_put_diag_only` in the isolated `diag:*` namespace (few samples).

`removeSession` is **outside** the smoke timer. Thresholds (PASS ≤25ms / ACCEPTABLE ≤80ms) still apply to put wall-clock — **not auto-changed** in this phase.

## Run (Railway TERMINAL preferred)

```bash
GOODTRADING_AI_ALLOW_REDIS_DIAGNOSTIC=true \
npm run goodtrading-ai:telemetry:redis:latency-diagnostic
```

Then **unset** the flag (do not persist in Railway Variables).

Does **not** write validation proof. Does **not** replace full smoke.

## Blocks reported

config / createClient / connect / warm-up / raw SET·GET·PTTL·DEL / Lua CAS-only / **rawLuaAtomicPut** / serialization CPU / `repo_putAsync_full` (expected RTT=1) / legacy 3-cmd (diag only) / get / E2E put+get+remove.

## Route + topology (no host printed)

- Route: `PRIVATE_RAILWAY` | `PUBLIC_PROXY` | `LOCAL` | `UNKNOWN`  
  Note: `REDIS_URL` may still point at `*.railway.internal`.
- Topology: `SAME_REGION_HEALTHY` | `SATURATED` | `CROSS_REGION` | `UNKNOWN` | `AMBIGUOUS`
