import type {
  BingXSavedConnection,
  BingxLoginStatusResponse,
  BrokerSessionState,
} from "./executionTypes";

export function isSecureApiConnectionMode(
  mode: string | null | undefined,
): boolean {
  return mode === "secure-api" || mode === "secure_api";
}

export function isReadOnlyConnectionMode(
  mode: string | null | undefined,
): boolean {
  return mode === "read-only";
}

export function mapApiModeToSessionMode(
  mode: string | undefined,
): BrokerSessionState["connectionMode"] {
  if (isSecureApiConnectionMode(mode)) return "secure-api";
  if (mode === "read-only") return "read-only";
  return "read-only";
}

export function computeSessionTradingEnabled(
  saved: Pick<
    BingXSavedConnection,
    "tradingPermissionConfirmed" | "tradingEnabled"
  >,
  loginStatus: BingxLoginStatusResponse | null,
): boolean {
  if (!saved.tradingPermissionConfirmed) return false;
  if (saved.tradingEnabled) return true;
  const flags = loginStatus?.liveExecutionFlags;
  if (!flags) return false;
  return (
    flags.liveTradingEnabled &&
    flags.apiTradingEnabled &&
    flags.orderSubmitEnabled &&
    !flags.killSwitchActive
  );
}

export type BingXConnectionDisplay = {
  headline: string;
  modeLabel: string;
  liveTradingLabel: string;
  executionLabel: string;
  badges: string[];
};

export function bingXConnectionDisplay(
  session: BrokerSessionState,
  loginStatus: BingxLoginStatusResponse | null,
): BingXConnectionDisplay {
  const secure =
    isSecureApiConnectionMode(session.connectionMode) &&
    session.readOnly === false &&
    session.tradingPermissionConfirmed === true;
  const flags = loginStatus?.liveExecutionFlags;
  const liveFlagsOn =
    flags?.liveTradingEnabled &&
    flags.apiTradingEnabled &&
    flags.orderSubmitEnabled &&
    !flags.killSwitchActive;

  if (secure) {
    if (session.tradingEnabled && liveFlagsOn) {
      return {
        headline: "BINGX CONNECTED SECURE API",
        modeLabel: "Secure API",
        liveTradingLabel: "ON · Guarded",
        executionLabel: "Limit only · Market disabled · Cancel/close off",
        badges: ["Secure API", "Live guarded", "Limit only"],
      };
    }
    return {
      headline: "BINGX CONNECTED SECURE API",
      modeLabel: "Secure API",
      liveTradingLabel: "OFF",
      executionLabel: "Locked by flags",
      badges: ["Secure API", "Trading locked"],
    };
  }

  return {
    headline: "BINGX CONNECTED READ-ONLY",
    modeLabel: "Read-only",
    liveTradingLabel: "OFF",
    executionLabel: "Locked",
    badges: ["Read only", "Trading locked"],
  };
}
