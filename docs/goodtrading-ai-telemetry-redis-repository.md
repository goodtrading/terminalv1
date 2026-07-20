# GoodTrading AI — Redis Telemetry Repository (AI-6.4.1 / 6.4.3a contract)

Ephemeral, latest-only, multi-instance market telemetry store backed by Redis.

## Why Redis (not Postgres / filesystem)

| Need | Redis | Postgres |
|------|-------|----------|
| Latest-only overwrite | SET + short TTL | Heavy for ephemeral |
| Short TTL auto-expiry | native PX | manual job |
| Atomic CAS sequence | Lua / WATCH | possible but slower |
| High frequency small payload | ideal | not justified |
| Shared across replicas | yes | yes but overkill |

Filesystem store is **FORBIDDEN**. No automatic Postgres/filesystem fallback.  
When `GOODTRADING_AI_TELEMETRY_REPOSITORY=redis` and Redis is unavailable → **503 ingest** (no silent memory fallback). Live snapshot continues **without** client telemetry.

## Env contract (canonical — AI-6.4.3a)

| Variable | Default | Notes |
|----------|---------|-------|
| `GOODTRADING_AI_TELEMETRY_REPOSITORY` | `memory` | `memory` \| `redis` (`shared` = deprecated alias) |
| `REDIS_PRIVATE_URL` | — | **preferred** when both private + public exist |
| `REDIS_URL` | — | fallback public URL |
| `REDISHOST` + `REDISPORT` | — | compose alternative (+ optional `REDISUSER` / `REDISPASSWORD` / `REDIS_TLS`) |
| `GOODTRADING_AI_TELEMETRY_REDIS_PREFIX` | `gt:ai:telem` | key prefix |
| `GOODTRADING_AI_TELEMETRY_TTL_MS` | `12000` | clamped **10–15s** (**canonical**) |
| `GOODTRADING_AI_TELEMETRY_REDIS_TTL_MS` | — | **deprecated alias** of TTL (warns once) |
| `GOODTRADING_AI_TELEMETRY_REDIS_TIMEOUT_MS` | `2000` | connect timeout |
| `GOODTRADING_AI_ALLOW_REDIS_SMOKE` | unset/false | opt-in real smoke (**canonical**) |
| `ALLOW_REDIS_SMOKE` | — | **deprecated alias** of smoke flag (warns once) |

TLS: use `rediss://` URL. Status responses redact URL/password (env **names** only).

## Key design (pseudonymized)

```
{prefix}:t:{userHash}:{sessionHash}:{real|syn}:{SYMBOL}
{prefix}:sess:{userHash}:{sessionHash}   # session index set (removeSession)
```

`buildTelemetryRepositoryKey()` — SHA-256 truncated hashes; no raw session ids in key material beyond hash input.

## Record

`RedisTelemetryRecord` schemaVersion **1.0** — wraps `CompactMarketTelemetry` + sequence / TTL metadata.

## Atomic CAS

Fixed Lua script (`TELEMETRY_CAS_LUA`) outcomes:

| Outcome | Meaning |
|---------|---------|
| STORED | accepted, TTL set |
| DUPLICATE | same sequence — **TTL not renewed** |
| REPLAY | lower sequence rejected |
| CONFLICT | concurrent loss (tests / watch) |
| UNAVAILABLE | Redis error → ingest 503 |

No user-supplied EVAL. No `KEYS*` / `FLUSH*` / global SCAN hot path.  
`removeSession` uses session index `SMEMBERS` + `DEL`.

## Failure isolation

- Ingest: redis fail → **503** `TELEMETRY_REDIS_UNAVAILABLE`, `serverSnapshotUnaffected: true`
- Live snapshot: read fail → continue **without** client telemetry merge
- `/health` — independent of Redis

## Mentor

`mentorEligible=false` always. Blocker `MENTOR_INTEGRATION_NOT_ENABLED`. Do not wire Mentor/OpenAI.

## Client

Official **`redis`** (node-redis) v5 — ESM-friendly, Railway-compatible TCP/`rediss://`.

## Tests / smoke

- Unit: `redisRepository.test.ts` with **FakeRedisClient** (no network)
- Opt-in: `GOODTRADING_AI_ALLOW_REDIS_SMOKE=true npm run goodtrading-ai:telemetry:redis:smoke`
- Real Redis latency: **NOT MEASURED** unless smoke succeeds

## Load model (fake estimates)

| Scale | Notes |
|-------|-------|
| 100 | fake Map put budget |
| 1k | fake local |
| 10k | extrapolated from sample — not production Redis |

## Debug UI

Market Snapshot status shows `repositoryConfigured` Memory/Redis, redacted `redis` block, `redisError`, mentor readiness stages (`redis_ready` / `redis_blocked` / `redis_error`).

## Verdict guidance

- Impl + FakeRedis tests green, smoke not run → **GO PARCIAL** (real latency NOT MEASURED)
- Smoke green on Railway Redis → can claim shared multi-instance **GO** for repository only (Mentor still NO-GO)
