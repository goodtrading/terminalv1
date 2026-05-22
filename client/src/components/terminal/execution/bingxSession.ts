import type { BrokerSessionState } from "./executionTypes";
import { isSecureApiConnectionMode } from "./bingxConnectionUi";

export function isBingXReadOnlySession(session: {
  connected: boolean;
  exchange: string | null;
  connectionMode?: string | null;
  readOnly?: boolean;
  tradingPermissionConfirmed?: boolean;
}): boolean {
  if (!session.connected || session.exchange !== "bingx") return false;
  if (isSecureApiConnectionMode(session.connectionMode)) {
    return session.readOnly === true;
  }
  return (
    session.connectionMode === "read-only" ||
    session.readOnly === true ||
    session.tradingPermissionConfirmed === false
  );
}

export function isBingXSecureApiSession(session: {
  connected: boolean;
  exchange: string | null;
  connectionMode?: string | null;
  readOnly?: boolean;
  tradingPermissionConfirmed?: boolean;
}): boolean {
  return (
    session.connected &&
    session.exchange === "bingx" &&
    isSecureApiConnectionMode(session.connectionMode) &&
    session.readOnly !== true &&
    session.tradingPermissionConfirmed !== false
  );
}

/** @deprecated Use isBingXReadOnlySession — includes legacy secure_api stored as read-only. */
export function isBingXReadOnlyApiSession(session: {
  connected: boolean;
  exchange: string | null;
  connectionMode?: string | null;
  readOnly?: boolean;
}): boolean {
  return (
    session.connected &&
    session.exchange === "bingx" &&
    (session.connectionMode === "read-only" ||
      session.connectionMode === "secure_api" ||
      session.connectionMode === "secure-api")
  );
}

export function hasPersistedBingXConnection(session: BrokerSessionState): boolean {
  const id = session.connectionId;
  return Boolean(id && id !== "session-only" && id !== "ephemeral");
}
