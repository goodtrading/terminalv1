# GoodTrading AI — Telemetry Production Readiness (AI-6.3 / AI-6.4)

## Purpose

Production path for **real** compact market telemetry into Live Snapshot — with Mentor permanently disconnected.

```
Terminal LiquidityHeatmapPanel
  → useBookmapTrades → bookmapTradeAggregation.summary  (existing producer)
  → useBookmapTelemetryRuntimeBridge (React effect owner — NOT canvas/frame)
  → RealMarketTelemetryRuntimeBridge (coalesce + register)
  → selectorRegistry
  → CompactMarketTelemetryPublisher (Debug manual; auto-publish OFF by default)
  → POST /api/internal/ai/market/telemetry
  → MarketTelemetryRepository (memory default)
  → adapter → Live Snapshot
```

**Never** Mentor / OpenAI / Reasoning / Decision Graph / new WS / raw book/trades/heatmap.

## Producer audit (AI-6.4)

| Producer | Path | Notes |
|----------|------|-------|
| **Real** | `useBookmapTrades` → `buildBookmapTradeAggregation().summary` inside `LiquidityHeatmapPanel` | Auto-wired via Runtime Bridge |
| Harness | Debug “Seed Real Harness” | Controlled tests only — not “enough” for production claim |

## Runtime Bridge

- Module: `client/src/lib/marketTelemetry/runtimeBridge.ts` (Web + Tauri shared)
- Hook owner: `useBookmapTelemetryRuntimeBridge` — effect only, cleanup on symbol/unmount
- Mounted next to producer in `LiquidityHeatmapPanel` (not paint/canvas loop)
- Material coalescing (~100ms / fingerprint) — no second aggregation engine, no timers for publish
- Registers reduced OF (+ optional lifecycle counts); footprint remains optional/PARTIAL

## Auto-publish

`GOODTRADING_AI_MARKET_TELEMETRY_AUTO_PUBLISH_INTERNAL` default **false**.  
Manual Debug Start/Stop/Send Once remains the supported path. No general end-user publish.

## Shared repository

| Backend | Classification | Action |
|---------|----------------|--------|
| Redis client (`ioredis`/`redis`/`@upstash`) | **REQUIRES_NEW_DEP** | Do **not** install without approval |
| REDIS_* env alone | REQUIRES_NEW_DEP | Insufficient without client |
| Postgres `DATABASE_URL` | POSSIBLE | Ephemeral TTL **not justified** — not selected |
| Filesystem | FORBIDDEN | — |
| Memory | READY (single-instance) | Default |

Env: `GOODTRADING_AI_TELEMETRY_REPOSITORY=memory|redis` (default **memory**; `shared` = deprecated alias for redis).

- `redis` without URL/client ready → **throws / HTTP 503** on ingest — **no silent memory fallback**
- Client telemetry degrades; **server live snapshot without telemetry still works**
- `FakeRedisClient` + `RedisMarketTelemetryRepository` for unit tests; opt-in smoke script for real Redis

**Verdict:** See `docs/goodtrading-ai-telemetry-redis-repository.md` (AI-6.4.1). Redis adapter shipped; real multi-instance GO when `REDIS_URL` configured.

## Mentor

`canUseTelemetryForMentor()` / `mentorEligible` **always false**.  
`buildTelemetryMentorReadiness()` documents blockers. **Mentor integration = NO-GO.**

## Flags (default OFF)

| Flag | Default |
|------|---------|
| `GOODTRADING_AI_MARKET_SNAPSHOT_ENABLED` | false |
| `GOODTRADING_AI_MARKET_LIVE_ENABLED` | false |
| `GOODTRADING_AI_MARKET_TELEMETRY_ENABLED` | false |
| `GOODTRADING_AI_MARKET_TELEMETRY_AUTO_PUBLISH_INTERNAL` | false |
| `GOODTRADING_AI_TELEMETRY_REPOSITORY` | memory |

## Debug UI stages

Status exposes `mentorReadiness.stages`: producer / registry / repository / snapshotMerge.  
Real vs Synthetic badges. Seed Harness ≠ production producer.

## Perf

Builder/coalesce p95 targets in harness. **FPS = NO DETERMINABLE** without Bookmap render FPS harness.

## GO / GO PARCIAL / NO-GO

| Item | Verdict |
|------|---------|
| Auto real summary wiring (bridge) | **GO** |
| CVD/delta real path | **GO** |
| Footprint absorption/exhaustion | **UNAVAILABLE** |
| Spoofing | **GO PARCIAL** (DERIVED) |
| Shared Redis repository | **GO PARCIAL** (adapter shipped; needs REDIS_URL + smoke for full GO) |
| Memory multi-instance | **NO-GO / UNSAFE** |
| Mentor integration | **NO-GO** (mandatory) |
| Web/Tauri parity (shared modules) | **GO** |
