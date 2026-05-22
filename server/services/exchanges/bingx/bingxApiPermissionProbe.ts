import { BingXApiError, BingXHttpClient } from "./bingxHttpClient";
import type { BingXApiCredentials } from "./bingxTypes";

export type BingXPermissionProbe = {
  tradePermission: "confirmed" | "denied" | "unknown";
  withdrawPermission: "not_detected" | "detected" | "unknown";
  message?: string;
};

const LEVERAGE_PATH = "/openApi/swap/v2/trade/leverage";

function isPermissionDenied(err: unknown): boolean {
  if (!(err instanceof BingXApiError)) return false;
  const msg = (err.message || "").toLowerCase();
  const code = err.code.toLowerCase();
  return (
    code.includes("permission") ||
    code.includes("100419") ||
    msg.includes("permission") ||
    msg.includes("not authorized") ||
    msg.includes("no permission")
  );
}

/**
 * Best-effort probe — never places orders. Used for live readiness audit only.
 */
export async function probeBingXApiPermissions(
  credentials: BingXApiCredentials,
  symbol = "BTC-USDT",
): Promise<BingXPermissionProbe> {
  const client = new BingXHttpClient(credentials);

  let tradePermission: BingXPermissionProbe["tradePermission"] = "unknown";
  try {
    await client.signedGet<unknown>(LEVERAGE_PATH, { symbol });
    tradePermission = "confirmed";
  } catch (err) {
    if (isPermissionDenied(err)) {
      tradePermission = "denied";
    }
  }

  return {
    tradePermission,
    withdrawPermission: "unknown",
    message:
      tradePermission === "confirmed"
        ? "Trade-scoped endpoint responded (key may have trading permission)."
        : tradePermission === "denied"
          ? "Trade-scoped endpoint denied (read-only key expected in phase 5A)."
          : "Could not confirm API trading permission from exchange.",
  };
}
