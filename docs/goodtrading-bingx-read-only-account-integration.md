# GoodTrading BingX Read-Only Account Integration (BINGX-1 / AI-8.0)

## Purpose

Observe a user's **real BingX** account from GoodTrading without placing, amending, or cancelling orders. Produce a sanitized **Trading Activity / Account Read Model** and a derived **action timeline** for a future AI-8 alignment with Market Snapshot / Decision Graph.

This phase does **not** wire Mentor live chat, Market Snapshot, Decision Graph, or OpenAI private payloads.

## Architecture

```
Client (BingxAccountActivityPanel)
  → GET/POST /api/account/bingx/*
    → server/integrations/bingx/account/*
         transport (GET allowlist only)
         normalizers (pseudonymized IDs)
         read model (TTL cache)
         reconciliation → timeline
         TraderActionContext (mentorEligible=false)
  Credentials: existing encrypted store (server/services/exchanges/bingx)
  Signing: server-side HMAC only
```

Legacy BingX read-only monitor (`/api/bingx/read-only/*`) remains for chart/risk mirror. The new account read model is additive and gated.

## Endpoint classification & allowlist

| Class | Examples | Adapter behavior |
|-------|----------|------------------|
| `PUBLIC_MARKET` | quote/contracts, ticker | Not used by account adapter |
| `PRIVATE_READ` | balance, positions, openOrders, allOrders, allFillOrders, income | Allowlisted GET only |
| `PRIVATE_WRITE` | place/cancel order, leverage, margin, withdraw, transfer | Always blocked |

Allowlist source: `server/integrations/bingx/account/allowlist.ts`.

## Read-only guarantees

- `BINGX_READ_ONLY_MODE=true` by default.
- Any write attempt throws `BINGX_WRITE_OPERATION_BLOCKED`.
- Account transport only exposes `privateGet` for allowlisted paths; `privateWrite` always throws.
- No Buy / Sell / Cancel / Edit controls in the AI-8.0 activity UI.
- Existing `BINGX_READ_ONLY_FREEZE` for live execution remains in force.

## Credentials

- API secret never leaves the server; never returned in JSON; never logged; never stored in `localStorage`.
- Safe status fields only: `configured`, `connected`, `permissionsClassification`, `lastValidatedAt`, `errorCode`, masked key.
- Signing uses timestamp + `recvWindow`; clock-drift and signature errors are classified; signature errors are **not** blindly retried.
- Recommend API keys **without** withdraw/trade for this phase. Keys with trade capability are classified `trading_capable` but writes remain blocked.

## Feature flags (defaults)

```
BINGX_READ_ONLY_MODE=true
GOODTRADING_BINGX_ACCOUNT_ENABLED=false
GOODTRADING_BINGX_ACCOUNT_AUTO_REFRESH=false
```

Optional:

```
GOODTRADING_BINGX_ACCOUNT_POLL_MS=15000   # min 10000
BINGX_RECV_WINDOW_MS=5000
BINGX_ACCOUNT_REQUEST_TIMEOUT_MS=12000
```

## Polling / refresh

- Controlled polling only when **both** account enabled and auto-refresh enabled.
- Default: **manual refresh** via `POST /api/account/bingx/refresh`.
- Single publisher, concurrency-limited transport (max 2), no request storms.
- No poll without authenticated user + saved connection.
- Poll timer uses `unref()` so it does not block process exit / `/health`.

## Reconciliation & timeline

Input: previous snapshot + current positions / open orders / fills → `BingxTradingActionEvent[]`.

Event types: `POSITION_*`, `ORDER_*`, `STOP_CHANGED_EXTERNALLY`, `TAKE_PROFIT_CHANGED_EXTERNALLY`, `MARGIN_MODE_OBSERVED`, `LEVERAGE_OBSERVED`, `ACCOUNT_STATE_UNCERTAIN`.

Confidence: `CONFIRMED` | `DERIVED` | `UNCERTAIN`.

Rules:

- Open order ≠ fill; fill ≠ intention; position ≠ intention.
- Missing evidence → `UNCERTAIN`, never invented actions.
- Source always `BINGX_ACCOUNT_READ_ONLY`.
- Timeline bounded (cap 200), no credentials / raw dumps.
- `mentorEligible=false`, `aiConsumptionEnabled=false`.

## Real / paper isolation

Account mode on every object:

- `REAL_BINGX_READ_ONLY`
- `PAPER_TRADING`
- `SIMULATED`
- `MANUAL`

UI badges: **BINGX REAL**, **READ ONLY**, **NOT CONNECTED TO AI**, venue label **REAL — READ ONLY**. Paper and real collections are never merged.

## Internal APIs (auth + entitlement + rate limit)

| Method | Path |
|--------|------|
| GET | `/api/account/bingx/status` |
| GET | `/api/account/bingx/snapshot` |
| GET | `/api/account/bingx/positions` |
| GET | `/api/account/bingx/orders/open` |
| GET | `/api/account/bingx/orders/history` |
| GET | `/api/account/bingx/fills` |
| GET | `/api/account/bingx/timeline` |
| POST | `/api/account/bingx/refresh` |
| GET | `/api/account/bingx/metrics` (sanitized latency counters) |
| GET | `/api/account/bingx/trader-action-context` (future AI; flags false) |

No order placement endpoints.

## AI boundary

`TraderActionContext` is a sanitized future contract (`shared/goodTradingAiBingxAccount.ts`).

```
canUseBingxAccountForMentor() === false
canUseBingxActionsForLearning() === false
mentorEligible === false
aiConsumptionEnabled === false
```

Not wired to `/api/ai/chat`, Market Snapshot, or Decision Graph in this phase. Brain remains immutable.

## Production smoke

Only with human-authorized **read-only** keys already configured:

1. `GOODTRADING_BINGX_ACCOUNT_ENABLED=true`
2. Keep `GOODTRADING_BINGX_ACCOUNT_AUTO_REFRESH=false`
3. Manual refresh once
4. Verify status/balances/positions/orders/fills/timeline
5. Confirm **no new BingX orders** were created

If no real credentials are present: **SKIPPED** (document as GO PARCIAL path).

## Failure modes

| Mode | Behavior |
|------|----------|
| Feature disabled | `403 BINGX_ACCOUNT_DISABLED` |
| Missing connection | `404` |
| Partial slice failure | Completeness `PARTIAL` / `DEGRADED`; warnings listed |
| Rate limit | `BINGX_RATE_LIMITED`, bounded backoff |
| Signature error | No blind retry |
| Clock drift | `BINGX_CLOCK_DRIFT` |
| Write attempt | `BINGX_WRITE_OPERATION_BLOCKED` |

## Privacy

- Pseudonymized `accountId` / `orderId` / `fillId` for client surfaces.
- `exchangeOrderId` stays in private adapter layer only.
- Logs: compact `[bingx-account]` lines; redacted; no full PnL dumps; no raw API bodies.

## Performance

Metrics via `/api/account/bingx/metrics`: p50/p95 for fetch slices, normalize, reconcile, total refresh. Poller does not block `/health`.

## What remains before AI-8 (Mentor alignment)

1. Explicit human approval to enable mentor-safe consumption flags.
2. Wire sanitized `TraderActionContext` (not raw account dumps) into Mentor / Decision Graph with entitlement gates.
3. Optional private user-data WebSocket audit (still read-only).
4. Durable timeline store (beyond bounded memory) if required.
5. Production smoke with dedicated read-only API keys.

## Tests

```
npm run test:bingx-account
```

Plus existing GoodTrading AI batteries and legacy `test:bingx-b1`.
