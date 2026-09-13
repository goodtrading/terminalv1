import { apiUrl } from "./apiBase";
import { DEFAULT_TERMINAL_EXECUTION_CONTEXT, type TerminalExecutionContext } from "../components/terminal/execution/executionContext";
import { BOOKMAP_OB_STALE_MS } from "@shared/bookmapFreshness";

export type PaperMarketSnapshotSourceWire = {
  venue: "BINANCE";
  marketType: "perpetual";
  symbol: "BTCUSDT";
};

export type PaperMarketSnapshotInstrumentWire = {
  venue: "SIM";
  marketType: "perpetual";
  symbol: "BTCUSDT-PERP";
};

export type PaperMarketSnapshotWire = {
  source: PaperMarketSnapshotSourceWire;
  simulationInstrument: PaperMarketSnapshotInstrumentWire;
  bid: string;
  ask: string;
  bidSize: string;
  askSize: string;
  timestampMs: number;
  freshness: {
    ageMs: number;
    staleAfterMs: number;
    stale: boolean;
  };
};

export type PaperMarketSnapshotProviderErrorCode =
  | "MARKET_SOURCE_MISMATCH"
  | "UNSUPPORTED_MARKET_SOURCE"
  | "INVALID_BBO"
  | "MISSING_TIMESTAMP"
  | "SNAPSHOT_STALE"
  | "FETCH_FAILED";

export class PaperMarketSnapshotProviderError extends Error {
  readonly code: PaperMarketSnapshotProviderErrorCode;
  readonly details?: unknown;

  constructor(code: PaperMarketSnapshotProviderErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "PaperMarketSnapshotProviderError";
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  override toJSON(): PaperMarketSnapshotProviderError {
    return this;
  }
}

type RawOrderbookResponse = {
  exchange?: unknown;
  market?: unknown;
  bids?: unknown;
  asks?: unknown;
  timestamp?: unknown;
  status?: unknown;
  degraded?: unknown;
  warning?: unknown;
};

type PaperMarketSnapshotProviderDeps = {
  fetch?: typeof fetch;
  nowMs?: () => number;
};

type ProductionMarketSnapshotContext = Pick<
  TerminalExecutionContext,
  "chartSymbol" | "chartExchange" | "chartMarketType" | "executionExchange" | "executionMarketType" | "executionSymbol"
>;

const APPROVED_CONTEXT = {
  chartSymbol: "BTCUSDT",
  chartExchange: "binance",
  chartMarketType: "spot",
  executionExchange: "bingx",
  executionMarketType: "perpetual",
  executionSymbol: "BTC-USDT",
} as const satisfies ProductionMarketSnapshotContext;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSymbol(value: string): string {
  return value.trim().toUpperCase().replace(/-/g, "");
}

function normalizeMarketType(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeDecimalText(value: unknown, field: string): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new PaperMarketSnapshotProviderError("INVALID_BBO", `${field} must be a non-empty decimal string`, { field, value });
    }
    if (!Number.isFinite(Number(trimmed))) {
      throw new PaperMarketSnapshotProviderError("INVALID_BBO", `${field} must be a finite decimal`, { field, value });
    }
    return trimmed;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new PaperMarketSnapshotProviderError("INVALID_BBO", `${field} must be a finite decimal`, { field, value });
    }
    return String(value);
  }
  throw new PaperMarketSnapshotProviderError("INVALID_BBO", `${field} must be a decimal string or number`, { field, value });
}

function readTopLevel(levels: unknown, side: "bid" | "ask"): { price: string; size: string } {
  if (!Array.isArray(levels) || levels.length === 0) {
    throw new PaperMarketSnapshotProviderError("INVALID_BBO", `missing ${side} levels`, { side, levels });
  }
  const first = levels[0];
  if (!Array.isArray(first) || first.length < 2) {
    throw new PaperMarketSnapshotProviderError("INVALID_BBO", `invalid ${side} level shape`, { side, level: first });
  }
  const price = normalizeDecimalText(first[0], `${side}.price`);
  const size = normalizeDecimalText(first[1], `${side}.size`);
  const priceNum = Number(price);
  const sizeNum = Number(size);
  if (!Number.isFinite(priceNum) || !Number.isFinite(sizeNum)) {
    throw new PaperMarketSnapshotProviderError("INVALID_BBO", `invalid ${side} decimal values`, { side, price, size });
  }
  if (priceNum <= 0 || sizeNum <= 0) {
    throw new PaperMarketSnapshotProviderError("INVALID_BBO", `${side} must be positive`, { side, price, size });
  }
  return { price, size };
}

function assertApprovedMapping(context: ProductionMarketSnapshotContext): void {
  const normalizedChartSymbol = normalizeSymbol(context.chartSymbol);
  const normalizedExecutionSymbol = normalizeSymbol(context.executionSymbol);
  const approvedChartSymbol = normalizeSymbol(APPROVED_CONTEXT.chartSymbol);
  const approvedExecutionSymbol = normalizeSymbol(APPROVED_CONTEXT.executionSymbol);
  const chartExchange = String(context.chartExchange ?? "").trim().toLowerCase();
  const chartMarketType = normalizeMarketType(context.chartMarketType);
  const executionExchange = String(context.executionExchange ?? "").trim().toLowerCase();
  const executionMarketType = normalizeMarketType(context.executionMarketType);

  if (
    normalizedChartSymbol !== approvedChartSymbol ||
    normalizedExecutionSymbol !== approvedExecutionSymbol ||
    chartExchange !== APPROVED_CONTEXT.chartExchange ||
    chartMarketType !== APPROVED_CONTEXT.chartMarketType ||
    executionExchange !== APPROVED_CONTEXT.executionExchange ||
    executionMarketType !== APPROVED_CONTEXT.executionMarketType
  ) {
    throw new PaperMarketSnapshotProviderError("MARKET_SOURCE_MISMATCH", "unsupported market mapping for production snapshot", {
      received: {
        chartSymbol: context.chartSymbol,
        chartExchange: context.chartExchange,
        chartMarketType: context.chartMarketType,
        executionExchange: context.executionExchange,
        executionMarketType: context.executionMarketType,
        executionSymbol: context.executionSymbol,
      },
      approved: APPROVED_CONTEXT,
    });
  }
}

function buildSourceIdentity(response: RawOrderbookResponse): PaperMarketSnapshotSourceWire {
  const exchange = String(response.exchange ?? "").trim().toLowerCase();
  const market = normalizeMarketType(response.market);
  if (exchange !== "binance-perp" || market !== "perp") {
    throw new PaperMarketSnapshotProviderError("UNSUPPORTED_MARKET_SOURCE", "production snapshot requires Binance perpetual BBO", {
      exchange: response.exchange,
      market: response.market,
      warning: response.warning,
      degraded: response.degraded,
      status: response.status,
    });
  }
  return {
    venue: "BINANCE",
    marketType: "perpetual",
    symbol: "BTCUSDT",
  };
}

async function fetchRawOrderbook(
  fetchImpl: typeof fetch,
): Promise<RawOrderbookResponse> {
  const params = new URLSearchParams({ symbol: "BTCUSDT", market: "perp" });
  const res = await fetchImpl(apiUrl(`/api/orderbook/raw?${params}`));
  if (!res.ok) {
    throw new PaperMarketSnapshotProviderError("FETCH_FAILED", `orderbook snapshot HTTP ${res.status}`, { status: res.status });
  }
  return (await res.json()) as RawOrderbookResponse;
}

export async function getPaperMarketSnapshot(
  context: ProductionMarketSnapshotContext | undefined = DEFAULT_TERMINAL_EXECUTION_CONTEXT,
  deps: PaperMarketSnapshotProviderDeps = {},
): Promise<PaperMarketSnapshotWire> {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new PaperMarketSnapshotProviderError("FETCH_FAILED", "fetch is unavailable");
  }

  assertApprovedMapping(context);
  const response = await fetchRawOrderbook(fetchImpl);
  const source = buildSourceIdentity(response);
  const bid = readTopLevel(response.bids, "bid");
  const ask = readTopLevel(response.asks, "ask");
  const bidNum = Number(bid.price);
  const askNum = Number(ask.price);
  if (bidNum > askNum) {
    throw new PaperMarketSnapshotProviderError("INVALID_BBO", "best bid must not exceed best ask", { bid: bid.price, ask: ask.price });
  }

  const timestampRaw = response.timestamp;
  const timestampMs =
    typeof timestampRaw === "number"
      ? timestampRaw
      : typeof timestampRaw === "string"
        ? Number(timestampRaw)
        : Number.NaN;
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
    throw new PaperMarketSnapshotProviderError("MISSING_TIMESTAMP", "orderbook snapshot timestamp is required", {
      timestamp: timestampRaw,
    });
  }

  const nowMs = deps.nowMs ?? (() => Date.now());
  const ageMs = Math.max(0, nowMs() - timestampMs);
  const freshness = {
    ageMs,
    staleAfterMs: BOOKMAP_OB_STALE_MS,
    stale: ageMs > BOOKMAP_OB_STALE_MS,
  };
  if (freshness.stale) {
    throw new PaperMarketSnapshotProviderError("SNAPSHOT_STALE", "production snapshot is stale", freshness);
  }

  return {
    source,
    simulationInstrument: {
      venue: "SIM",
      marketType: "perpetual",
      symbol: "BTCUSDT-PERP",
    },
    bid: bid.price,
    ask: ask.price,
    bidSize: bid.size,
    askSize: ask.size,
    timestampMs,
    freshness,
  };
}

export const paperMarketSnapshotProvider = {
  getSnapshot: getPaperMarketSnapshot,
} as const;
