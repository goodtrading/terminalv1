# GoodTrading AI — Live Market Source Adapters (AI-6.1)

Read-only adapters that map **existing server-side** market state into the AI-6 Market Snapshot.

## Philosophy

`Source → Read-only Adapter → Observation → Evidence → Snapshot Builder`

- Never invent metrics. Prefer `UNAVAILABLE` / `UNKNOWN`.
- Distinguish **OBSERVED** vs **DERIVED** vs **INFERRED**. Never present INFERRED as OBSERVED.
- Staleness is visible per source (`ageMs`, `stale`, thresholds).
- No new WebSockets, no Bookmap mutations, no Mentor/OpenAI wiring.

## Flags (both default OFF)

| Flag | Role |
|------|------|
| `GOODTRADING_AI_MARKET_SNAPSHOT_ENABLED` | Admin Market Snapshot APIs/UI |
| `GOODTRADING_AI_MARKET_LIVE_ENABLED` | Enables `GET /api/internal/ai/market/live` |

## Endpoints (admin + snapshot flag)

- `GET /api/internal/ai/market/status`
- `GET /api/internal/ai/market/capabilities`
- `GET /api/internal/ai/market/snapshot` — stub
- `POST /api/internal/ai/market/simulate`
- `GET /api/internal/ai/market/live` — requires live flag

## Capability matrix (audit-backed)

| Lens | Availability | Source | Notes |
|------|--------------|--------|-------|
| gamma | Available | MemStorage market + walls + ticker | `hypothesisOnly` |
| orderFlow | Partial | Absorption on positioning if present | CVD/footprint client-only |
| liquidity | **Partial (GO PARCIAL)** | Walls/magnets/sweep compact | Raw DOM/heatmap **NO-GO**; spoofing UNKNOWN |
| dom | Partial | Order book **health only** | No bids/asks dump |
| openInterest | Partial | Options OI concentration | Futures OI/funding unavailable |
| footprint | Unavailable | — | Bridge needed |
| marketStructure | Unavailable | — | No HH/HL engine |

## Forbidden

- `buildLiveMarketContext` in live path
- `getTerminalState` on every snapshot
- New WebSockets / polling / retries inside adapters
- Full heatmap / 1000-level books in snapshot
- Wiring live snapshot into Mentor / OpenAI / alerts / trading

## Debug UI

`/admin/market-snapshot` — modes Stub / Simulated / Live Internal. **Manual Refresh only** (no auto-poll).

## Tests

```bash
npm run test:goodtrading-ai:market
```

## Liquidity verdict

**GO PARCIAL** — compact semantic fields only; disable raw DOM adaptation for p95/security.
