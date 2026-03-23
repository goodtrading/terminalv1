const AUTH_TOKEN_KEY = "gt_terminal_auth_token";

/** Keys cleared on logout or invalid session */
const AUTH_STORAGE_KEYS = [AUTH_TOKEN_KEY] as const;

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Removes all client-side auth data (localStorage + sessionStorage) and notifies listeners.
 * Call when logging out, on 401, or when /api/auth/me cannot confirm the session.
 */
export function clearAuthStorage(): void {
  try {
    for (const key of AUTH_STORAGE_KEYS) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("gt-auth-token-change"));
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      clearAuthStorage();
      return;
    }
  } catch {
    // ignore
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("gt-auth-token-change"));
  }
}
