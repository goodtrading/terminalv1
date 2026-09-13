import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  PaperAccountSnapshot,
  PaperOrderSnapshot,
  PaperPositionSnapshot,
  PaperTradingSettings,
} from "../execution/executionTypes";
import { invalidatePaperQueries } from "../execution/paperQueryKeys";
import { paperExecutionPort } from "@/lib/paperExecutionPort";
import { isPaperExecutionCoreReady, usePaperState } from "@/lib/paperState";
import {
  mapApiPaperPosition,
  mapPaperChartOverlay,
  resolvePaperAccountBaseUsdt,
  resolvePaperChartFeeBps,
  getCanonicalProtectiveOrders,
  isWorkingPaperLimitOrder,
  type PaperChartFeeSettings,
} from "./paperTradeOverlayHelpers";
import type { PaperChartTradeOverlay } from "./paperTradeOverlayTypes";
import { calculateNetPositionPct, canonicalNetPnl, canonicalNetAtPrice } from "../execution/canonicalNetPnl";

export function usePaperTradeOverlay() {
  const queryClient = useQueryClient();
  const paperState = usePaperState();
  const { account: accountData, position, settings: paperSettings, orders, resources } = paperState;
  const paperActive = isPaperExecutionCoreReady(paperState);
  const paperOrdersActive = paperState.active
    && resources.account === "AVAILABLE"
    && resources.orders === "AVAILABLE";
  const readOnly = false;

  const mappedPosition = useMemo(
    () => (resources.position === "AVAILABLE" ? mapApiPaperPosition(position) : null),
    [position, resources.position],
  );

  const overlay = mapPaperChartOverlay(mappedPosition, accountData?.unrealizedPnlUsdt);
  const netPnl = canonicalNetPnl(paperState).net;
  const netPositionPct = calculateNetPositionPct(
    netPnl,
    mappedPosition?.quantity,
    mappedPosition?.entryPrice,
  );
  const overlayWithNetPositionPct = overlay
    ? { ...overlay, netPnlUsdt: netPnl, netPositionPct }
    : null;
  const protectiveOrders = useMemo(() => getCanonicalProtectiveOrders(orders), [orders]);
  const stopLossOrder = protectiveOrders.STOP_LOSS[0];
  const takeProfitOrder = protectiveOrders.TAKE_PROFIT[0];

  const accountEquityUsdt = useMemo(
    () => resolvePaperAccountBaseUsdt(accountData),
    [accountData],
  );

  const feeSettings: PaperChartFeeSettings = useMemo(
    () => resolvePaperChartFeeBps(paperSettings),
    [paperSettings],
  );

  const openLimitOrders = useMemo(
    () => orders.filter((o) => isWorkingPaperLimitOrder(o)),
    [orders],
  );

  const invalidatePaper = useCallback(async () => {
    await paperState.refresh();
    await invalidatePaperQueries(queryClient);
  }, [paperState.refresh, queryClient]);

  const cancelOrder = useCallback(
    async (clientOrderId: string) => {
      await paperExecutionPort.cancelOrder(clientOrderId);
      await invalidatePaper();
    },
    [invalidatePaper],
  );

  const patchRisk = useCallback(async (patch: { stopLoss?: number | null; takeProfit?: number | null }) => {
    if (!mappedPosition || mappedPosition.quantity <= 0) throw new Error("Position unavailable");
    const isStop = patch.stopLoss != null;
    const price = (isStop ? patch.stopLoss : patch.takeProfit)!;
    const existing = isStop ? stopLossOrder : takeProfitOrder;
    if (existing) {
      await paperExecutionPort.amendOrder({
        clientOrderId: existing.id,
        ...(isStop ? { triggerPrice: price } : { limitPrice: price }),
      });
      return;
    }
    await paperExecutionPort.submitProtectiveOrder({
      clientOrderId: `paper-${isStop ? "sl" : "tp"}-${Date.now()}`,
      protectionType: isStop ? "STOP_LOSS" : "TAKE_PROFIT",
      price,
      quantity: String(mappedPosition.quantity),
    });
  }, [mappedPosition, stopLossOrder, takeProfitOrder]);

  const amendProtectiveOrder = useCallback(async (order: PaperOrderSnapshot, price: number) => {
    await paperExecutionPort.amendOrder({
      clientOrderId: order.id,
      ...(order.protectionType === "STOP_LOSS" ? { triggerPrice: price } : { limitPrice: price }),
    });
    await invalidatePaper();
  }, [invalidatePaper]);

  return {
    paperActive,
    paperOrdersActive,
    netAtPrice: (price: number) => canonicalNetAtPrice(paperState, price),
    readOnly,
    overlay: overlayWithNetPositionPct,
    position: mappedPosition,
    accountEquityUsdt,
    feeSettings,
    openLimitOrders,
    protectiveOrders,
    cancelOrder,
    patchRisk,
    amendProtectiveOrder,
    invalidatePaper,
  };
}
