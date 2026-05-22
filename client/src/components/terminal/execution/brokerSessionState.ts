import type { BrokerSessionState } from "./executionTypes";

export const BROKER_SESSION_STORAGE_KEY = "goodtrading.brokerSession.v1";

const TRANSIENT_PHASES = new Set<BrokerSessionState["phase"]>([
  "checking",
  "connecting",
]);

export const DEFAULT_BROKER_SESSION: BrokerSessionState = {
  exchange: null,
  phase: "not_connected",
  connected: false,
  demo: false,
  connectionMode: null,
  message: "No broker connected.",
  brokerLoginUrl: null,
  readOnly: false,
  tradingEnabled: false,
};

function isValidSession(raw: unknown): raw is BrokerSessionState {
  if (!raw || typeof raw !== "object") return false;
  const s = raw as BrokerSessionState;
  const phases = [
    "not_connected",
    "checking",
    "connecting",
    "broker_login_unavailable",
    "connected_demo",
    "connected",
    "error",
  ];
  return (
    typeof s.phase === "string" &&
    phases.includes(s.phase) &&
    typeof s.connected === "boolean" &&
    typeof s.demo === "boolean"
  );
}

/** Never leave UI stuck on in-flight phases after reload or crash. */
export function normalizeBrokerSession(
  session: BrokerSessionState,
): BrokerSessionState {
  if (!TRANSIENT_PHASES.has(session.phase)) {
    return session;
  }
  if (session.connected) {
    return {
      ...session,
      phase: "connected",
      message:
        session.message ??
        (session.connectionMode === "secure-api"
          ? "BingX secure API connected."
          : "BingX connected read-only."),
    };
  }
  return {
    ...session,
    phase: "not_connected",
    connected: false,
    message: "No broker connected.",
    lastError: session.lastError,
  };
}

function persistablePhase(
  session: BrokerSessionState,
): BrokerSessionState["phase"] {
  if (TRANSIENT_PHASES.has(session.phase)) {
    return session.connected ? "connected" : "not_connected";
  }
  return session.phase;
}

export function loadBrokerSession(): BrokerSessionState {
  try {
    const stored = localStorage.getItem(BROKER_SESSION_STORAGE_KEY);
    if (!stored) return { ...DEFAULT_BROKER_SESSION };
    const parsed: unknown = JSON.parse(stored);
    if (!isValidSession(parsed)) return { ...DEFAULT_BROKER_SESSION };
    const merged = {
      ...DEFAULT_BROKER_SESSION,
      ...parsed,
    };
    if (merged.connectionMode === "secure_api") {
      merged.connectionMode = "secure-api";
    }
    return normalizeBrokerSession(merged);
  } catch {
    return { ...DEFAULT_BROKER_SESSION };
  }
}

/** Persist session metadata only — never API secrets or in-flight phases. */
export function saveBrokerSession(session: BrokerSessionState): void {
  try {
    const phase = persistablePhase(session);
    const safe: BrokerSessionState = {
      exchange: session.exchange,
      phase,
      connected: session.connected,
      demo: session.demo,
      connectionMode: session.connectionMode ?? null,
      connectionId: session.connectionId,
      apiKeyMasked: session.apiKeyMasked,
      readOnly: session.readOnly,
      tradingEnabled: session.tradingEnabled ?? false,
      message: session.message,
      brokerLoginUrl: session.brokerLoginUrl ?? null,
      connectedAt: session.connectedAt,
      lastError: session.lastError,
    };
    localStorage.setItem(BROKER_SESSION_STORAGE_KEY, JSON.stringify(safe));
    window.dispatchEvent(new CustomEvent("goodtrading-broker-session-changed"));
  } catch {
    // ignore quota / private mode
  }
}

export function clearBrokerSession(): void {
  try {
    localStorage.removeItem(BROKER_SESSION_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("goodtrading-broker-session-changed"));
  } catch {
    // ignore
  }
}

export function isTransientBrokerPhase(
  phase: BrokerSessionState["phase"],
): boolean {
  return TRANSIENT_PHASES.has(phase);
}
