# GoodTrading AI — Railway Redis Provisioning (AI-6.4.3)

**Status pattern:** `STOPPED_FOR_HUMAN_CONFIG` until Redis exists, is linked to the backend service, and env NAMES are confirmable without printing values.

This runbook never stores secrets. Do not paste `REDIS_URL` / passwords into git, chat, or docs.

## Classification (evidence-based)

| Class | Meaning |
|-------|---------|
| `REDIS_READY` | Redis service exists, linked, connectable URL env present on backend, smoke gate can run |
| `REDIS_EXISTS_NOT_LINKED` | Redis plugin/service visible but backend lacks URL reference |
| `REDIS_NOT_CREATED` | No Redis service / cannot evidence creation |
| `REDIS_CONFIGURATION_AMBIGUOUS` | Partial signals (CLI missing, dashboard-only, Upstash REST only, etc.) |

Local agent evidence that forces **STOP** (example): Railway CLI missing, no `.railway` link, all `REDIS_*` UNSET, `railway.toml` has no Redis.

## Proposed variables (backend service)

Set on the **web/API** service (same service as `railway.toml` Express deploy). Adapt `Redis` to the **exact** Railway service name shown in the UI.

| Variable | Suggested value (reference — not a secret paste) | Notes |
|----------|--------------------------------------------------|--------|
| `REDIS_PRIVATE_URL` or `REDIS_URL` | Railway variable reference, e.g. `${{Redis.REDIS_PRIVATE_URL}}` | Prefer **private** first |
| `GOODTRADING_AI_TELEMETRY_REPOSITORY` | `memory` until smoke GO; then `redis` | Keep **memory** during first Redis attach if you want zero ingest risk |
| `GOODTRADING_AI_TELEMETRY_REDIS_PREFIX` | `gt:ai:telem` | Production prefix; smoke uses isolated `smoke:{id}:` |
| `GOODTRADING_AI_TELEMETRY_TTL_MS` | `12000` | Clamped 10–15s (canonical); alias `GOODTRADING_AI_TELEMETRY_REDIS_TTL_MS` deprecated |
| `GOODTRADING_AI_TELEMETRY_REDIS_TIMEOUT_MS` | `2000` | Connect timeout |
| `GOODTRADING_AI_MARKET_TELEMETRY_ENABLED` | `false` | Stay OFF for general users |
| `GOODTRADING_AI_ALLOW_REDIS_SMOKE` | unset / `false` except one-shot smoke | Canonical; alias `ALLOW_REDIS_SMOKE` deprecated |

Do **not** set telemetry flags ON for end users as part of provisioning.

## Click-by-click — Railway UI (human)

### A. Open project
1. Open [https://railway.app](https://railway.app) and sign in.
2. Open the **GoodTrading** project that deploys this repo (`desktop/tauri-app` / Express+Vite).
3. Confirm you see the **backend** service (the one with `railway.toml` healthcheck `/health`).

### B. Create Redis (if missing)
1. In the project canvas, click **+ Create** / **New**.
2. Choose **Database** → **Redis** (Railway Redis plugin).
3. Wait until the Redis service status is healthy/running.
4. Open the Redis service → **Variables** (or **Connect**).
5. Confirm variable **names** exist such as `REDIS_URL` / `REDIS_PRIVATE_URL` (do not copy values into chat/git).
6. Note the **exact service name** (e.g. `Redis`, `redis`, `Redis-xyz`) for references below.

### C. Link Redis → backend (variable references)
1. Open the **backend** service → **Variables**.
2. Add variable `REDIS_URL` (or prefer `REDIS_PRIVATE_URL` if Railway documents private networking for your plan).
3. Use **Variable Reference** / “share from service” — select the Redis service → select its URL variable.  
   Example shape (name may differ): `${{Redis.REDIS_PRIVATE_URL}}` or `${{Redis.REDIS_URL}}`.
4. Optionally add:
   - `GOODTRADING_AI_TELEMETRY_REPOSITORY` = `memory` (safe) or `redis` only when ready to validate.
   - `GOODTRADING_AI_TELEMETRY_REDIS_PREFIX` = `gt:ai:telem`
   - `GOODTRADING_AI_TELEMETRY_TTL_MS` = `12000`
5. Ensure `GOODTRADING_AI_MARKET_TELEMETRY_ENABLED` remains **`false`** for general users.
6. Leave `GOODTRADING_AI_ALLOW_REDIS_SMOKE` **unset** until the one-shot smoke step.

### D. Redeploy backend
1. Backend service → **Deployments** → **Redeploy** (or wait for auto-redeploy after variable save).
2. Wait until deploy is **Success**.
3. Hit `/health` on the public domain — expect **200** (health must not depend on Redis).

### E. Confirm without revealing secrets
1. Backend → Variables: confirm **names** `REDIS_URL` or `REDIS_PRIVATE_URL` show as set (Railway may mask values — good).
2. Optional admin status (flag-gated): `/api/internal/ai/market/status` should show redacted `redis.urlEnvName` / `redisConfigClassification` — never raw URL.
3. Do **not** paste variable values into Slack/git/Cursor chat.

### F. One-shot real smoke (only after E)
On a trusted machine with Railway CLI **or** a one-off Railway shell / local env injected by you (not committed):

```bash
GOODTRADING_AI_ALLOW_REDIS_SMOKE=true GOODTRADING_AI_TELEMETRY_REPOSITORY=redis \
  npm run goodtrading-ai:telemetry:redis:smoke
```

Expect JSON with `event: redis_smoke_ok`, `sharedRepository: SHARED_REPOSITORY_CONFIRMED`, latency verdict — **without** URL fields.

Then **disable** smoke:
1. Unset / set `GOODTRADING_AI_ALLOW_REDIS_SMOKE=false` on the service.
2. Keep `GOODTRADING_AI_MARKET_TELEMETRY_ENABLED=false` unless intentionally enabling internal telemetry.

### G. After smoke GO — tell the agent to resume AI-6.4.3 tasks 4–13
Reply in chat with **only**:

- Redis service name (no URL)
- Whether `REDIS_URL` or `REDIS_PRIVATE_URL` is linked (name only)
- Smoke result: ok / fail (no secrets)
- Branch still `desktop/tauri-app`

The agent will then re-audit, run gated smoke if still authorized, and only then consider selective commit/push.

## What the agent must NOT do while STOPPED

- Invent `REDIS_READY` / `SHARED_REPOSITORY_CONFIRMED` / latency numbers
- Run smoke without `GOODTRADING_AI_ALLOW_REDIS_SMOKE` + CONFIGURED evidence
- Commit or push
- Print or store Redis URLs/passwords
- FLUSH / KEYS / delete outside `smoke:{id}:` namespace

## Commit/push policy (later)

Only if **all** real Redis gates GO and dirty tree is AI-telemetry-only:

```text
feat(ai): add production market snapshot telemetry pipeline
git push origin desktop/tauri-app
```

If Bookmap/MDM/exports/.env are dirty → selective plan, no blanket add.
