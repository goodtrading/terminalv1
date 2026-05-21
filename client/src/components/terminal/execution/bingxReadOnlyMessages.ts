/** User-facing BingX read-only error messages (no secrets). */

const MESSAGES: Record<string, string> = {
  UNAUTHORIZED:
    "You must be logged in to manage exchange connections.",
  AUTH_LOADING: "Checking session…",
  BINGX_CONNECTION_NOT_FOUND: "BingX connection not found. Reconnect via Secure API.",
  BINGX_CREDENTIALS_UNAVAILABLE: "Could not load stored BingX credentials.",
  BINGX_ENCRYPTION_KEY_MISSING:
    "Server encryption key is missing. BingX credentials cannot be saved. This must be configured by the administrator, not by the user.",
  BINGX_API_DISABLED: "BingX API connection is disabled on this server.",
  BINGX_API_ERROR: "Could not sync BingX read-only account.",
  INVALID_API_KEY: "Invalid BingX API key.",
  INVALID_SIGNATURE: "Invalid BingX API signature. Check API secret.",
  INSUFFICIENT_PERMISSION:
    "Connected, but this API key does not have account read permissions for futures.",
  ACCOUNT_BALANCE_UNAVAILABLE:
    "Connected, but account balance is unavailable. Check futures read permissions or account type.",
  ACCOUNT_BALANCE_PARSER_MISMATCH:
    "Connected, but balance data could not be parsed. Report this if your futures wallet has funds.",
  ACCOUNT_BALANCE_EMPTY: "Futures wallet balance is zero.",
  IP_RESTRICTED: "BingX rejected the request because of IP restrictions.",
  TIMEOUT: "BingX API timeout. Try again later.",
  UNKNOWN: "Unexpected BingX read-only sync error.",
};

export function bingxReadOnlyErrorMessage(
  code?: string,
  fallback?: string,
): string {
  if (!code) return fallback ?? MESSAGES.UNKNOWN;
  return MESSAGES[code] ?? fallback ?? MESSAGES.UNKNOWN;
}

/** True for client-side login prompts (not BingX API errors). */
export function isBingXStaleClientAuthMessage(
  message: string | null | undefined,
): boolean {
  if (!message) return false;
  return message === MESSAGES.UNAUTHORIZED || message === MESSAGES.AUTH_LOADING;
}

/**
 * When the UI already has a logged-in user, do not show a false "must be logged in" banner.
 * Backend 401 on connect still surfaces as a session/connect error.
 */
export function bingxConnectErrorForUi(
  code?: string,
  fallback?: string,
  options?: { clientHasUser?: boolean },
): string {
  const clientAuthed = options?.clientHasUser === true;
  const isAuthCode =
    code === "UNAUTHORIZED" ||
    code === "AUTH_LOADING" ||
    code === "INVALID_TOKEN";
  const fallbackIsLogin =
    fallback === MESSAGES.UNAUTHORIZED || fallback === MESSAGES.AUTH_LOADING;

  if (clientAuthed && (isAuthCode || fallbackIsLogin)) {
    if (fallback && !fallbackIsLogin) return fallback;
    return "Server rejected the connection (401). Sign out, sign in again, then retry.";
  }
  return bingxReadOnlyErrorMessage(code, fallback);
}

/** User-safe message when server cannot persist BingX credentials. */
export function bingxEncryptionMissingUserMessage(): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return (
        "Server encryption key is missing. BingX credentials cannot be saved. " +
        "Local dev: set BINGX_CREDENTIAL_ENCRYPTION_KEY in .env and restart the server."
      );
    }
  }
  return MESSAGES.BINGX_ENCRYPTION_KEY_MISSING;
}

export function bingxAccountSyncHint(
  status?: string,
  message?: string,
): string | null {
  if (message?.trim()) return message;
  switch (status) {
    case "unavailable":
      return MESSAGES.ACCOUNT_BALANCE_UNAVAILABLE;
    case "permission_denied":
      return MESSAGES.INSUFFICIENT_PERMISSION;
    case "parser_mismatch":
      return MESSAGES.ACCOUNT_BALANCE_PARSER_MISMATCH;
    case "empty":
      return MESSAGES.ACCOUNT_BALANCE_EMPTY;
    default:
      return null;
  }
}

export function formatLastSyncAgo(lastSyncTime?: number): string {
  if (!lastSyncTime || !Number.isFinite(lastSyncTime)) return "—";
  const sec = Math.max(0, Math.floor((Date.now() - lastSyncTime) / 1000));
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}
