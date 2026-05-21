import type { BrokerSessionState } from "./executionTypes";

/** BingX secure API read-only session (never enables live trading). */
export function isBingXReadOnlySession(session: {
  connected: boolean;
  exchange: string | null;
  connectionMode?: string | null;
  readOnly?: boolean;
}): boolean {
  return (
    session.connected &&
    session.exchange === "bingx" &&
    (session.connectionMode === "read-only" ||
      session.connectionMode === "secure_api") &&
    session.readOnly !== false
  );
}

export function hasPersistedBingXConnection(session: BrokerSessionState): boolean {
  const id = session.connectionId;
  return Boolean(id && id !== "session-only" && id !== "ephemeral");
}
