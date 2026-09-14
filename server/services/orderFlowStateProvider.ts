import type { CanonicalL2Book } from "@shared/canonicalL2Book";
import type { CanonicalTrade, CanonicalTradeQuality } from "@shared/canonicalTradeTape";
import type { LiquidityLifecycleEvent } from "@shared/liquidityLifecycle";
import type { HistoricalLiquidityTruth } from "@shared/historicalLiquidityTruth";
import { composeOrderFlowState, type OrderFlowCompositionInput, type OrderFlowIdentity, type OrderFlowState } from "@shared/orderFlowState";
import { getCanonicalL2BookForMarket, getLiquidityLifecycleForMarket } from "./orderbookMarketRegistry";
import { getCanonicalTradeTapeSnapshot } from "./aggTradeBufferRegistry";
import { getHistoricalLiquidityOwner } from "./historicalLiquidityRegistry";

type ReadIdentity = OrderFlowIdentity;

export type OrderFlowStateReads = {
  book: (identity: ReadIdentity) => CanonicalL2Book | null;
  trades: (identity: ReadIdentity) => { trades: readonly CanonicalTrade[]; quality: CanonicalTradeQuality } | null;
  lifecycle: (identity: ReadIdentity) => readonly LiquidityLifecycleEvent[];
  history: (identity: ReadIdentity) => HistoricalLiquidityTruth | null;
};

function validateIdentity(identity: unknown): asserts identity is OrderFlowIdentity {
  if (!identity || typeof identity !== "object") throw new Error("OrderFlowState requires complete market identity");
  const value = identity as Partial<OrderFlowIdentity>;
  if (typeof value.instrument !== "string" || !value.instrument.trim() || value.venue !== "Binance" || (value.marketType !== "Spot" && value.marketType !== "Perpetual")) {
    throw new Error("OrderFlowState requires complete market identity");
  }
}

function market(identity: OrderFlowIdentity): "spot" | "perp" {
  return identity.marketType === "Perpetual" ? "perp" : "spot";
}

function runtimeReads(): OrderFlowStateReads {
  return {
    book: (identity) => getCanonicalL2BookForMarket(market(identity)),
    trades: (identity) => getCanonicalTradeTapeSnapshot(identity.instrument, market(identity)),
    lifecycle: (identity) => getLiquidityLifecycleForMarket(market(identity)),
    history: (identity) => getHistoricalLiquidityOwner(identity),
  };
}

export function createOrderFlowStateProvider(reads: OrderFlowStateReads) {
  return {
    getState(identity: OrderFlowIdentity, capturedAt = Date.now()): OrderFlowState {
      validateIdentity(identity);
      const completeIdentity: OrderFlowIdentity = { instrument: identity.instrument.trim().toUpperCase(), venue: identity.venue, marketType: identity.marketType };
      const tradeSnapshot = reads.trades(completeIdentity);
      const book = reads.book(completeIdentity);
      const lifecycle = reads.lifecycle(completeIdentity);
      const input: OrderFlowCompositionInput = {
        identity: completeIdentity,
        book,
        trades: tradeSnapshot?.trades ?? [],
        tradeQuality: tradeSnapshot?.quality ?? "UNAVAILABLE",
        liquidityLifecycle: lifecycle,
        lifecycleQuality: lifecycle.at(-1)?.quality ?? (book?.quality === "VALID" ? "UNAVAILABLE" : book?.quality ?? "UNAVAILABLE"),
        historicalLiquidity: reads.history(completeIdentity),
        capturedAt,
      };
      return composeOrderFlowState(input);
    },
  };
}

const runtimeProvider = createOrderFlowStateProvider(runtimeReads());

export function getOrderFlowState(identity: OrderFlowIdentity, capturedAt?: number): OrderFlowState {
  return runtimeProvider.getState(identity, capturedAt);
}
