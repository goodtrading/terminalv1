# GoodTrading AI — Railway Redis Real Smoke & Persistent Proof (AI-6.4.4b)

## Why process-local facts are insufficient

`setRedisSmokeValidationFacts()` is **in-memory per Node process**. After smoke exits (or Railway restarts), status would forget `smokeValidated` unless persisted.

## Persistent proof

- Schema: `RedisValidationProof` **1.0** (`server/.../redisValidationProof.ts`)
- Redis key (stable admin, not smoke namespace): `{prefix}:admin:redis_validation_proof`
- Default prefix: `gt:ai:telem`
- **TTL: 7 days** (independent of telemetry 10–15s)
- Written **only** by authorized real smoke when all gates pass (CAS→13, namespace isolation, `SHARED_REPOSITORY_CONFIRMED`, latency not FAIL, cleanup OK)
- `mentorEligible` always `false` (Zod literal; cannot forge true)
- Status exposes **booleans + dates + redacted env name only** — never URL, password, or full proof key path in logs

## Cursor local vs Railway

| Context | Action |
|---------|--------|
| Cursor without Railway Redis env | **Do not run smoke** — results would invent nothing useful |
| Railway shell / one-off job inheriting vars | Run smoke once (below) |

## One-shot smoke INSIDE Railway (human / CLI)

After deploy `b136044+` is Success and Redis is linked:

```bash
GOODTRADING_AI_TELEMETRY_REPOSITORY=redis \
GOODTRADING_AI_ALLOW_REDIS_SMOKE=true \
npm run goodtrading-ai:telemetry:redis:smoke
```

Then **immediately**:

1. Unset / set `GOODTRADING_AI_ALLOW_REDIS_SMOKE=false`
2. Keep `GOODTRADING_AI_MARKET_TELEMETRY_ENABLED=false` for general users
3. Optionally keep `GOODTRADING_AI_TELEMETRY_REPOSITORY=redis` (ingest still OFF until telemetry flag ON)

Confirm via admin status (flag + auth): `redisValidationProof.smokeValidated=true`, `mentorEligible=false`.

## Latency classes

| Class | p95 put |
|-------|---------|
| GOOD | ≤ 25 ms (PASS) |
| ACCEPTABLE | ≤ 80 ms |
| HIGH | > 80 ms (FAIL — proof not written) |

## Memory vs Redis repository while telemetry OFF

| Mode | Effect with telemetry OFF |
|------|---------------------------|
| `memory` (default) | Safe boot; no Redis required for `/health` |
| `redis` | Factory/connect ready; ingest still blocked by telemetry flag OFF |

No silent memory fallback when mode=`redis` and Redis fails (ingest 503).

## If Railway shell unavailable

Agent reports **STOPPED_FOR_RAILWAY_SHELL** / **GO PARCIAL** — proof code ships; smoke results **not invented**.
