# Phase 5C — Controlled live LIMIT submit

Operators only. End users never edit `.env`.

## Environment (activate only after blocker tests)

```env
BINGX_ENABLE_DRY_RUN=true

# Live controlled limit submit
BINGX_ENABLE_LIVE_TRADING=true
BINGX_ENABLE_API_TRADING=true
BINGX_ENABLE_ORDER_SUBMIT=true

# Still disabled in 5C
BINGX_ALLOW_MARKET_ORDERS=false
BINGX_ENABLE_ORDER_CANCEL=false
BINGX_ENABLE_POSITION_CLOSE=false
LIVE_TRADING_KILL_SWITCH=false

# Strict limits
MAX_ORDER_NOTIONAL_USDT=2
MAX_ACCOUNT_RISK_PCT=0.5
REQUIRE_SL_ON_LIVE_ORDERS=true

BINGX_ESTIMATED_FEE_BPS=5
BINGX_ESTIMATED_SLIPPAGE_BPS=2
```

Do **not** enable these on local/Railway until dry-run and blocker tests pass.

## Readiness

`GET /api/live/readiness?exchange=bingx` must return:

- `status: "ready_for_live"`
- `readyForDryRun: true`
- `readyForLive: true`

Warnings (expected): limit only, market disabled, cancel/close disabled.

Cancel/close flags **do not** block `ready_for_live` in phase 5C.

## First real LIMIT test (manual)

1. Activate 5C flags above; restart server.
2. Confirm readiness `ready_for_live`.
3. BingX connected; balance loaded.
4. Order type **LIMIT** (not market).
5. Notional **2 USDT**.
6. Limit price **far from spot** so it does not fill immediately:
   - Buy: well below mark.
   - Sell: well above mark.
7. Stop loss set.
8. Preview → `DRY RUN ONLY — ORDER NOT SENT` with no blockers.
9. Type exactly: `CONFIRM LIVE LIMIT`.
10. Click **SUBMIT LIVE LIMIT**.
11. Response: `orderSubmitted: true`, `orderId`, `clientOrderId`.
12. Verify order on BingX UI.
13. Audit: `live_order_submitted`.
14. Cancel **manually on BingX** (terminal cancel is disabled).

## Network

| Phase | Allowed | Forbidden |
|-------|---------|-----------|
| Dry-run | `POST /api/live/order-preview` | `POST …/openApi/swap/v2/trade/order` from browser |
| Live submit | `POST /api/live/order-submit` | Browser → BingX trade API |
| Live submit (server) | One signed `POST /openApi/swap/v2/trade/order` | cancel, close, market |

## Blocker verification script

```bash
npm run test:live-submit-blockers
```

Runs guard/unit checks without calling BingX.
