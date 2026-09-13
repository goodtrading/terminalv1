import { type TerminalExecutionContext } from "../components/terminal/execution/executionContext";
import {
  paperMarketSnapshotProvider,
  type PaperMarketSnapshotWire,
} from "./paperMarketSnapshotProvider";
import {
  nautilusSimulation,
  type NautilusSimulationAccountWire,
  type NautilusSimulationInstrumentWire,
  type NautilusSimulationOrderSideWire,
  type NautilusSimulationOrderStateWire,
  type NautilusSimulationPositionWire,
  type NautilusSimulationStatusWire,
} from "./nautilusSimulationBridge";
import type { NautilusEngineBridge } from "./nautilusEngineBridge";

export type NautilusPaperBackendState = {
  backend: "legacy" | "nautilus";
  availability: "AVAILABLE" | "UNAVAILABLE" | "DEGRADED";
  engine: "STOPPED" | "RUNNING" | "UNKNOWN";
  simulation: "STOPPED" | "RUNNING" | "UNKNOWN";
  message?: string;
};

export type NautilusPaperMarketAdapterErrorCode =
  | "NAUTILUS_BACKEND_NOT_READY"
  | "UNSUPPORTED_NAUTILUS_PAPER_CONTEXT"
  | "ORDER_TYPE_NOT_ENABLED"
  | "MARKET_SOURCE_MISMATCH"
  | "SNAPSHOT_STALE_BEFORE_SUBMIT"
  | "MARKET_ORDER_NOT_FILLED"
  | "ORDER_EXECUTED_STATE_REFRESH_FAILED"
  | "PREVIEW_NOT_ENABLED_FOR_NAUTILUS"
  | "NATIVE_ERROR";

export class NautilusPaperMarketAdapterError extends Error {
  readonly code: NautilusPaperMarketAdapterErrorCode;
  readonly details?: unknown;

  constructor(code: NautilusPaperMarketAdapterErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "NautilusPaperMarketAdapterError";
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type NautilusPaperSimulationContext = {
  executionDomain: "paper";
  chartExchange: "binance";
  chartMarketType: "spot";
  chartSymbol: string;
  referenceMarket: {
    venue: "binance";
    marketType: "perpetual";
    symbol: string;
  };
  executionMarketType: "perpetual";
  executionSymbol: string;
};

type LegacyNautilusPaperMarketContext = Pick<
  TerminalExecutionContext,
  | "chartExchange"
  | "chartMarketType"
  | "chartSymbol"
  | "executionExchange"
  | "executionMarketType"
  | "executionSymbol"
>;

export type NautilusPaperMarketAdapterContext =
  | NautilusPaperSimulationContext
  | LegacyNautilusPaperMarketContext;

export const NAUTILUS_PAPER_SIMULATION_CONTEXT: NautilusPaperSimulationContext = {
  executionDomain: "paper",
  chartExchange: "binance",
  chartMarketType: "spot",
  chartSymbol: "BTCUSDT",
  referenceMarket: {
    venue: "binance",
    marketType: "perpetual",
    symbol: "BTCUSDT",
  },
  executionMarketType: "perpetual",
  executionSymbol: "BTC-USDT",
};

export type NautilusPaperMarketOrderIntent = {
  clientOrderId: string;
  executionContext: NautilusPaperMarketAdapterContext;
  side: "BUY" | "SELL";
  quantity: string;
  reduceOnly?: boolean;
  metadata?: Record<string, unknown>;
};

export type NautilusPaperMarketPricingContext = {
  mode: "PROXY_BBO_SNAPSHOT";
  sourceVenue: string;
  sourceMarketType: string;
  sourceSymbol: string;
  executionVenue: string;
  executionMarketType: string;
  executionSymbol: string;
  simulationVenue: string;
  simulationMarketType: string;
  simulationSymbol: string;
  snapshotTimestampMs: number;
  snapshotFreshnessAgeMs: number;
  snapshotStaleAfterMs: number;
};

export type NautilusPaperMarketExecutionResult = {
  backend: "nautilus";
  order: NautilusSimulationOrderStateWire;
  position: NautilusSimulationPositionWire;
  account: NautilusSimulationAccountWire;
  pricingContext: NautilusPaperMarketPricingContext;
};

export type NautilusPaperMarketAdapterDependencies = {
  snapshotProvider?: typeof paperMarketSnapshotProvider;
  simulation?: typeof nautilusSimulation;
  engine?: NautilusEngineBridge;
  nowMs?: () => number;
  fetch?: typeof fetch;
};

const APPROVED_CONTEXT: NautilusPaperMarketAdapterContext = {
  chartExchange: "binance",
  chartMarketType: "spot",
  chartSymbol: "BTCUSDT",
  executionExchange: "bingx",
  executionMarketType: "perpetual",
  executionSymbol: "BTC-USDT",
};

const CANONICAL_SIMULATION_INSTRUMENT: NautilusSimulationInstrumentWire = {
  venue: "SIM",
  marketType: "perpetual",
  symbol: "BTCUSDT-PERP",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  exchangeNativeSymbol: "BTCUSDT",
};

function normalizeSymbol(value: string): string {
  return value.trim().toUpperCase().replace(/-/g, "");
}

function sameCanonicalContext(context: NautilusPaperMarketAdapterContext): boolean {
  if ("executionDomain" in context) {
    return (
      context.executionDomain === "paper" &&
      context.chartExchange === "binance" &&
      context.chartMarketType === "spot" &&
      normalizeSymbol(context.chartSymbol) === normalizeSymbol("BTCUSDT") &&
      context.referenceMarket.venue === "binance" &&
      context.referenceMarket.marketType === "perpetual" &&
      normalizeSymbol(context.referenceMarket.symbol) === normalizeSymbol("BTCUSDT") &&
      context.executionMarketType === "perpetual" &&
      normalizeSymbol(context.executionSymbol) === normalizeSymbol("BTC-USDT")
    );
  }
  return (
    String(context.chartExchange ?? "").trim().toLowerCase() === APPROVED_CONTEXT.chartExchange &&
    String(context.chartMarketType ?? "").trim().toLowerCase() === APPROVED_CONTEXT.chartMarketType &&
    normalizeSymbol(context.chartSymbol) === normalizeSymbol(APPROVED_CONTEXT.chartSymbol) &&
    String(context.executionExchange ?? "").trim().toLowerCase() === APPROVED_CONTEXT.executionExchange &&
    String(context.executionMarketType ?? "").trim().toLowerCase() === APPROVED_CONTEXT.executionMarketType &&
    normalizeSymbol(context.executionSymbol) === normalizeSymbol(APPROVED_CONTEXT.executionSymbol)
  );
}

function normalizeError(error: unknown): NautilusPaperMarketAdapterError {
  if (error instanceof NautilusPaperMarketAdapterError) return error;
  if (error instanceof Error) {
    return new NautilusPaperMarketAdapterError("NATIVE_ERROR", error.message, error);
  }
  return new NautilusPaperMarketAdapterError("NATIVE_ERROR", "Nautilus market adapter failed", error);
}

function assertRunningStatus(status: NautilusSimulationStatusWire): boolean {
  return status.state === "RUNNING";
}

function buildPricingContext(snapshot: PaperMarketSnapshotWire): NautilusPaperMarketPricingContext {
  return {
    mode: "PROXY_BBO_SNAPSHOT",
    sourceVenue: snapshot.source.venue,
    sourceMarketType: snapshot.source.marketType,
    sourceSymbol: snapshot.source.symbol,
    executionVenue: APPROVED_CONTEXT.executionExchange,
    executionMarketType: APPROVED_CONTEXT.executionMarketType,
    executionSymbol: APPROVED_CONTEXT.executionSymbol,
    simulationVenue: snapshot.simulationInstrument.venue,
    simulationMarketType: snapshot.simulationInstrument.marketType,
    simulationSymbol: snapshot.simulationInstrument.symbol,
    snapshotTimestampMs: snapshot.timestampMs,
    snapshotFreshnessAgeMs: snapshot.freshness.ageMs,
    snapshotStaleAfterMs: snapshot.freshness.staleAfterMs,
  };
}

function resolveOrderSide(side: "BUY" | "SELL"): NautilusSimulationOrderSideWire {
  return side;
}

function buildOrderIntent(intent: NautilusPaperMarketOrderIntent): {
  clientOrderId: string;
  instrument: NautilusSimulationInstrumentWire;
  side: NautilusSimulationOrderSideWire;
  orderType: "MARKET";
  quantity: string;
  timeInForce: "GTC";
  reduceOnly: boolean;
  postOnly: boolean;
  metadata?: Record<string, unknown>;
} {
  return {
    clientOrderId: intent.clientOrderId,
    instrument: CANONICAL_SIMULATION_INSTRUMENT,
    side: resolveOrderSide(intent.side),
    orderType: "MARKET",
    quantity: intent.quantity,
    timeInForce: "GTC",
    reduceOnly: intent.reduceOnly ?? false,
    postOnly: false,
    metadata: intent.metadata,
  };
}

export function createNautilusPaperMarketAdapter(deps: NautilusPaperMarketAdapterDependencies = {}) {
  const snapshotProvider = deps.snapshotProvider ?? paperMarketSnapshotProvider;
  const simulation = deps.simulation ?? nautilusSimulation;
  const nowMs = deps.nowMs ?? (() => Date.now());

  async function submitMarketOrder(
    backendState: NautilusPaperBackendState,
    intent: NautilusPaperMarketOrderIntent,
  ): Promise<NautilusPaperMarketExecutionResult> {
    if (backendState.backend !== "nautilus" || backendState.availability !== "AVAILABLE") {
      throw new NautilusPaperMarketAdapterError("NAUTILUS_BACKEND_NOT_READY", "Nautilus backend is not ready", backendState);
    }

    if (!sameCanonicalContext(intent.executionContext)) {
      throw new NautilusPaperMarketAdapterError(
        "UNSUPPORTED_NAUTILUS_PAPER_CONTEXT",
        "unsupported Nautilus Paper execution context",
        { received: intent.executionContext, approved: APPROVED_CONTEXT },
      );
    }

    if (!intent.quantity || !intent.quantity.trim()) {
      throw new NautilusPaperMarketAdapterError("ORDER_TYPE_NOT_ENABLED", "quantity is required for Nautilus market order", {
        quantity: intent.quantity,
      });
    }

    const liveEngineStatus = await deps.engine?.status().catch((error) => {
      throw new NautilusPaperMarketAdapterError("NAUTILUS_BACKEND_NOT_READY", "engine status failed", normalizeError(error));
    }) ?? null;
    if (!liveEngineStatus || liveEngineStatus.state !== "HEALTHY") {
      throw new NautilusPaperMarketAdapterError("NAUTILUS_BACKEND_NOT_READY", "engine is not running", liveEngineStatus ?? backendState);
    }

    const liveSimulationStatus = await simulation.status().catch((error) => {
      throw new NautilusPaperMarketAdapterError("NAUTILUS_BACKEND_NOT_READY", "simulation status failed", normalizeError(error));
    });
    if (!assertRunningStatus(liveSimulationStatus)) {
      throw new NautilusPaperMarketAdapterError("NAUTILUS_BACKEND_NOT_READY", "simulation is not running", liveSimulationStatus);
    }

    const snapshot = await snapshotProvider.getSnapshot(APPROVED_CONTEXT, { fetch: deps.fetch, nowMs });

    if (
      snapshot.source.venue !== "BINANCE" ||
      snapshot.source.marketType !== "perpetual" ||
      normalizeSymbol(snapshot.source.symbol) !== normalizeSymbol("BTCUSDT")
    ) {
      throw new NautilusPaperMarketAdapterError("MARKET_SOURCE_MISMATCH", "snapshot source mapping is not approved", {
        received: snapshot.source,
        approved: {
          venue: "BINANCE",
          marketType: "perpetual",
          symbol: "BTCUSDT",
        },
      });
    }

    if (
      snapshot.simulationInstrument.venue !== "SIM" ||
      snapshot.simulationInstrument.marketType !== "perpetual" ||
      normalizeSymbol(snapshot.simulationInstrument.symbol) !== normalizeSymbol("BTCUSDT-PERP")
    ) {
      throw new NautilusPaperMarketAdapterError("MARKET_SOURCE_MISMATCH", "snapshot simulation instrument mapping is not approved", {
        received: snapshot.simulationInstrument,
        approved: {
          venue: "SIM",
          marketType: "perpetual",
          symbol: "BTCUSDT-PERP",
        },
      });
    }

    if (snapshot.freshness.stale) {
      throw new NautilusPaperMarketAdapterError("SNAPSHOT_STALE_BEFORE_SUBMIT", "snapshot is stale before submit", snapshot.freshness);
    }

    const applied = await simulation.applyMarketSnapshot(snapshot);
    if (!applied.applied) {
      throw new NautilusPaperMarketAdapterError("NATIVE_ERROR", "applyMarketSnapshot returned not applied", applied);
    }

    const submitAgeMs = Math.max(0, nowMs() - snapshot.timestampMs);
    if (submitAgeMs > snapshot.freshness.staleAfterMs) {
      throw new NautilusPaperMarketAdapterError("SNAPSHOT_STALE_BEFORE_SUBMIT", "snapshot became stale before submit", {
        ageMs: submitAgeMs,
        staleAfterMs: snapshot.freshness.staleAfterMs,
        timestampMs: snapshot.timestampMs,
      });
    }

    const order = await simulation.submitOrder(buildOrderIntent(intent));
    if (order.status !== "FILLED") {
      throw new NautilusPaperMarketAdapterError("MARKET_ORDER_NOT_FILLED", "Nautilus MARKET order did not fill", {
        order,
      });
    }

    let position: NautilusSimulationPositionWire;
    try {
      position = await simulation.getPosition();
    } catch (error) {
      throw new NautilusPaperMarketAdapterError("ORDER_EXECUTED_STATE_REFRESH_FAILED", "filled order position refresh failed", {
        order,
        error: normalizeError(error),
      });
    }

    let account: NautilusSimulationAccountWire;
    try {
      account = await simulation.getAccount();
    } catch (error) {
      throw new NautilusPaperMarketAdapterError("ORDER_EXECUTED_STATE_REFRESH_FAILED", "filled order account refresh failed", {
        order,
        position,
        error: normalizeError(error),
      });
    }

    return {
      backend: "nautilus",
      order,
      position,
      account,
      pricingContext: buildPricingContext(snapshot),
    };
  }

  return {
    submitMarketOrder,
  } as const;
}

export const nautilusPaperMarketAdapter = createNautilusPaperMarketAdapter();
