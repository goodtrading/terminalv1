# GoodTrading AI — Redis Validation Semantics (AI-6.4.4g)

## Architecture decision

Separate three concerns:

1. **RedisCorrectnessValidation** (functional) — connect, CAS, concurrent sequence 13, namespace isolation, shared repository, cleanup.
2. **RedisPerformanceAssessment** (honest) — GOOD / ACCEPTABLE / **HIGH** against versioned thresholds. HIGH means *success + slow*, never “PASS”, never `performancePassed=true`.
3. **TelemetryMentorReadiness** — `mentorEligible=false` always. Never FULLY READY.

Proof may say: *Redis validated correctly **with** performance HIGH*.  
It must **never** say Redis is fast, turn HIGH into PASS, set `performancePassed=true`, or set `mentorEligible=true`.

## ValidationStatus

| Status | Meaning |
|--------|---------|
| `VALIDATED` | Correctness PASS + performance GOOD or ACCEPTABLE |
| `VALIDATED_WITH_PERFORMANCE_WARNING` | Correctness PASS + performance HIGH (or unapproved) |
| `VALIDATION_FAILED` | Correctness FAIL |
| `NOT_VALIDATED` | No proof / expired / not measured |

## Proof schema 2.0

Nested: `correctness` / `performance` / `security` / `metadata`.  
`thresholdsVersion`: `redis-performance-v1`.  
Write **only** 2.0. Read legacy **1.0** (migrate in memory; legacy latency `FAIL` → performance `HIGH`).

Persist only if: correctness PASS + required fields measured + real Redis (or test opt-in) + no secrets + no silent memory fallback + `mentorEligible=false`.

## ACTIVE performance policy (`redis-performance-v1`)

Successful command / `putAsync` p95:

- **GOOD** ≤ 25 ms  
- **ACCEPTABLE** ≤ 80 ms  
- **HIGH** > 80 ms (e.g. ~138 ms private RTT — **not** GOOD)

`PROPOSED` bands exist in code for documentation only — **not ACTIVE** without human approval. Do not silently raise ACTIVE thresholds to force GO.

## Smoke exit codes

| Code | Meaning |
|------|---------|
| 0 | Correctness PASS (proof may persist even if HIGH) |
| 1 | Correctness FAIL |
| 2 | Refused (gate) |

Percentiles remain visible on the smoke payload.

## Status / UI badges

- `REDIS VALIDATED` when correctness proof present  
- `PERFORMANCE WARNING` when HIGH / not approved  
- **Never** a single green FULLY READY

Blockers include `REDIS_PERFORMANCE_NOT_APPROVED` and `MENTOR_INTEGRATION_NOT_ENABLED`. Warning: `REDIS_HIGH_LATENCY`.

## Run smoke (one-shot)

```bash
GOODTRADING_AI_ALLOW_REDIS_SMOKE=true \
npm run goodtrading-ai:telemetry:redis:smoke
```

Then unset the flag. Prefer Railway SSH on TERMINAL when Redis is private.
