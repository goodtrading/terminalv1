import type { BrokerSessionState } from "./executionTypes";

/** BingX secure API read-only session (never enables live trading). */
export function isBingXReadOnlySession(session: {
  connected: boolean;
  exchange: string | null;
  connectionMode?: string | null;
  readOnly?: boolean;
}): boolean {
  const readOnlyMode =
    session.connectionMode === "read-only" || session.connectionMode === "secure_api";

  return (
    session.connected &&
    session.exchange === "bingx" &&
    readOnlyMode &&
    (session.readOnly !== false || readOnlyMode)
  );
}

export function hasPersistedBingXConnection(session: BrokerSessionState): boolean {
  const id = session.connectionId;
  return Boolean(id && id !== "session-only" && id !== "ephemeral");
}
