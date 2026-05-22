# Environment variables — GoodTrading

This document describes server-side configuration. **End users never edit `.env` files.** They only connect exchanges (for example BingX) from the terminal UI with their own API Key and Secret.

## BingX credential encryption

### `BINGX_CREDENTIAL_ENCRYPTION_KEY`

**What it is:** A single **global server secret** used to encrypt every user's BingX API Key and API Secret before they are stored. It is **not** per user and **not** something traders configure.

**Required for:** Persisting BingX Secure API (read-only) connections per logged-in user.

**Who configures it:** Operators / administrators per deployment (local `.env` or hosting provider variables).

**Who does not configure it:** Terminal users. Users only paste their BingX API Key and API Secret in the connection modal.

### Local development

1. Copy `.env.example` to `.env` in the project root (if you do not already have `.env`).
2. Set a random secret of at least 32 characters:

```env
BINGX_CREDENTIAL_ENCRYPTION_KEY=<32+ character random secret>
```

3. Restart the dev server (`npm run dev`).

On boot you should see either:

- `BingX credential encryption: configured`
- `BingX credential encryption: missing`

The actual key value is **never** printed in logs.

### Production (Railway and similar)

1. Open your project in Railway (or your host).
2. Go to **Variables** (environment variables for the **service**, not per user).
3. Add:

| Variable | Value |
|----------|--------|
| `BINGX_CREDENTIAL_ENCRYPTION_KEY` | A strong random string (32+ characters). Generate once per environment. |

4. Redeploy or restart the service so the process picks up the variable.

**Never:**

- Commit this value to Git
- Expose it in the frontend or API responses
- Share the same production key in public docs or chat

### If the key is missing

| Behavior | Detail |
|----------|--------|
| Connect test | May succeed in non-production with `save: false` (session-only). |
| Persist credentials | **Fails** with `BINGX_ENCRYPTION_KEY_MISSING`. |
| After browser refresh | User must enter API credentials again unless a saved connection already exists from a previous deploy that had the key. |

### Related BingX variables

See `.env.example` for:

- `BINGX_ENABLE_API_CONNECTION`
- `BINGX_ENABLE_API_TRADING` (`true` in phase 5B for permission probe; live submit still off)
- `BINGX_ENABLE_LIVE_TRADING` (`false` by default; set `true` only for controlled phase 5C limit submit)
- `BINGX_ALLOW_MARKET_ORDERS` (must stay `false` for phase 5C — live market blocked)
- `LIVE_TRADING_KILL_SWITCH` (`false` by default; set `true` to block all live submits)
- `MAX_ORDER_NOTIONAL_USDT` / `MAX_ACCOUNT_RISK_PCT` (required for dry-run and live; phase 5C first test: `2` / `0.5`)
- `BINGX_ESTIMATED_FEE_BPS` / `BINGX_ESTIMATED_SLIPPAGE_BPS` (optional preview estimates)
- `BINGX_ENABLE_ORDER_SUBMIT` (must stay `false` in phase 5A)
- `BINGX_ENABLE_ORDER_CANCEL` (must stay `false` in phase 5A)
- `BINGX_ENABLE_POSITION_CLOSE` (must stay `false` in phase 5A)
- `BINGX_API_BASE_URL`
- `BINGX_DEFAULT_SYMBOL`
- `MAX_ACCOUNT_RISK_PCT` (required for live readiness)
- `REQUIRE_SL_ON_LIVE_ORDERS` (default `true`)
- `BINGX_ENABLE_DRY_RUN` (default `true` — phase 5B preview only, no exchange submit)

### Phase 5C — first live LIMIT order

See [LIVE_LIMIT_SUBMIT_5C.md](./LIVE_LIMIT_SUBMIT_5C.md) for flags, readiness, Network tab expectations, and the step-by-step first real test (2 USDT, limit far from spot, manual cancel on BingX).

Run blocker checks before enabling live flags:

```bash
npm run test:live-submit-blockers
```

### Storage layout (development)

Encrypted connections are stored under `server/storage/bingx-connections.json` (gitignored). Each record includes `userId`, masked API key, and encrypted credentials. This file must not be committed.
