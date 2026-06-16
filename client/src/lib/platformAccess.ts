/** Direct installer asset — GoodTrading Desktop v0.1.7 */
export const DESKTOP_INSTALLER_URL =
  "https://github.com/goodtrading/terminalv1/releases/download/v0.1.7/GoodTrading-Terminal-0.1.7-x64-setup.exe";

/** Release page fallback if direct download fails. */
export const DESKTOP_RELEASE_PAGE =
  "https://github.com/goodtrading/terminalv1/releases/tag/v0.1.7";

/** @deprecated Use DESKTOP_INSTALLER_URL — kept for imports that expect a single URL. */
export const DESKTOP_DOWNLOAD_URL = DESKTOP_INSTALLER_URL;

/**
 * Mock access modes for marketing UI before real auth/billing is wired.
 * Set via localStorage key `gt-mock-access-mode`:
 * - `off` — use real TerminalAuthContext (default)
 * - `visitor` — not logged in
 * - `logged_in` — authenticated, no active plan
 * - `active` — authenticated with active subscription
 *
 * Legacy: `gt-mock-active-subscription=1` still forces active subscription when mode is `off`.
 */
export const MOCK_ACCESS_MODE_KEY = "gt-mock-access-mode";
export const MOCK_SUBSCRIPTION_KEY = "gt-mock-active-subscription";

export type MockAccessMode = "off" | "visitor" | "logged_in" | "active";

export type PlatformUser = {
  isAuthenticated: boolean;
  hasActiveSubscription: boolean;
  emailVerified?: boolean;
};

export function isAuthenticated(user: PlatformUser | null | undefined): boolean {
  return user?.isAuthenticated === true;
}

export function hasActiveSubscription(user: PlatformUser | null | undefined): boolean {
  return user?.hasActiveSubscription === true;
}

export function isEmailVerifiedForAccess(user: PlatformUser | null | undefined): boolean {
  if (!isAuthenticated(user)) return false;
  return user?.emailVerified !== false;
}

/** Where "Terminal Web" should send the user based on session + subscription. */
export function getTerminalRedirect(user: PlatformUser | null | undefined): string {
  if (!isAuthenticated(user)) return "/login";
  if (user?.emailVerified === false) return "/verify-email";
  if (!hasActiveSubscription(user)) return "/pricing";
  return "/terminal";
}

export type MarketingCtaAction = "navigate" | "download";

export type MarketingCtaPair = {
  primaryLabel: string;
  primaryTarget: string;
  primaryAction: MarketingCtaAction;
  secondaryLabel: string;
  secondaryTarget: string;
  secondaryAction: MarketingCtaAction;
};

/** Primary/secondary landing CTAs by access state — connect to real auth later. */
export function getMarketingCtas(user: PlatformUser | null | undefined): MarketingCtaPair {
  if (!isAuthenticated(user)) {
    return {
      primaryLabel: "Crear cuenta",
      primaryTarget: "/register",
      primaryAction: "navigate",
      secondaryLabel: "Ver productos",
      secondaryTarget: "/products",
      secondaryAction: "navigate",
    };
  }
  if (!hasActiveSubscription(user)) {
    return {
      primaryLabel: "Activar acceso",
      primaryTarget: "/pricing",
      primaryAction: "navigate",
      secondaryLabel: "Ver productos",
      secondaryTarget: "/products",
      secondaryAction: "navigate",
    };
  }
  return {
    primaryLabel: "Abrir Terminal Web",
    primaryTarget: "/terminal",
    primaryAction: "navigate",
    secondaryLabel: "Descargar App Desktop",
    secondaryTarget: DESKTOP_RELEASE_PAGE,
    secondaryAction: "download",
  };
}

export function readMockAccessMode(): MockAccessMode {
  try {
    const value = localStorage.getItem(MOCK_ACCESS_MODE_KEY);
    if (value === "visitor" || value === "logged_in" || value === "active") return value;
  } catch {
    /* ignore */
  }
  return "off";
}

export function setMockAccessMode(mode: MockAccessMode): void {
  try {
    if (mode === "off") localStorage.removeItem(MOCK_ACCESS_MODE_KEY);
    else localStorage.setItem(MOCK_ACCESS_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

/** @deprecated Prefer setMockAccessMode("active") */
export function readMockActiveSubscription(): boolean {
  try {
    return localStorage.getItem(MOCK_SUBSCRIPTION_KEY) === "1";
  } catch {
    return false;
  }
}

/** @deprecated Prefer setMockAccessMode */
export function setMockActiveSubscription(active: boolean): void {
  try {
    if (active) localStorage.setItem(MOCK_SUBSCRIPTION_KEY, "1");
    else localStorage.removeItem(MOCK_SUBSCRIPTION_KEY);
  } catch {
    /* ignore */
  }
}

export function resolvePlatformUser(
  real: { authenticated: boolean; accessAllowed: boolean; emailVerified?: boolean },
  mockMode: MockAccessMode = readMockAccessMode(),
): PlatformUser {
  if (mockMode === "visitor") {
    return { isAuthenticated: false, hasActiveSubscription: false, emailVerified: false };
  }
  if (mockMode === "logged_in") {
    return { isAuthenticated: true, hasActiveSubscription: false, emailVerified: true };
  }
  if (mockMode === "active") {
    return { isAuthenticated: true, hasActiveSubscription: true, emailVerified: true };
  }

  const legacyMockActive = readMockActiveSubscription();
  return {
    isAuthenticated: real.authenticated,
    hasActiveSubscription: real.accessAllowed === true || legacyMockActive,
    emailVerified: real.emailVerified !== false,
  };
}
