# GoodTrading AI — Redis Production Validation (AI-6.4.2)

Validates the AI-6.4.1 Redis telemetry repository against **real** Redis when explicitly authorized. Never invents smoke/latency results.

## Gate (mandatory)

Real smoke runs **only** when:

1. `GOODTRADING_AI_ALLOW_REDIS_SMOKE=true` (or `1`; deprecated alias `ALLOW_REDIS_SMOKE`)
2. Redis env classified **CONFIGURED** (`REDIS_PRIVATE_URL` / `REDIS_URL` / `REDISHOST+REDISPORT` + `redis` package)

Otherwise smoke **refuses** → latency / shared verdict stay **NOT_MEASURED**; `smokeValidated=false`.

```bash
GOODTRADING_AI_ALLOW_REDIS_SMOKE=true GOODTRADING_AI_TELEMETRY_REPOSITORY=redis \
  npm run goodtrading-ai:telemetry:redis:smoke
```

## Config classification (NAMES only)

| Class | Meaning |
|-------|---------|
| CONFIGURED | Connectable URL env + redis package |
| PARTIALLY_CONFIGURED | Incomplete host/port, or mode=redis without URL |
| NOT_CONFIGURED | No Redis URL/host signals |
| AMBIGUOUS | e.g. Upstash REST URL only |

Audit never prints env **values**. Proposed Railway steps are listed in status / docs — **not auto-applied**.

## Isolated smoke prefix

Smoke uses `smoke:{id}:` — never production `gt:ai:telem` and never `FLUSH*` / `KEYS*`.

Checks: connect → CAS → concurrent sequences (final **13**) → namespace isolation → multi-client shared read → latency p50/p95/p99 (50–100 iters) → cleanup via `removeSession`.

## Latency verdict

| Verdict | p95 put |
|---------|---------|
| PASS | ≤ 25 ms |
| ACCEPTABLE_WITH_WARNING | ≤ 80 ms |
| FAIL | > 80 ms |
| NOT_MEASURED | smoke not run / refused |

## Shared repository

| Verdict | Meaning |
|---------|---------|
| SHARED_REPOSITORY_CONFIRMED | Second client read same key (real Redis only) |
| SHARED_REPOSITORY_NOT_CONFIRMED | Failed or fake inject |
| NOT_MEASURED | Smoke not authorized |

## Connection lifecycle

1. `createRealRedisClient` connect with timeout  
2. Repository puts/gets  
3. `quit()` / disconnect  
4. Smoke cleanup of known session keys only  

Do not leave smoke keys on failure paths when cleanup can run; never FLUSH production DB.

## Status facts

`/api/internal/ai/market/status` exposes `redisSmoke` / mentor `redis.*` fields.  
`smokeValidated` is **true only** after a successful **real** smoke in-process — fake CI smoke never sets it.

`/health` remains independent of Redis (always 200 when process up).

## Mentor

`mentorEligible=false` always. Blockers include `MENTOR_INTEGRATION_NOT_ENABLED` and, when mode=redis without smoke, `REDIS_SMOKE_NOT_VALIDATED`. Mentor stays NO-GO.

## Failure / recovery

Dangerous Redis outage cases are exercised with **FakeRedis** (`UNAVAILABLE` → ingest 503 path). Do not simulate FLUSH against production.

## Railway readiness (proposed — manual)

1. Attach Railway Redis; set `REDIS_PRIVATE_URL` (prefer) or `REDIS_URL` (prefer `rediss://`)  
2. Set `GOODTRADING_AI_TELEMETRY_REPOSITORY=redis`  
3. Optional TTL/prefix: `GOODTRADING_AI_TELEMETRY_TTL_MS`, `GOODTRADING_AI_TELEMETRY_REDIS_PREFIX`  
4. Run opt-in smoke with `GOODTRADING_AI_ALLOW_REDIS_SMOKE=true`  
5. Confirm status `smokeValidated` + shared + latency  
6. Confirm `/health` and `mentorEligible=false`  

## Security

- No secret values in logs/status/docs  
- Error paths use `toSafeRedisError` codes  
- No KEYS / FLUSH / user EVAL / global SCAN  

## CI

`redisProductionValidation.test.ts` — FakeRedis / gate / redaction only. Real smoke is opt-in outside CI.


## Persistent proof vs process-local facts (AI-6.4.4b)

Process-local smoke facts (setRedisSmokeValidationFacts) live only in the current Node process and reset on restart.

For durable operator evidence after a real Railway smoke, see **[goodtrading-ai-telemetry-redis-validation-proof.md](./goodtrading-ai-telemetry-redis-validation-proof.md)** — persistent Redis proof key, TTL, status exposure, and one-shot ALLOW disable guidance.
