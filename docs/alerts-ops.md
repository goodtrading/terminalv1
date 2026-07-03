# Unified Alerts Ops

## Scope

The unified alerts system supports web in-app alerts, desktop native notifications through Tauri v2, durable Postgres persistence, SSE resume, and mobile device registration scaffolding. Mobile push delivery remains disabled unless `ALERTS_MOBILE_PUSH_ENABLED=true`; no production push provider is wired yet.

## Flags

- `ALERTS_ENABLED=true`
- `ALERTS_DESKTOP_NATIVE_ENABLED=true`
- `ALERTS_WEB_NOTIFICATIONS_ENABLED=false`
- `ALERTS_MOBILE_PUSH_ENABLED=false`
- `ALERTS_ALLOW_MEMORY_FALLBACK=false` in production

Development can keep `ALERTS_ALLOW_MEMORY_FALLBACK=true` when Postgres is not running.

## Migration

Apply `migrations/0003_alerts.sql` before enabling alerts in production. Alert ownership columns reference `users(id)` with `ON DELETE CASCADE`; if an older draft of the migration was already applied with `user_id text`, stop and run an explicit ALTER migration instead of reapplying this file blindly.

## Desktop Native

Tauri notifications are owned by `client/src/lib/alertDelivery.ts`; avoid adding a second native notification sender elsewhere. The Tauri v2 plugin is registered in `src-tauri/src/lib.rs`, configured in `src-tauri/Cargo.toml`, and allowed in `src-tauri/capabilities/default.json`.

Windows desktop notification click/action behavior depends on OS integration. The adapter listens for plugin actions and records a pending alert action for the terminal layout, but the Tauri notification Actions API is mobile-focused, so desktop click-through should be manually verified in an installed build.

## Runtime Checks

```powershell
npx tsx --test server/services/alerts/alertPolicyEngine.test.ts
npm run check
cd src-tauri
cargo check
```

Use the alert-specific filter when repo-wide TypeScript noise is unrelated:

```powershell
npm run check 2>&1 | Select-String -Pattern "alerts|alertDelivery|useAlerts|AlertCenter|AlertBell|plugin-notification|src-tauri"
```

## Health And Simulator

- `GET /api/alerts/health` reports persistence mode, degraded state, memory fallback allowance, and SSE connection count.
- `POST /api/dev/alerts/simulate` is admin-only, rate-limited, and returns `404` in production.

Example simulator body:

```json
{
  "type": "system.data_source_down",
  "symbol": "BTCUSDT",
  "severity": "P0",
  "message": "Simulated source outage"
}
```

## Delivery Guarantees

Postgres adds a durable open-alert dedupe index on `(user_id, type, deduplication_key)`, delivery/history/device tables, and a process-wide advisory lock for alert evaluation. SSE emits event ids and replays alerts newer than `Last-Event-ID`.
