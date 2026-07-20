# GoodTrading AI — Compact Market Telemetry Bridge (AI-6.2)

## Purpose

Safe bridge from **client-derived** compact market metrics (CVD/delta, footprint flags, lifecycle counts) into the **Live Market Snapshot** path — without dumping canvas, raw books, trades, heatmaps, or footprint candles.

```
Client selectors → buildCompactMarketTelemetry()
  → CompactMarketTelemetryPublisher (flag + auth)
  → POST /api/internal/ai/market/telemetry
  → InMemoryMarketTelemetryStore (TTL 10–15s, user+session+symbol)
  → ClientTelemetryMarketAdapter (origin-preserving)
  → LiveSnapshotCoordinator → Snapshot Engine
```

## Flags (default OFF)

| Flag | Role |
|------|------|
| `GOODTRADING_AI_MARKET_SNAPSHOT_ENABLED` | Snapshot admin APIs |
| `GOODTRADING_AI_MARKET_LIVE_ENABLED` | Live internal adapters |
| `GOODTRADING_AI_MARKET_TELEMETRY_ENABLED` | Telemetry ingest + merge |

Telemetry merge into `/live` only applies when a valid ephemeral entry exists for `userId + sessionId + symbol`.

## Contract (`schemaVersion: "1.0"`)

Shared Zod: `shared/goodTradingAiMarketTelemetry.ts`

- **Order flow**: CVD/delta bias + imbalance % — no trade arrays
- **Footprint**: stacked/POC flags — `exhaustionHint` stays `unknown` unless a real selector exists (currently UNAVAILABLE/PARTIAL)
- **Lifecycle**: pulling/spoofing **counts → hypothesis only** (`DERIVED`), never OBSERVED spoofing
- Hard payload cap: **16 KB**; typical &lt; 8 KB
- Interval clamp: **≥ 1000 ms** (default **2000 ms**)
- Provenance: `OBSERVED` | `DERIVED` | `INFERRED` — adapter never escalates

## Bridgeability (audit)

| Metric | Bridgeable | Origin | Notes |
|--------|------------|--------|-------|
| CVD / delta / imbalance | YES | DERIVED | From trade-session summary selectors |
| Footprint stacked / POC | PARTIAL | DERIVED | Exhaustion/absorption not implemented → `unknown` |
| Spoofing / pulling | PARTIAL | DERIVED | Counts → hypothesis only |
| Raw book / trades / heatmap | NO | — | Forbidden in payload |
| Canvas dump | NO | — | Forbidden |

## Ephemeral store + multi-instance debt

- Implementation: `InMemoryMarketTelemetryStore` (`repositoryMode: "memory"`)
- Key: `userId|sessionId|symbol`
- TTL: ~12s (`TELEMETRY_TTL_MS`), LRU max 500
- Replay: reject duplicate / lower `sequence`
- **Debt**: process-local only. Multi-instance / sticky-session or Redis required for HA.
- Interface: `MarketTelemetryRepository` (`mode: "memory" | "redis"`) for future Redis adapter — **not implemented**.

## Security checklist

- [x] Auth required (SaaS cookie / Bearer) + admin/entitlement guards (same as market snapshot)
- [x] Flag default OFF
- [x] Payload size hard limit
- [x] Timestamp skew window
- [x] Session ownership + sequence replay protection
- [x] No OpenAI / no `/api/ai/chat`
- [x] No new WebSockets
- [x] No `buildLiveMarketContext` / `getTerminalState` on this path
- [x] No localStorage raw dump on publisher
- [x] Debug UI: Start / Stop / Send Once — **no auto-start**
- [x] Not wired to Mentor / Reasoning / alerts / trading / end users

## Debug UI

Admin → Market Snapshot → **Client Telemetry** tab:

- Start / Stop / Send Once
- Uses synthetic reduced summaries for demo (replace with Bookmap selector summaries when panel is live)
- Never shows secrets or raw books

## Observability

Compact logs only (`logTelemetryObs`): ingest / reject / live_merge — no payload dumps.

## Capability matrix

Capabilities list `client_telemetry_*` with:

- `implementationCapability` — what the bridge can do in code
- `sessionAvailability` — whether this session currently has fresh telemetry (runtime / cache)

## GO / GO PARCIAL

Expected verdict: **GO PARCIAL**

- CVD/delta: **GO**
- Footprint absorption/exhaustion: **UNAVAILABLE** (honest)
- Spoofing: **GO PARCIAL** (DERIVED hypothesis from counts)
- Multi-instance Redis: documented debt

## AI-6.3 follow-up

See `docs/goodtrading-ai-telemetry-production-readiness.md` for real selector wiring, namespaces, Railway audit, and **Mentor NO-GO** (`mentorEligible=false`).
