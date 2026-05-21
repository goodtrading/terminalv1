import {
  assertExecutionVenueAllowed,
  assertLiveTradingAllowed,
  assertNotChartVenue,
} from "@shared/execution/executionGuards";
import type { NormalizedExecutionOrder } from "@shared/execution/executionContextTypes";
import { isLiveTradingEnabled } from "./riskGuard";

export type BingXAdapterSubmitResult =
  | { success: true; orderId?: string; message: string }
  | { success: false; code: string; message: string };

/**
 * Future live path for BingX perpetual orders.
 * Does not send real orders until BINGX_ENABLE_LIVE_TRADING and context allow it.
 */
export class BingXExecutionAdapter {
  readonly exchange = "bingx" as const;
  readonly marketType = "perpetual" as const;

  async submitOrder(order: NormalizedExecutionOrder): Promise<BingXAdapterSubmitResult> {
    const chartGuard = assertNotChartVenue(order.exchange, order.marketType);
    if (!chartGuard.ok) {
      return { success: false, code: chartGuard.code, message: chartGuard.message };
    }

    const venueGuard = assertExecutionVenueAllowed(order.exchange, order.marketType);
    if (!venueGuard.ok) {
      return { success: false, code: venueGuard.code, message: venueGuard.message };
    }

    const liveGuard = assertLiveTradingAllowed(
      { liveTradingEnabled: true },
      isLiveTradingEnabled(),
    );
    if (!liveGuard.ok) {
      return { success: false, code: liveGuard.code, message: liveGuard.message };
    }

    // Prepared route — wire signed POST when live trading is explicitly enabled.
    return {
      success: false,
      code: "LIVE_EXECUTION_NOT_WIRED",
      message:
        "BingX execution adapter is prepared but order placement is not enabled in this build.",
    };
  }
}

export const bingxExecutionAdapter = new BingXExecutionAdapter();
