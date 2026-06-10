import type { BookmapMarketSource } from "@shared/bookmapMarket";
import { getOrderBookForMarket } from "./orderbookMarketRegistry";
import { getSpotOrderBookHealth } from "./orderbookService";
import { getPerpOrderBookHealth } from "./orderbookServicePerp";
import { getBookmapEngine } from "./bookmapEngine";
import { getAggTradeBufferState, getTradesBufferHealth } from "./aggTradeBufferRegistry";
import { shouldEnableBookmapRailwayDiag } from "../lib/runtimeEnv";

const DIAG_INTERVAL_MS = 2_000;
let lastDiagAt = 0;
let intervalStarted = false;

function orderbookStatus(
  bids: number,
  asks: number,
  ageMs: number | null,
  connected: boolean,
): "live" | "stale" | "offline" {
  if (bids === 0 && asks === 0) return "offline";
  if (ageMs != null && ageMs > 10_000) return "stale";
  if (!connected && bids > 0 && asks > 0) return "stale";
  return "live";
}

export function logBookmapRailwayDataDiag(selectedSource: BookmapMarketSource = "spot"): void {
  const now = Date.now();
  if (now - lastDiagAt < DIAG_INTERVAL_MS) return;
  lastDiagAt = now;

  const spotBook = getOrderBookForMarket("spot");
  const perpBook = getOrderBookForMarket("perp");
  const spotHealth = getSpotOrderBookHealth();
  const perpHealth = getPerpOrderBookHealth();
  const spotTradeHealth = getTradesBufferHealth("BTCUSDT", "spot");
  const perpTradeHealth = getTradesBufferHealth("BTCUSDT", "perp");
  const spotBufferState = getAggTradeBufferState("BTCUSDT", "spot");
  const perpBufferState = getAggTradeBufferState("BTCUSDT", "perp");

  const spotBidCount = spotBook.bids.length;
  const spotAskCount = spotBook.asks.length;
  const perpBidCount = perpBook.bids.length;
  const perpAskCount = perpBook.asks.length;

  const lastBookTimestamp = Math.max(
    spotBook.timestamp ?? 0,
    perpBook.timestamp ?? 0,
  );
  const lastTradeTimestamp = Math.max(
    spotTradeHealth.lastAcceptedTradeAt ?? 0,
    perpTradeHealth.lastAcceptedTradeAt ?? 0,
  );

  const orderbookAgeMs =
    lastBookTimestamp > 0 ? Math.max(0, now - lastBookTimestamp) : null;
  const tradesAgeMs =
    lastTradeTimestamp > 0 ? Math.max(0, now - lastTradeTimestamp) : null;

  let heatmapCells = 0;
  try {
    const engine = getBookmapEngine("BTCUSDT", "binance", selectedSource);
    heatmapCells = engine.getCurrentState({ includeStale: true }).heatmapCells.length;
  } catch {
    heatmapCells = 0;
  }

  const hasSpotBook = spotBidCount > 0 && spotAskCount > 0;
  const hasPerpBook = perpBidCount > 0 && perpAskCount > 0;

  console.log("[BOOKMAP_RAILWAY_DATA_DIAG]", {
    env: process.env.NODE_ENV,
    vision: process.env.BINANCE_USE_VISION_API ?? "auto",
    source: selectedSource,
    hasSpotBook,
    hasPerpBook,
    spotBidCount,
    spotAskCount,
    perpBidCount,
    perpAskCount,
    tradeCount: spotBufferState.bufferCount + perpBufferState.bufferCount,
    lastBookTimestamp: lastBookTimestamp || null,
    lastTradeTimestamp: lastTradeTimestamp || null,
    orderbookAgeMs,
    tradesAgeMs,
    selectedSource,
    heatmapCells,
    spotWsConnected: spotHealth.connected,
    perpWsConnected: perpHealth.connected,
    spotStatus: orderbookStatus(spotBidCount, spotAskCount, orderbookAgeMs, spotHealth.connected),
    perpStatus: orderbookStatus(perpBidCount, perpAskCount, orderbookAgeMs, perpHealth.connected),
    endpointOk: hasSpotBook || hasPerpBook,
  });
}

export function startBookmapRailwayDataDiag(): void {
  if (!shouldEnableBookmapRailwayDiag()) return;
  if (intervalStarted) return;
  intervalStarted = true;
  setInterval(() => logBookmapRailwayDataDiag("spot"), DIAG_INTERVAL_MS);
}
