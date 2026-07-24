/** Feature flags for BingX account read-only integration (AI-8.0). Defaults OFF / safe. */

function envBool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v == null || v === "") return fallback;
  const n = v.trim().toLowerCase();
  if (n === "true" || n === "1" || n === "yes") return true;
  if (n === "false" || n === "0" || n === "no") return false;
  return fallback;
}

/** Default true — any write attempt must throw BINGX_WRITE_OPERATION_BLOCKED. */
export function isBingxReadOnlyMode(): boolean {
  return envBool("BINGX_READ_ONLY_MODE", true);
}

/** Master switch for the new account read model APIs/polling. Default false. */
export function isBingxAccountEnabled(): boolean {
  return envBool("GOODTRADING_BINGX_ACCOUNT_ENABLED", false);
}

/** Controlled auto-poll. Default false — manual refresh only unless explicitly enabled. */
export function isBingxAccountAutoRefreshEnabled(): boolean {
  return envBool("GOODTRADING_BINGX_ACCOUNT_AUTO_REFRESH", false);
}

export function getBingxAccountPollIntervalMs(): number {
  const raw = Number(process.env.GOODTRADING_BINGX_ACCOUNT_POLL_MS ?? "15000");
  if (!Number.isFinite(raw)) return 15_000;
  return Math.max(10_000, Math.min(120_000, Math.floor(raw)));
}

export function getBingxRecvWindowMs(): number {
  const raw = Number(process.env.BINGX_RECV_WINDOW_MS ?? "5000");
  if (!Number.isFinite(raw)) return 5_000;
  return Math.max(1_000, Math.min(60_000, Math.floor(raw)));
}

export function getBingxRequestTimeoutMs(): number {
  const raw = Number(process.env.BINGX_ACCOUNT_REQUEST_TIMEOUT_MS ?? "12000");
  if (!Number.isFinite(raw)) return 12_000;
  return Math.max(3_000, Math.min(30_000, Math.floor(raw)));
}

export const BINGX_ACCOUNT_SNAPSHOT_TTL_MS = 30_000;
export const BINGX_ACCOUNT_TIMELINE_CAP = 200;
export const BINGX_ACCOUNT_HISTORY_CAP = 100;
export const BINGX_ACCOUNT_FILLS_CAP = 100;
export const BINGX_ACCOUNT_ORDERS_CAP = 100;
export const BINGX_ACCOUNT_POSITIONS_CAP = 50;
