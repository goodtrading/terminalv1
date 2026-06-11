import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { MarketDataGateway } from "./market-gateway";
import { getTerminalState } from "./terminal-state";
import { DeribitOptionsGateway } from "./deribit-gateway";
import { OrderBookGateway } from "./orderbook-gateway";
import { buildTaskPlan } from "./ai/task-agent";
import { buildLiveMarketContext } from "./ai/buildLiveMarketContext";
import { generateAIResponse } from "./lib/openaiClient";
import { z } from "zod";
import { processVacuumDetection, type VacuumEvent, type VacuumState } from "./engine/liquidityVacuum";
import {
  getOrderBook,
  getSpotOrderBookHealth,
  initializeFullDepth,
  resyncSpotOrderBook,
} from "./services/orderbookService";
import { getPerpOrderBookHealth, initializePerpFullDepth } from "./services/orderbookServicePerp";
import { getBookmapEngine, logBookmapMarketStateDiagnostics } from "./services/bookmapEngine";
import { getOrderBookForMarket, parseBookmapMarket } from "./services/orderbookMarketRegistry";
import { queryBboHistory } from "./services/bboHistoryRegistry";
import {
  DERIBIT_OPTIONS_WS_MAX_INSTRUMENTS,
  DERIBIT_OPTIONS_WS_STALE_MS,
  ensureDeribitOptionsTopOfBookStream,
  getDeribitOptionsTopOfBook,
  getDeribitOptionsTopOfBookSnapshot,
} from "./services/deribitOptionsTopOfBookStream";
import { getKrakenOrderBook } from "./kraken-gateway";
import { liquidityVacuumEngine, VacuumEngineInput } from "./lib/liquidityVacuumEngine";
import { VacuumValidationTests } from "./lib/vacuumValidationTests";
import { scenarioEngine, TerminalSignals } from "./lib/scenarioEngine";
import { testScenarioEngine } from "./lib/scenarioEngineTest";
import { resolveCandleLimit } from "@shared/candleLimits";
import { cachedFetch, getCacheSnapshots } from "./lib/ttlCache";
import { startBookmapRailwayDataDiag } from "./services/bookmapRailwayDataDiag";
import { getRecentSlowEndpoints } from "./lib/performanceMonitor";
import { requireSaasAdmin } from "./middleware/saasAuth";
import { isHeatmapEnabled } from "./lib/runtimeEnv";

// Debug flags to prevent event-loop blocking from log spam.
// Keep these false by default; enable locally when diagnosing.
const DEBUG_TERMINAL_STATE = false;
const DEBUG_ORDERBOOK = false;
const DEBUG_VACUUM = false;
const DEBUG_SCENARIOS = false;

const VACUUM_CACHE_TTL_MS = 10_000;
const SCENARIOS_CACHE_TTL_MS = 15_000;
const TERMINAL_STATE_CACHE_TTL_MS = 10_000;
const STORAGE_SIGNAL_CACHE_TTL_MS = 15_000;
const DERIBIT_BOOK_CACHE_TTL_MS = 30_000;
const HEATMAP_CACHE_TTL_MS = 1_000;
const TICKER_CACHE_TTL_MS = 1_000;
const ORDERBOOK_RAW_CACHE_TTL_MS = 1_000;
const CANDLES_CACHE_TTL_MS = 60_000;
const HEATMAP_ENABLED = isHeatmapEnabled();

const BINANCE_CONNECTIVITY_TIMEOUT_MS = 6_000;
const OPTIONS_TOP_OF_BOOK_SSE_MIN_INTERVAL_MS = 500;
const OPTIONS_TOP_OF_BOOK_SSE_MAX_INSTRUMENTS = DERIBIT_OPTIONS_WS_MAX_INSTRUMENTS;
const OPTIONS_TOP_OF_BOOK_SSE_HEARTBEAT_MS = 15000;
const DEFAULT_DESKTOP_VERSION = "0.1.0";

function isValidRawOrderbookSnapshot(value: unknown): boolean {
  const payload = value as { bids?: unknown; asks?: unknown } | null | undefined;
  return Boolean(
    payload &&
      Array.isArray(payload.bids) &&
      Array.isArray(payload.asks) &&
      payload.bids.length > 0 &&
      payload.asks.length > 0,
  );
}

function isValidBookmapStateSnapshot(value: unknown): boolean {
  const payload = value as { bids?: unknown; asks?: unknown; heatmapCells?: unknown } | null | undefined;
  return Boolean(
    payload &&
      Array.isArray(payload.bids) &&
      Array.isArray(payload.asks) &&
      Array.isArray(payload.heatmapCells) &&
      payload.bids.length > 0 &&
      payload.asks.length > 0 &&
      payload.heatmapCells.length > 0,
  );
}

/** Accepts live orderbook before heatmap sampler has produced cells (Railway cold start). */
function isValidBookmapStateOrBootstrap(value: unknown): boolean {
  const payload = value as { bids?: unknown; asks?: unknown } | null | undefined;
  return Boolean(
    payload &&
      Array.isArray(payload.bids) &&
      Array.isArray(payload.asks) &&
      payload.bids.length > 0 &&
      payload.asks.length > 0,
  );
}

function orderbookFeedStatus(
  bids: number,
  asks: number,
  ageMs: number | null,
): "live" | "stale" | "offline" {
  if (bids === 0 && asks === 0) return "offline";
  if (ageMs != null && ageMs > 10_000) return "stale";
  return "live";
}

function isValidLiquidityHeatmapSnapshot(value: unknown): boolean {
  const payload = value as {
    liquidityHeatZones?: unknown;
    bids?: unknown;
    asks?: unknown;
  } | null | undefined;
  return Boolean(
    payload &&
      Array.isArray(payload.liquidityHeatZones) &&
      Array.isArray(payload.bids) &&
      Array.isArray(payload.asks) &&
      payload.liquidityHeatZones.length > 0 &&
      payload.bids.length > 0 &&
      payload.asks.length > 0,
  );
}

function buildDisabledBookmapPayload(symbol = "BTCUSDT", market = parseBookmapMarket(undefined)) {
  return {
    disabled: true,
    reason: "HEATMAP_DISABLED",
    message: "Heatmap disponible en GoodTrading Desktop",
    symbol,
    market,
    exchange: "binance",
    bids: [],
    asks: [],
    heatmapCells: [],
    importantWalls: [],
    structuralWalls: [],
    majorWalls: [],
    timestamp: Date.now(),
    status: "disabled",
    degraded: true,
  };
}

function buildDisabledHeatmapPayload() {
  return {
    disabled: true,
    reason: "HEATMAP_DISABLED",
    message: "Heatmap disponible en GoodTrading Desktop",
    liquidityHeatZones: [],
    gammaAccelerationZones: [],
    bids: [],
    asks: [],
    heatmapSummary: {
      source: "disabled",
      timestamp: Date.now(),
    },
  };
}

function parseDesktopUpdateMandatory(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

function parseDesktopReleaseNotes(value: string | undefined): string[] {
  const raw = value?.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    // Supports simple newline/comma/pipe env vars without requiring JSON.
  }
  return raw
    .split(/\r?\n|\||,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildDesktopUpdatePayload() {
  const latestVersion = process.env.DESKTOP_LATEST_VERSION?.trim() || DEFAULT_DESKTOP_VERSION;
  const minSupportedVersion = process.env.DESKTOP_MIN_SUPPORTED_VERSION?.trim() || "0.1.0";
  const downloadUrl = process.env.DESKTOP_UPDATE_DOWNLOAD_URL?.trim() || "";
  const releaseNotes = parseDesktopReleaseNotes(process.env.DESKTOP_UPDATE_RELEASE_NOTES);

  return {
    latestVersion,
    minSupportedVersion,
    mandatory: parseDesktopUpdateMandatory(process.env.DESKTOP_UPDATE_MANDATORY),
    downloadUrl,
    releaseNotes,
    publishedAt: process.env.DESKTOP_UPDATE_PUBLISHED_AT?.trim() || null,
  };
}

function parseInstrumentListParam(value: unknown): string[] {
  const raw = Array.isArray(value) ? value.join(",") : typeof value === "string" ? value : "";
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((name) => name.startsWith("BTC-") || name.startsWith("ETH-"))
    .slice(0, DERIBIT_OPTIONS_WS_MAX_INSTRUMENTS);
}

function buildTopOfBookPayload(instrumentNames: string[]) {
  const serverNow = Date.now();
  const snapshot = getDeribitOptionsTopOfBookSnapshot(instrumentNames, {
    includeStale: false,
  });
  const items: Record<string, unknown> = {};

  for (const instrumentName of Object.keys(snapshot)) {
    const item = snapshot[instrumentName];
    items[instrumentName] = {
      instrumentName: item.instrumentName,
      bestBidPrice: item.bestBidPrice,
      bestAskPrice: item.bestAskPrice,
      bestBidSize: item.bestBidSize,
      bestAskSize: item.bestAskSize,
      deribitReceivedAt: item.deribitReceivedAt,
      cacheUpdatedAt: item.cacheUpdatedAt,
      updatedAt: item.updatedAt,
      ageMs: serverNow - item.updatedAt,
      source: item.source,
      bidSizeStats1s: item.bidSizeStats1s,
      askSizeStats1s: item.askSizeStats1s,
    };
  }

  return {
    serverNow,
    timestamp: serverNow,
    staleMs: DERIBIT_OPTIONS_WS_STALE_MS,
    items,
  };
}

async function probeBinanceDepth(
  label: string,
  url: string,
): Promise<{
  label: string;
  url: string;
  ok: boolean;
  statusCode: number | null;
  bidCount: number;
  askCount: number;
  error: string | null;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BINANCE_CONNECTIVITY_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const statusCode = res.status;
    if (!res.ok) {
      return {
        label,
        url,
        ok: false,
        statusCode,
        bidCount: 0,
        askCount: 0,
        error: `HTTP ${statusCode}`,
      };
    }
    const data = await res.json();
    return {
      label,
      url,
      ok: true,
      statusCode,
      bidCount: Array.isArray(data?.bids) ? data.bids.length : 0,
      askCount: Array.isArray(data?.asks) ? data.asks.length : 0,
      error: null,
    };
  } catch (error) {
    return {
      label,
      url,
      ok: false,
      statusCode: null,
      bidCount: 0,
      askCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

// Initialize full depth on server start only when Bookmap/heatmap is enabled.
if (HEATMAP_ENABLED) {
  initializeFullDepth().catch(console.error);
  initializePerpFullDepth().catch(console.error);
  startBookmapRailwayDataDiag();
}

// NOTE: Tests removed from auto-execution to prevent startup blocking
// Use /api/vacuum/test and /api/scenarios/test endpoints for manual testing

// Start spot + perp depth WebSocket feeds
import "./services/orderbookService";
import "./services/orderbookServicePerp";
import {
  queryBufferedAggTrades,
  getTradesBufferHealth,
  subscribeAggTradeBuffer,
  trackAggTradeSseClient,
} from "./services/aggTradeBufferService";
import { startOptionsRefreshInterval } from "./options-engine";

startOptionsRefreshInterval();

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const { registerDebugDbRoutes } = await import("./routes/debugDbRoutes");
  registerDebugDbRoutes(app);

  app.get("/api/runtime/features", (_req: Request, res: Response) => {
    res.json({
      heatmapEnabled: HEATMAP_ENABLED,
    });
  });

  app.get("/api/desktop/update", (_req: Request, res: Response) => {
    res.json(buildDesktopUpdatePayload());
  });

  app.get("/api/system/performance", requireSaasAdmin, (_req: Request, res: Response) => {
    const memory = process.memoryUsage();
    const cache = getCacheSnapshots();
    const totals = cache.reduce(
      (acc, entry) => {
        acc.hits += entry.hits;
        acc.misses += entry.misses;
        acc.staleHits += entry.staleHits;
        acc.errors += entry.errors;
        if (entry.inFlight) acc.inFlight += 1;
        return acc;
      },
      { hits: 0, misses: 0, staleHits: 0, errors: 0, inFlight: 0 },
    );

    res.json({
      ok: true,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      memory,
      cache: {
        activeKeys: cache.length,
        totals,
        keys: cache,
      },
      lastSlowEndpoints: getRecentSlowEndpoints(),
    });
  });

  app.get("/api/debug/binance-connectivity", async (_req: Request, res: Response) => {
    const spotHosts = [
      "https://api1.binance.com",
      "https://api2.binance.com",
      "https://api3.binance.com",
      "https://api.binance.com",
    ];
    const spot = await Promise.all(
      spotHosts.map((host) =>
        probeBinanceDepth(
          host.replace("https://", ""),
          `${host}/api/v3/depth?symbol=BTCUSDT&limit=5`,
        ),
      ),
    );
    const futures = await probeBinanceDepth(
      "fapi.binance.com",
      "https://fapi.binance.com/fapi/v1/depth?symbol=BTCUSDT&limit=5",
    );

    res.json({
      timestamp: Date.now(),
      timeoutMs: BINANCE_CONNECTIVITY_TIMEOUT_MS,
      spot,
      futures,
    });
  });

  // --- Raw Order Book Endpoint (unified shape: exchange, bids, asks, timestamp) ---
  app.get("/api/orderbook/raw", async (req: Request, res: Response) => {
    const source = (req.query.source as string)?.toLowerCase();
    const symbol = (req.query.symbol as string) || "BTCUSDT";
    const market = parseBookmapMarket(req.query.market);
    if (!HEATMAP_ENABLED) {
      return res.json({
        disabled: true,
        reason: "HEATMAP_DISABLED",
        message: "Heatmap disponible en GoodTrading Desktop",
        exchange: "disabled",
        market,
        bids: [],
        asks: [],
        timestamp: Date.now(),
        source: "disabled",
        status: "disabled",
        degraded: true,
      });
    }
    const cacheKey = `orderbook:raw:${source ?? "default"}:${symbol}:${market}`;
    const krakenFallbackEnabled =
      String(process.env.ALLOW_KRAKEN_ORDERBOOK_FALLBACK ?? "").toLowerCase() === "true";
    try {
      const payload = await cachedFetch(
        cacheKey,
        {
          ttlMs: ORDERBOOK_RAW_CACHE_TTL_MS,
          staleTtlMs: 30_000,
          validate: isValidRawOrderbookSnapshot,
          invalidMessage: `Invalid empty orderbook snapshot for ${cacheKey}`,
        },
        async () => {
          if (source === "kraken") {
            const ob = await getKrakenOrderBook(symbol, 500);
            return {
              exchange: "kraken",
              market,
              bids: ob.bids.map((level) => [level.price.toString(), level.size.toString()]),
              asks: ob.asks.map((level) => [level.price.toString(), level.size.toString()]),
              timestamp: ob.timestamp,
            };
          }
          let orderBook = getOrderBookForMarket(market);
          let exchange = market === "perp" ? "binance-perp" : "binance";
          let binanceSpotEmpty =
            market === "spot" && orderBook.bids.length === 0 && orderBook.asks.length === 0;
          let warning: string | undefined;
          let providerStatus: Record<string, unknown> | undefined;

          if (binanceSpotEmpty) {
            await resyncSpotOrderBook("api-orderbook-raw-empty");
            orderBook = getOrderBookForMarket(market);
            binanceSpotEmpty = orderBook.bids.length === 0 && orderBook.asks.length === 0;
          }

          if (binanceSpotEmpty && krakenFallbackEnabled) {
            const ob = await getKrakenOrderBook(symbol, 500);
            orderBook = {
              bids: ob.bids.map((b) => ({ price: b.price, size: b.size })),
              asks: ob.asks.map((a) => ({ price: a.price, size: a.size })),
              timestamp: ob.timestamp,
            };
            exchange = "kraken";
          } else if (binanceSpotEmpty) {
            warning = "binance_spot_orderbook_empty";
            providerStatus = {
              spot: getSpotOrderBookHealth(),
              perp: getPerpOrderBookHealth(),
            };
          }
          const health =
            market === "perp" ? getPerpOrderBookHealth() : getSpotOrderBookHealth();
          const feedStatus = orderbookFeedStatus(
            orderBook.bids.length,
            orderBook.asks.length,
            health.ageMs ?? null,
          );
          return {
            exchange,
            market,
            bids: orderBook.bids.map((level) => [level.price.toString(), level.size.toString()]),
            asks: orderBook.asks.map((level) => [level.price.toString(), level.size.toString()]),
            timestamp: orderBook.timestamp || Date.now(),
            source: exchange,
            status: feedStatus,
            ...(warning
              ? {
                  warning,
                  fallbackEligible: true,
                  krakenFallbackEnabled: false,
                  providerStatus,
                }
              : {}),
          };
        },
      );
      if (process.env.NODE_ENV === "production" && !isValidRawOrderbookSnapshot(payload)) {
        console.warn("[bookmap-feed] /api/orderbook/raw invalid payload", {
          source: source ?? "default",
          market,
          bids: Array.isArray((payload as any)?.bids) ? (payload as any).bids.length : null,
          asks: Array.isArray((payload as any)?.asks) ? (payload as any).asks.length : null,
          degraded: Boolean((payload as any)?.degraded),
        });
      }
      res.json(payload);
    } catch (error: any) {
      console.error("[API] Order book fetch error:", error?.message ?? error);
      try {
        const recoveryMarket = parseBookmapMarket(req.query.market);
        const liveBook = getOrderBookForMarket(recoveryMarket);
        if (liveBook.bids.length > 0 && liveBook.asks.length > 0) {
          const health =
            recoveryMarket === "perp"
              ? getPerpOrderBookHealth()
              : getSpotOrderBookHealth();
          return res.json({
            exchange: recoveryMarket === "perp" ? "binance-perp" : "binance",
            market: recoveryMarket,
            bids: liveBook.bids.map((level) => [level.price.toString(), level.size.toString()]),
            asks: liveBook.asks.map((level) => [level.price.toString(), level.size.toString()]),
            timestamp: liveBook.timestamp || Date.now(),
            source: recoveryMarket === "perp" ? "binance-perp" : "binance",
            status: orderbookFeedStatus(
              liveBook.bids.length,
              liveBook.asks.length,
              health.ageMs ?? null,
            ),
            degraded: true,
            warning: "served_from_live_orderbook_after_cache_miss",
          });
        }
      } catch {
        // fall through to 503
      }
      res.status(503).json({
        error: "ORDERBOOK_UNAVAILABLE",
        degraded: true,
        details: error?.message ?? "Failed to fetch order book",
      });
    }
  });

  app.get("/api/bookmap/bbo-history", (req: Request, res: Response) => {
    const symbol = ((req.query.symbol as string) || "BTCUSDT").toUpperCase();
    const market = parseBookmapMarket(req.query.market);
    if (!HEATMAP_ENABLED) {
      return res.json({
        symbol,
        market,
        disabled: true,
        reason: "HEATMAP_DISABLED",
        points: [],
        serverTime: Date.now(),
      });
    }
    const startMs =
      req.query.startTime != null ? Number(req.query.startTime) : undefined;
    const endMs = req.query.endTime != null ? Number(req.query.endTime) : undefined;

    try {
      const raw = queryBboHistory(symbol, market, {
        startMs: Number.isFinite(startMs) ? startMs : undefined,
        endMs: Number.isFinite(endMs) ? endMs : undefined,
      });
      res.json({
        symbol,
        market,
        points: raw.map((p) => ({
          timestamp: p.timestamp,
          bestBid: p.bestBid,
          bestAsk: p.bestAsk,
        })),
        serverTime: Date.now(),
      });
    } catch (error: unknown) {
      console.error("[API] /api/bookmap/bbo-history error:", error);
      res.status(500).json({ error: "Failed to fetch BBO history" });
    }
  });

  app.get("/api/bookmap/state", async (req: Request, res: Response) => {
    const symbol = ((req.query.symbol as string) || "BTCUSDT").toUpperCase();
    const exchange = ((req.query.exchange as string) || "binance").toLowerCase();
    const market = parseBookmapMarket(req.query.market);
    if (!HEATMAP_ENABLED) {
      return res.json({
        ...buildDisabledBookmapPayload(symbol, market),
        exchange,
      });
    }
    const priceRangePct = req.query.priceRangePct
      ? Number(req.query.priceRangePct)
      : undefined;
    const bucketMs = req.query.bucketMs ? Number(req.query.bucketMs) : undefined;
    const minWallSize = req.query.minWallSize ? Number(req.query.minWallSize) : undefined;
    const includeStale = req.query.includeStale === "true" || req.query.includeStale === "1";
    const priceMin = req.query.priceMin != null ? Number(req.query.priceMin) : undefined;
    const priceMax = req.query.priceMax != null ? Number(req.query.priceMax) : undefined;

    try {
      const cacheKey = [
        "bookmap:state",
        symbol,
        exchange,
        market,
        priceRangePct ?? "auto",
        bucketMs ?? "default",
        minWallSize ?? "default",
        includeStale ? "stale" : "fresh",
        priceMin ?? "min-auto",
        priceMax ?? "max-auto",
      ].join(":");
      const payload = await cachedFetch(
        cacheKey,
        {
          ttlMs: 1_000,
          staleTtlMs: 10_000,
          validate: isValidBookmapStateOrBootstrap,
          invalidMessage: `Invalid empty bookmap snapshot for ${cacheKey}`,
        },
        async () => {
          const engine = getBookmapEngine(symbol, exchange, market);

          if (bucketMs != null && Number.isFinite(bucketMs) && bucketMs > 0) {
            engine.setBucketMs(bucketMs);
          }

          if (!engine.hasData()) {
            if (exchange === "kraken") {
              const ob = await getKrakenOrderBook(symbol, 500);
              engine.applySnapshot({
                bids: ob.bids.map((b) => ({ price: b.price, size: b.size })),
                asks: ob.asks.map((a) => ({ price: a.price, size: a.size })),
                timestamp: ob.timestamp,
              });
            } else if (exchange === "binance" || exchange.startsWith("binance")) {
              const orderBook = getOrderBookForMarket(market);
              if (orderBook.bids.length > 0 && orderBook.asks.length > 0) {
                engine.applySnapshot({
                  bids: orderBook.bids,
                  asks: orderBook.asks,
                  timestamp: orderBook.timestamp ?? Date.now(),
                });
              }
            }
          }

          const state = engine.getCurrentState({
            priceRangePct,
            priceMin:
              priceMin != null && Number.isFinite(priceMin) ? priceMin : undefined,
            priceMax:
              priceMax != null && Number.isFinite(priceMax) ? priceMax : undefined,
            minWallSize,
            includeStale,
          });

          logBookmapMarketStateDiagnostics(symbol, exchange, market);

          const health =
            market === "perp" ? getPerpOrderBookHealth() : getSpotOrderBookHealth();
          const hasHeatmap = state.heatmapCells.length > 0;
          return {
            symbol,
            exchange,
            market,
            ...state,
            status: hasHeatmap
              ? orderbookFeedStatus(state.bids.length, state.asks.length, health.ageMs ?? null)
              : "stale",
            degraded: !hasHeatmap,
          };
        },
      );
      if (process.env.NODE_ENV === "production" && !isValidBookmapStateOrBootstrap(payload)) {
        console.warn("[bookmap-feed] /api/bookmap/state invalid payload", {
          symbol,
          exchange,
          market,
          bids: Array.isArray((payload as any)?.bids) ? (payload as any).bids.length : null,
          asks: Array.isArray((payload as any)?.asks) ? (payload as any).asks.length : null,
          cells: Array.isArray((payload as any)?.heatmapCells) ? (payload as any).heatmapCells.length : null,
          degraded: Boolean((payload as any)?.degraded),
        });
      }
      res.json(payload);
    } catch (error: any) {
      console.error("[API] /api/bookmap/state error:", error?.message ?? error);
      try {
        const recoveryMarket = parseBookmapMarket(req.query.market);
        const liveBook = getOrderBookForMarket(recoveryMarket);
        if (liveBook.bids.length > 0 && liveBook.asks.length > 0) {
          const health =
            recoveryMarket === "perp"
              ? getPerpOrderBookHealth()
              : getSpotOrderBookHealth();
          return res.json({
            symbol,
            exchange,
            market: recoveryMarket,
            bids: liveBook.bids.map((b) => ({
              price: b.price,
              size: b.size,
              side: "bid" as const,
              firstSeenTs: liveBook.timestamp ?? Date.now(),
              lastUpdateTs: liveBook.timestamp ?? Date.now(),
              maxSeenSize: b.size,
              isImportant: false,
              isStructural: false,
              isMajor: false,
              stale: false,
            })),
            asks: liveBook.asks.map((a) => ({
              price: a.price,
              size: a.size,
              side: "ask" as const,
              firstSeenTs: liveBook.timestamp ?? Date.now(),
              lastUpdateTs: liveBook.timestamp ?? Date.now(),
              maxSeenSize: a.size,
              isImportant: false,
              isStructural: false,
              isMajor: false,
              stale: false,
            })),
            heatmapCells: [],
            importantWalls: [],
            structuralWalls: [],
            majorWalls: [],
            timestamp: liveBook.timestamp ?? Date.now(),
            status: orderbookFeedStatus(
              liveBook.bids.length,
              liveBook.asks.length,
              health.ageMs ?? null,
            ),
            degraded: true,
            warning: "served_from_live_orderbook_after_cache_miss",
          });
        }
      } catch {
        // fall through to 503
      }
      res.status(503).json({
        error: "BOOKMAP_STATE_UNAVAILABLE",
        degraded: true,
        details: error?.message ?? "Failed to fetch bookmap state",
      });
    }
  });

  // --- Deribit Options Gateway Endpoints ---
  app.get("/api/options/raw", async (_req, res) => {
    try {
      const { options, source } = await DeribitOptionsGateway.ingestOptions();
      res.json({ options, source });
    } catch (e: any) {
      res.status(500).json({ error: "INGESTION_FAILED", details: e.message });
    }
  });

  app.get("/api/options/summary", async (_req, res) => {
    try {
      const { options, source } = await DeribitOptionsGateway.ingestOptions();
      const ticker = await MarketDataGateway.getCachedTicker();
      const summary = await DeribitOptionsGateway.getSummary(options, ticker?.price, source);
      res.json(summary);
    } catch (e: any) {
      res.status(500).json({ error: "SUMMARY_FAILED", details: e.message });
    }
  });

  // ---- AI DEV AGENT (localhost only) ----
  app.post("/api/ai/task-agent", async (req: Request, res: Response) => {
    try {
      const host = req.hostname;

      if (host !== "localhost" && host !== "127.0.0.1") {
        return res.status(403).json({ error: "AI agent disabled in production" });
      }

      const { goal } = req.body ?? {};

      if (!goal || typeof goal !== "string") {
        return res.status(400).json({ error: "Missing goal" });
      }

      const plan = buildTaskPlan({ goal });

      res.json(plan);
    } catch (err: any) {
      console.error("AI task-agent error:", err);
      res.status(500).json({ error: "AI agent failure" });
    }
  });

  app.post("/api/ai/chat", async (req: Request, res: Response) => {
    const aiChatSchema = z.object({
      message: z.string().trim().min(1).max(4000),
      includeLiveContext: z.boolean().optional().default(true),
      marketContext: z.any().optional(),
    });

    try {
      const parsed = aiChatSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: "INVALID_AI_REQUEST" });
      }

      const { message, includeLiveContext, marketContext } = parsed.data;

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ error: "OPENAI_API_KEY_MISSING" });
      }

      let finalMarketContext: any = undefined;
      if (marketContext != null) {
        if (typeof marketContext === "object" && !Array.isArray(marketContext)) {
          // Guard against accidental huge payloads.
          const sizeBytes = Buffer.byteLength(JSON.stringify(marketContext), "utf8");
          if (sizeBytes <= 25_000) finalMarketContext = marketContext;
        } else {
          return res.status(400).json({ error: "INVALID_AI_REQUEST" });
        }
      }

      if (!finalMarketContext && includeLiveContext) {
        try {
          finalMarketContext = await buildLiveMarketContext();
        } catch (ctxErr: any) {
          finalMarketContext = undefined;
        }
      }

      const responseText = await generateAIResponse({
        message,
        marketContext: finalMarketContext,
      });

      return res.json({ response: responseText });
    } catch (err: any) {
      // Produce structured error payload with exact failure cause.
      if (err) console.error("AI_CHAT_ERROR:", err.message ?? String(err));
      const details = err?.message || String(err) || "Unknown backend error";

      return res.status(500).json({
        error: "AI_CHAT_ERROR",
        details: details || "Unknown backend error",
      });
    }
  });

  // --- New Terminal Aggregation Endpoint ---
  app.get("/api/terminal/state", async (_req, res) => {
    try {
      const state = await cachedFetch(
        "terminal:state",
        { ttlMs: TERMINAL_STATE_CACHE_TTL_MS, staleTtlMs: 120_000 },
        getTerminalState,
      );
      const hasPositioning = state != null && "positioning" in state;
      const hasAbsorption = hasPositioning && state.positioning != null && typeof (state.positioning as any).absorption === "object";
      const opts = (state as any)?.options;
      const gm = (state as any)?.gravityMap;
      if (DEBUG_TERMINAL_STATE) {
        console.log("[API terminal/state]", {
          hasMarket: !!state?.market,
          gammaRegime: state?.market?.gammaRegime,
          hasOptions: !!opts,
          gravityMapStatus: gm?.status ?? null,
        });
      }
      res.json(state);
    } catch (error: any) {
      res.status(503).json({
        ok: false,
        degraded: true,
        error: "TERMINAL_STATE_UNAVAILABLE",
        details: error.message,
        modules: {
          gamma: { ok: false },
          market: { ok: false },
          orderbook: { ok: false },
          flows: { ok: false },
        },
      });
    }
  });

  // Existing analytics endpoints
  app.get("/api/market-state", async (_req, res) => {
    try {
      const data = await cachedFetch("storage:market-state", { ttlMs: STORAGE_SIGNAL_CACHE_TTL_MS, staleTtlMs: 120_000 }, async () => {
        const marketState = await storage.getMarketState();
        const optionsLastUpdated = storage.getOptionsLastUpdated();
        if (!marketState) {
          throw new Error("MARKET_STATE_UNAVAILABLE");
        }
        return { ...marketState, optionsLastUpdated };
      });
      res.json(data);
    } catch {
      res.status(503).json({
        error: "MARKET_STATE_UNAVAILABLE",
        optionsLastUpdated: storage.getOptionsLastUpdated() ?? null,
      });
    }
  });

  app.get("/api/dealer-exposure", async (_req, res) => {
    try {
      const data = await cachedFetch("storage:dealer-exposure", { ttlMs: STORAGE_SIGNAL_CACHE_TTL_MS, staleTtlMs: 120_000 }, async () => {
        const value = await storage.getDealerExposure();
        if (!value) throw new Error("DEALER_EXPOSURE_UNAVAILABLE");
        return value;
      });
      res.json(data);
    } catch {
      res.status(503).json({ error: "DEALER_EXPOSURE_UNAVAILABLE" });
    }
  });

  app.get("/api/options-positioning", async (_req, res) => {
    try {
      const data = await cachedFetch("storage:options-positioning", { ttlMs: STORAGE_SIGNAL_CACHE_TTL_MS, staleTtlMs: 120_000 }, async () => {
        const value = await storage.getOptionsPositioning();
        if (!value) throw new Error("OPTIONS_POSITIONING_UNAVAILABLE");
        return value;
      });
      res.json(data);
    } catch {
      res.status(503).json({ error: "OPTIONS_POSITIONING_UNAVAILABLE" });
    }
  });

  app.get("/api/key-levels", async (_req, res) => {
    try {
      const data = await cachedFetch("storage:key-levels", { ttlMs: STORAGE_SIGNAL_CACHE_TTL_MS, staleTtlMs: 120_000 }, async () => {
        const value = await storage.getKeyLevels();
        if (!value) throw new Error("KEY_LEVELS_UNAVAILABLE");
        return value;
      });
      res.json(data);
    } catch {
      res.status(503).json({ error: "KEY_LEVELS_UNAVAILABLE" });
    }
  });

  // Old scenarios endpoint removed - replaced by structural scenarios endpoint below

  app.get("/api/dealer-hedging-flow", async (_req, res) => {
    const data = await cachedFetch("storage:dealer-hedging-flow", { ttlMs: STORAGE_SIGNAL_CACHE_TTL_MS, staleTtlMs: 120_000 }, () =>
      storage.getDealerHedgingFlow(),
    );
    res.json(data);
  });

  app.get("/api/orderbook", async (_req, res) => {
    try {
      const orderbook = getOrderBook();
      
      if (DEBUG_ORDERBOOK) {
        console.debug("[API] Orderbook request:", {
          bidCount: orderbook.bids.length,
          askCount: orderbook.asks.length,
          hasTimestamp: !!orderbook.timestamp,
          topBid: orderbook.bids[0],
          topAsk: orderbook.asks[0],
        });
      }
      
      res.json(orderbook);
    } catch (error) {
      console.error("[API] Orderbook fetch error:", error);
      res.status(500).json({ error: "Failed to fetch orderbook data" });
    }
  });

  app.get("/api/orderbook/status", async (_req, res) => {
    try {
      const orderbook = getOrderBook();
      const isConnected = orderbook.timestamp && (Date.now() - orderbook.timestamp) < 5000; // Connected if data within 5 seconds
      
      res.json({
        connected: isConnected,
        bidCount: orderbook.bids.length,
        askCount: orderbook.asks.length,
        lastUpdate: orderbook.timestamp,
        age: orderbook.timestamp ? Date.now() - orderbook.timestamp : null
      });
    } catch (error) {
      console.error("[API] Orderbook status error:", error);
      res.status(500).json({ error: "Failed to get orderbook status" });
    }
  });

  // --- New Market Data Gateway Endpoints ---

  app.get("/api/market/candles", async (req, res) => {
    const symbol = (req.query.symbol as string) || "BTCUSDT";
    const interval = (req.query.interval as string) || "15m";
    const limit = resolveCandleLimit(interval, req.query.limit);
    const source = req.query.source as string | undefined;

    try {
      const candles = await cachedFetch(
        `market:candles:${symbol}:${interval}:${limit}:${source ?? "default"}`,
        { ttlMs: CANDLES_CACHE_TTL_MS, staleTtlMs: 5 * 60_000 },
        () => MarketDataGateway.getCandles(symbol, interval, limit, source),
      );
      res.json(candles);
    } catch (error: any) {
      console.error(`[Gateway] Candle Fetch Error: ${error.message}`);
      res.status(503).json({
        error: "MARKET_DATA_UNAVAILABLE",
        details: error.message
      });
    }
  });

  app.get("/api/market/ticker", async (req, res) => {
    const symbol = (req.query.symbol as string) || "BTCUSDT";
    const source = req.query.source as string | undefined;
    try {
      const ticker = await cachedFetch(
        `market:ticker:${symbol}:${source ?? "default"}`,
        { ttlMs: TICKER_CACHE_TTL_MS, staleTtlMs: 30_000 },
        () => MarketDataGateway.getTicker(symbol, source),
      );
      res.json(ticker);
    } catch (error: any) {
      console.error(`[Gateway] Ticker Fetch Error: ${error.message}`);
      res.status(503).json({
        error: "MARKET_DATA_UNAVAILABLE",
        details: error.message
      });
    }
  });

  /** Aggregated trades for market data analysis (Binance aggTrades proxy). */
  app.get("/api/market/agg-trades", async (req, res) => {
    const rid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const symbolRaw = (req.query.symbol as string) || "BTCUSDT";
    const symbol = symbolRaw.replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "BTCUSDT";

    let startTime: number | undefined =
      req.query.startTime != null ? Number(req.query.startTime) : undefined;
    let endTime: number | undefined = req.query.endTime != null ? Number(req.query.endTime) : undefined;

    const limitRaw = req.query.limit != null ? Number(req.query.limit) : 5000;
    const limit = Number.isFinite(limitRaw) ? Math.min(5000, Math.max(1, limitRaw)) : 5000;
    const fullRange =
      String(req.query.fullRange ?? "").toLowerCase() === "1" ||
      String(req.query.fullRange ?? "").toLowerCase() === "true";

    const logCtx = () =>
      `[agg-trades ${rid}] symbol=${symbol} startMs=${startTime} endMs=${endTime} limit=${limit} fullRange=${fullRange ? 1 : 0}`;

    try {
      if (startTime != null && endTime != null) {
        if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
          console.warn(`${logCtx()} invalid window (non-finite) → empty array`);
          return res.status(200).json([]);
        }
        if (startTime > endTime) {
          const tmp = startTime;
          startTime = endTime;
          endTime = tmp;
        }
        const now = Date.now();
        if (endTime > now) endTime = now;
        const MAX_SPAN_MS = 48 * 60 * 60 * 1000;
        if (endTime - startTime > MAX_SPAN_MS) {
          startTime = endTime - MAX_SPAN_MS;
        }
      }

      console.log(`${logCtx()} → gateway`);

      const market = parseBookmapMarket(req.query.market);
      const trades = await MarketDataGateway.getAggTrades(symbol, {
        startTimeMs: startTime != null && Number.isFinite(startTime) ? startTime : undefined,
        endTimeMs: endTime != null && Number.isFinite(endTime) ? endTime : undefined,
        limit,
        fullRange,
        market,
      });

      console.log(`${logCtx()} ← count=${Array.isArray(trades) ? trades.length : "not-array"}`);
      if (process.env.NODE_ENV === "production" && (!Array.isArray(trades) || trades.length === 0)) {
        console.warn(`${logCtx()} empty result`, {
          tradeFeedStatus: getTradesBufferHealth(symbol, market),
        });
      }

      res.status(200).json(Array.isArray(trades) ? trades : []);
    } catch (error: any) {
      console.error(`${logCtx()} exception:`, error?.message ?? error, error?.stack);
      res.status(200).json([]);
    }
  });

  /** Real-time aggTrades stream (SSE) for live market data updates. */
  app.get("/api/market/agg-trades/stream", (req, res) => {
    const symbolRaw = (req.query.symbol as string) || "BTCUSDT";
    const symbol = symbolRaw.replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "BTCUSDT";
    const market = parseBookmapMarket(req.query.market);
    if (!HEATMAP_ENABLED) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(
        `event: disabled\ndata: ${JSON.stringify({
          ok: false,
          reason: "HEATMAP_DISABLED",
          message: "Heatmap disponible en GoodTrading Desktop",
          symbol,
          market,
        })}\n\n`,
      );
      res.end();
      return;
    }
    const sinceRaw = req.query.since != null ? Number(req.query.since) : NaN;
    const since = Number.isFinite(sinceRaw) ? Math.floor(sinceRaw) : Date.now() - 2_000;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const send = (t: any) => {
      res.write(`data: ${JSON.stringify(t)}\n\n`);
    };
    res.write(`event: ready\ndata: {"ok":true}\n\n`);

    const seed = queryBufferedAggTrades(symbol, since, Date.now(), market);
    for (const t of seed) send(t);
    if (process.env.NODE_ENV === "production" && seed.length === 0) {
      console.warn("[API] /api/market/agg-trades/stream: empty seed", {
        symbol,
        market,
        since,
        tradeFeedStatus: getTradesBufferHealth(symbol, market),
      });
    }

    trackAggTradeSseClient(market, 1);

    const unsubscribe = subscribeAggTradeBuffer(
      symbol,
      (trade) => {
        send(trade);
      },
      market,
    );

    const hb = setInterval(() => {
      res.write(`event: ping\ndata: {}\n\n`);
    }, 15_000);

    req.on("close", () => {
      clearInterval(hb);
      unsubscribe();
      trackAggTradeSseClient(market, -1);
    });
  });

  app.get("/api/liquidity/heatmap", async (_req, res) => {
    if (!HEATMAP_ENABLED) {
      return res.json(buildDisabledHeatmapPayload());
    }
    try {
      const heatmap = await cachedFetch(
        "liquidity:heatmap",
        {
          ttlMs: HEATMAP_CACHE_TTL_MS,
          staleTtlMs: 60_000,
          validate: isValidLiquidityHeatmapSnapshot,
          invalidMessage: "Invalid empty liquidity heatmap snapshot",
        },
        async () => {
          const ticker = MarketDataGateway.getCachedTicker();
          const spotPrice = ticker?.price;
          if (!spotPrice) {
            throw new Error("SPOT_PRICE_UNAVAILABLE");
          }
          return OrderBookGateway.getLiquidityHeatmap(spotPrice);
        },
      );
      if (process.env.NODE_ENV === "production" && !isValidLiquidityHeatmapSnapshot(heatmap)) {
        console.warn("[bookmap-feed] /api/liquidity/heatmap invalid payload", {
          zones: Array.isArray((heatmap as any)?.liquidityHeatZones)
            ? (heatmap as any).liquidityHeatZones.length
            : null,
          bids: Array.isArray((heatmap as any)?.bids) ? (heatmap as any).bids.length : null,
          asks: Array.isArray((heatmap as any)?.asks) ? (heatmap as any).asks.length : null,
          degraded: Boolean((heatmap as any)?.degraded),
        });
      }
      res.json(heatmap);
    } catch (e: any) {
      res.status(503).json({ error: "HEATMAP_FAILED", degraded: true, details: e.message });
    }
  });

  // Legacy route redirect for terminal compatibility during transition
  app.get("/api/chart/history", async (req, res) => {
    const symbol = (req.query.symbol as string) || "BTCUSDT";
    const interval = (req.query.interval as string) || "15m";
    const limit = resolveCandleLimit(interval, req.query.limit);
    const source = req.query.source as string | undefined;

    try {
      const candles = await cachedFetch(
        `market:candles:${symbol}:${interval}:${limit}:${source ?? "default"}`,
        { ttlMs: CANDLES_CACHE_TTL_MS, staleTtlMs: 5 * 60_000 },
        () => MarketDataGateway.getCandles(symbol, interval, limit, source),
      );
      res.json(candles);
    } catch (error: any) {
      res.status(503).json({
        error: "FAILED_TO_FETCH_HISTORY",
        details: error.message
      });
    }
  });

  // --- Liquidity Vacuum Analysis Endpoint ---
  app.get("/api/vacuum", async (req: Request, res: Response) => {
    try {
      const result = await cachedFetch("engine:vacuum", { ttlMs: VACUUM_CACHE_TTL_MS, staleTtlMs: 120_000 }, async () => {
        const [orderBook, terminalState, positioning] = await Promise.all([
          getOrderBook(),
          cachedFetch("terminal:state", { ttlMs: TERMINAL_STATE_CACHE_TTL_MS, staleTtlMs: 120_000 }, getTerminalState),
          storage.getOptionsPositioning()
        ]);

        if (!orderBook || !orderBook.bids.length || !orderBook.asks.length) {
          throw new Error("Insufficient orderbook data for vacuum analysis");
        }

        const bestBid = orderBook.bids[0]?.price || 0;
        const bestAsk = orderBook.asks[0]?.price || 0;
        const spotPrice = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : bestBid || bestAsk;

        if (!spotPrice) {
          throw new Error("Unable to determine spot price");
        }

        const input: VacuumEngineInput = {
          spotPrice,
          bids: orderBook.bids.map(bid => ({ price: bid.price, size: bid.size })),
          asks: orderBook.asks.map(ask => ({ price: ask.price, size: ask.size })),
          nearestBookClusters: positioning ? {
            above: [positioning.callWall].filter(Boolean),
            below: [positioning.putWall].filter(Boolean)
          } : undefined,
          spread: bestAsk - bestBid,
          liquiditySweepRisk: terminalState?.market?.liquiditySweepDetector,
          dealerHedgingFlow: terminalState?.market?.dealerHedgingFlow,
          volatility: terminalState?.market?.distanceToFlip ? Math.abs(terminalState.market.distanceToFlip) : undefined
        };

        return liquidityVacuumEngine.analyze(input);
      });
      res.json(result);
    } catch (error) {
      console.error("Vacuum analysis error:", error);
      res.status(500).json({
        error: "Failed to analyze vacuum conditions",
        vacuumRisk: "LOW",
        vacuumDirection: "NEUTRAL",
        confirmedVacuumActive: false
      });
    }
  });

  // --- Validation Test Endpoint ---
  app.get("/api/vacuum/test", async (req: Request, res: Response) => {
    try {
      console.log("🧪 Manual validation test triggered via API");
      await VacuumValidationTests.runAllTests();
      res.json({ message: "Validation tests completed - check server logs for results" });
    } catch (error) {
      console.error("Validation test error:", error);
      res.status(500).json({ error: "Validation tests failed" });
    }
  });

  // --- Scenario Test Endpoint ---
  app.get("/api/scenarios/test", async (req: Request, res: Response) => {
    try {
      console.log("🧪 Manual scenario test triggered via API");
      testScenarioEngine();
      res.json({ message: "Scenario tests completed - check server logs for results" });
    } catch (error) {
      console.error("Scenario test error:", error);
      res.status(500).json({ error: "Scenario tests failed" });
    }
  });

  // --- Structural Scenarios Endpoint ---
  app.get("/api/scenarios", async (req: Request, res: Response) => {
    try {
      const scenarios = await cachedFetch("engine:scenarios", { ttlMs: SCENARIOS_CACHE_TTL_MS, staleTtlMs: 120_000 }, async () => {
        if (DEBUG_SCENARIOS) {
          console.log("Structural Scenario Engine responding");
        }

        const [terminalState, positioning, vacuumData] = await Promise.all([
          cachedFetch("terminal:state", { ttlMs: TERMINAL_STATE_CACHE_TTL_MS, staleTtlMs: 120_000 }, getTerminalState).catch(() => null),
          storage.getOptionsPositioning().catch(() => null),
          cachedFetch("engine:vacuum", { ttlMs: VACUUM_CACHE_TTL_MS, staleTtlMs: 120_000 }, async () => {
            const [orderBook, state, pos] = await Promise.all([
              getOrderBook(),
              cachedFetch("terminal:state", { ttlMs: TERMINAL_STATE_CACHE_TTL_MS, staleTtlMs: 120_000 }, getTerminalState),
              storage.getOptionsPositioning(),
            ]);
            if (!orderBook || !orderBook.bids.length || !orderBook.asks.length) {
              throw new Error("Insufficient orderbook data for vacuum analysis");
            }
            const bestBid = orderBook.bids[0]?.price || 0;
            const bestAsk = orderBook.asks[0]?.price || 0;
            const spotPrice = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : bestBid || bestAsk;
            if (!spotPrice) throw new Error("Unable to determine spot price");
            return liquidityVacuumEngine.analyze({
              spotPrice,
              bids: orderBook.bids.map(bid => ({ price: bid.price, size: bid.size })),
              asks: orderBook.asks.map(ask => ({ price: ask.price, size: ask.size })),
              nearestBookClusters: pos ? {
                above: [pos.callWall].filter(Boolean),
                below: [pos.putWall].filter(Boolean)
              } : undefined,
              spread: bestAsk - bestBid,
              liquiditySweepRisk: state?.market?.liquiditySweepDetector,
              dealerHedgingFlow: state?.market?.dealerHedgingFlow,
              volatility: state?.market?.distanceToFlip ? Math.abs(state.market.distanceToFlip) : undefined
            });
          }).catch(() => null),
        ]);

        const signals: TerminalSignals = {
          gammaRegime: terminalState?.market?.gammaRegime || "LONG",
          gammaFlip: terminalState?.market?.gammaFlip || undefined,
          gammaMagnets: terminalState?.levels?.gammaMagnets || [],
          callWall: positioning?.callWall || undefined,
          putWall: positioning?.putWall || undefined,
          pressure: (terminalState as any)?.positioning_engines?.liquidityHeatmap?.liquidityPressure || "BALANCED",
          vacuumRisk: vacuumData?.vacuumRisk || "LOW",
          vacuumType: vacuumData?.vacuumType || "NONE",
          vacuumDirection: vacuumData?.vacuumDirection || "NEUTRAL",
          vacuumProximity: vacuumData?.vacuumProximity || "FAR",
          thinLiquidity: vacuumData?.nearestThinLiquidityZone ? {
            price: vacuumData.nearestThinLiquidityZone,
            direction: vacuumData.nearestThinLiquidityDirection || "NONE"
          } : undefined
        };

        return scenarioEngine.generateScenarios(signals);
      });
      res.json(scenarios);
    } catch (error) {
      console.error("Scenario generation error:", error);
      // Safe fallback with consistent shape
      const fallbackScenarios = {
        marketRegime: "UNKNOWN",
        baseCase: { probability: 60, title: "Analysis Unavailable", summary: "Scenario engine temporarily unavailable", regime: "Unknown", trigger: "N/A", target: "N/A", bias: "NEUTRAL" as const },
        altCase: { probability: 25, title: "Analysis Unavailable", summary: "Scenario engine temporarily unavailable", regime: "Unknown", trigger: "N/A", target: "N/A", bias: "NEUTRAL" as const },
        volCase: { probability: 15, title: "Analysis Unavailable", summary: "Scenario engine temporarily unavailable", regime: "Unknown", trigger: "N/A", target: "N/A", bias: "NEUTRAL" as const }
      };
      res.status(500).json(fallbackScenarios);
    }
  });

  if (process.env.DATABASE_URL) {
    try {
      console.log("[SaaS] DATABASE_URL present, registering SaaS routes...");
      const { registerSaasRoutes } = await import("./routes/saasRoutes");
      registerSaasRoutes(app);
      console.log("[SaaS] SaaS routes registered successfully");
      const { startExpireSubscriptionsJob } = await import("./jobs/expireSubscriptions");
      startExpireSubscriptionsJob();
    } catch (e) {
      console.error("[SaaS] Failed to register SaaS routes:", e);
    }
  } else {
    console.error(
      "[SaaS] DATABASE_URL is not set. SaaS/auth is OFF: no DB connection. " +
        "Add DATABASE_URL to .env, run npm run db:push, then restart.",
    );
    const saasNotConfigured = (_req: Request, res: Response) => {
      res.status(503).json({
        error: "SAAS_NOT_CONFIGURED",
        message:
          "Set DATABASE_URL in .env, run npm run db:push, and restart the server.",
        saasDisabled: true,
      });
    };
    // GET: frontend needs JSON + saasDisabled (not HTML from Vite catch-all)
    app.get("/api/auth/me", (_req, res) => {
      res.set({
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      });
      res.json({ authenticated: false, user: null, access: null, saasDisabled: true });
    });
    app.get("/api/plans", (_req, res) => {
      res.json({ plans: [], saasDisabled: true });
    });
    // Mutations / protected reads: explicit 503 JSON (otherwise Vite returns index.html)
    app.post("/api/auth/login", saasNotConfigured);
    app.post("/api/auth/register", saasNotConfigured);
    app.post("/api/auth/logout", (_req, res) => res.json({ ok: true }));
    app.get("/api/auth/access", saasNotConfigured);
    app.post("/api/payments/report", saasNotConfigured);
    app.get("/api/admin/users", saasNotConfigured);
    app.patch("/api/admin/users/:id", saasNotConfigured);
    app.post("/api/admin/users/:id/approve-to-pay", saasNotConfigured);
    app.post("/api/admin/users/:id/activate-access", saasNotConfigured);
    app.post("/api/admin/users/:id/subscription", saasNotConfigured);
    app.post("/api/admin/users/:id/subscription/deactivate", saasNotConfigured);
    app.get("/api/live/readiness", saasNotConfigured);
    app.post("/api/live/order-preview", saasNotConfigured);
  }

  // --- Deribit Options Ticker Enrichment Endpoint ---
  app.post("/api/options/deribit/tickers", async (req: Request, res: Response) => {
    console.log("[TICKER_ENRICHMENT_FETCH] Request received");
    
    try {
      // Validate body
      const { instrumentNames } = req.body;
      
      if (!Array.isArray(instrumentNames)) {
        return res.status(400).json({ error: "instrumentNames must be an array" });
      }
      
      if (instrumentNames.length === 0) {
        return res.json({ generatedAt: Date.now(), tickers: {}, errors: [] });
      }
      
      if (instrumentNames.length > 60) {
        return res.status(400).json({ error: "Maximum 60 instruments per request" });
      }
      
      // Filter and validate instrument names
      const validInstruments = Array.from(new Set(instrumentNames)) // Remove duplicates
        .filter(name => typeof name === 'string' && name.length > 0)
        .filter(name => name.startsWith('BTC-') || name.startsWith('ETH-'))
        .slice(0, 60); // Safety limit
      
      if (validInstruments.length === 0) {
        return res.json({ generatedAt: Date.now(), tickers: {}, errors: [] });
      }
      
      console.log(`[TICKER_ENRICHMENT_FETCH] Processing ${validInstruments.length} instruments`);
      
      // Simple in-memory cache
      const CACHE_TTL_MS = 15000; // 15 seconds
      const tickerCache = new Map<string, { data: any; ts: number }>();
      
      const results: Record<string, any> = {};
      const errors: string[] = [];
      
      // Helper function to fetch single ticker with cache
      const fetchTickerWithCache = async (instrumentName: string): Promise<any> => {
        const cached = tickerCache.get(instrumentName);
        const now = Date.now();
        
        if (cached && (now - cached.ts) < CACHE_TTL_MS) {
          console.log(`[TICKER_ENRICHMENT_CACHE_HIT] ${instrumentName}`);
          return cached.data;
        }
        
        try {
          const response = await fetch(`https://www.deribit.com/api/v2/public/ticker?instrument_name=${encodeURIComponent(instrumentName)}`);
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          
          const data = await response.json();
          
          if (data.error) {
            throw new Error(data.error.message);
          }
          
          const ticker = data.result;
          
          // Cache the result
          tickerCache.set(instrumentName, { data: ticker, ts: now });
          
          return ticker;
        } catch (error) {
          console.error(`[TICKER_ENRICHMENT_ERROR] ${instrumentName}:`, error);
          throw error;
        }
      };
      
      // Helper function for defensive mapping
      const toFiniteNumberOrNull = (...values: unknown[]): number | null => {
        for (const value of values) {
          if (value == null || value === "") continue;
          const n = Number(value);
          if (Number.isFinite(n)) return n;
        }
        return null;
      };

      const mapTickerData = (ticker: any) => {
        const bestBidPrice = toFiniteNumberOrNull(ticker.best_bid_price, ticker.bid_price);
        const bestAskPrice = toFiniteNumberOrNull(ticker.best_ask_price, ticker.ask_price);
        const bestBidSize = toFiniteNumberOrNull(ticker.best_bid_amount, ticker.bid_amount, ticker.bid_size);
        const bestAskSize = toFiniteNumberOrNull(ticker.best_ask_amount, ticker.ask_amount, ticker.ask_size);

        return {
          instrumentName: ticker.instrument_name,
          delta: ticker.greeks?.delta ?? ticker.delta ?? null,
          gamma: ticker.greeks?.gamma ?? null,
          vega: ticker.greeks?.vega ?? null,
          theta: ticker.greeks?.theta ?? null,
          bidIv: ticker.bid_iv ?? null,
          askIv: ticker.ask_iv ?? null,
          markIv: ticker.mark_iv ?? null,
          bestBidPrice,
          bestAskPrice,
          bestBidSize,
          bestAskSize,
          bidPrice: bestBidPrice,
          askPrice: bestAskPrice,
          bidSize: bestBidSize,
          askSize: bestAskSize,
          markPrice: ticker.mark_price ?? null,
          underlyingPrice: ticker.underlying_price ?? ticker.index_price ?? null
        };
      };
      
      // Process with limited concurrency (batch of 5)
      const concurrency = 5;
      for (let i = 0; i < validInstruments.length; i += concurrency) {
        const batch = validInstruments.slice(i, i + concurrency);
        
        await Promise.allSettled(
          batch.map(async (instrumentName) => {
            try {
              const ticker = await fetchTickerWithCache(instrumentName);
              results[instrumentName] = mapTickerData(ticker);
            } catch (error) {
              errors.push(`${instrumentName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          })
        );
      }
      
      console.log(`[TICKER_ENRICHMENT_OK] ${Object.keys(results).length} successful, ${errors.length} errors`);
      
      res.json({
        generatedAt: Date.now(),
        tickers: results,
        errors
      });
      
    } catch (error) {
      console.error('[TICKER_ENRICHMENT_ERROR] Unexpected error:', error);
      res.status(500).json({
        error: "Internal server error",
        generatedAt: Date.now(),
        tickers: {},
        errors: ["Internal server error"]
      });
    }
  });

  app.get("/api/options/deribit/top-of-book", (req: Request, res: Response) => {
    const instrumentNames = parseInstrumentListParam(req.query.instruments);
    if (instrumentNames.length > 0) {
      ensureDeribitOptionsTopOfBookStream(instrumentNames);
    }

    res.json(buildTopOfBookPayload(instrumentNames));
  });

  app.get("/api/options/deribit/top-of-book/stream", (req: Request, res: Response) => {
    const instrumentNames = parseInstrumentListParam(req.query.instruments).slice(
      0,
      OPTIONS_TOP_OF_BOOK_SSE_MAX_INSTRUMENTS
    );

    if (instrumentNames.length > 0) {
      ensureDeribitOptionsTopOfBookStream(instrumentNames);
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    let closed = false;
    let lastFingerprint = "";

    const writeEvent = (event: string, data: unknown) => {
      if (closed || res.destroyed) return;
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const writeSnapshot = (force = false) => {
      const payload = buildTopOfBookPayload(instrumentNames);
      const items = payload.items;
      const fingerprint = Object.keys(items)
        .sort()
        .map((instrumentName) => {
          const item = items[instrumentName] as { updatedAt?: number };
          return `${instrumentName}:${item.updatedAt ?? 0}`;
        })
        .join("|");

      if (!force && fingerprint === lastFingerprint) return;
      lastFingerprint = fingerprint;
      writeEvent("top_of_book", payload);
    };

    writeSnapshot(true);

    const updateTimer = setInterval(
      () => writeSnapshot(false),
      OPTIONS_TOP_OF_BOOK_SSE_MIN_INTERVAL_MS
    );
    const heartbeatTimer = setInterval(() => {
      if (!closed && !res.destroyed) {
        res.write(`: heartbeat ${Date.now()}\n\n`);
      }
    }, OPTIONS_TOP_OF_BOOK_SSE_HEARTBEAT_MS);

    req.on("close", () => {
      closed = true;
      clearInterval(updateTimer);
      clearInterval(heartbeatTimer);
    });
  });

  // --- Deribit Options Book Endpoint ---
  app.get("/api/options/deribit/book", async (req, res) => {
    console.log("BOOK_ENDPOINT_VERSION_V4");
    console.log("SERVER_TIME", new Date().toISOString());
    console.log("[DERIBIT_OPTIONS_BOOK_FETCH] Request received");
    try {
      const currency = (req.query.currency as string)?.toUpperCase() || "BTC";
      const expiry = req.query.expiry as string | undefined;

      console.log("[DERIBIT_OPTIONS_DEBUG] incoming query", { currency, expiry });

      if (!["BTC", "ETH"].includes(currency)) {
        return res.status(400).json({
          error: "INVALID_CURRENCY",
          details: "Currency must be BTC or ETH"
        });
      }

      // Fetch instruments and book summary from Deribit API
      const [instrumentsResponse, summaryResponse] = await Promise.all([
        fetch(`https://www.deribit.com/api/v2/public/get_instruments?currency=${currency}&kind=option&expired=false`),
        fetch(`https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=${currency}&kind=option`)
      ]);

      if (!instrumentsResponse.ok || !summaryResponse.ok) {
        throw new Error("Failed to fetch data from Deribit API");
      }

      const [instrumentsData, summaryData] = await Promise.all([
        instrumentsResponse.json(),
        summaryResponse.json()
      ]);

      if (instrumentsData.error || summaryData.error) {
        throw new Error(instrumentsData.error?.message || summaryData.error?.message || "Deribit API error");
      }

      const instruments = instrumentsData.result || [];
      const summaries = summaryData.result || [];

      console.log("[DERIBIT_OPTIONS_DEBUG] instruments count", instruments.length);
      console.log("[DERIBIT_OPTIONS_DEBUG] summaries count", summaries.length);

      // Get underlying price from Deribit index price API
      let underlyingPrice = null;
      try {
        const indexName = currency === "BTC" ? "btc_usd" : "eth_usd";
        console.log("[OPTIONS_UNDERLYING_DEBUG] fetching Deribit index price for", indexName);
        
        const indexResponse = await fetch(`https://www.deribit.com/api/v2/public/get_index_price?index_name=${indexName}`);
        const indexData = await indexResponse.json();
        
        if (indexData?.result?.index_price && Number.isFinite(indexData.result.index_price)) {
          underlyingPrice = indexData.result.index_price;
          console.log("[OPTIONS_UNDERLYING_DEBUG] Deribit index price found:", underlyingPrice);
        } else {
          console.log("[OPTIONS_UNDERLYING_DEBUG] Deribit index price response invalid:", indexData);
        }
      } catch (error) {
        console.log("[OPTIONS_UNDERLYING_DEBUG] Deribit index price API failed:", error);
      }

      // Helper function to normalize expiry formats
      const normalizeExpiry = (input: string | undefined | null): string | null => {
        if (!input) return null;
        
        // If already in Deribit format (DDMMMYY), return as-is
        const deribitMatch = input.toUpperCase().match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);
        if (deribitMatch) {
          const [, day, month, year] = deribitMatch;
          return `${day.padStart(2, "0")}${month}${year}`;
        }
        
        // Convert YYYYMMDD format (20260428 -> 28APR26)
        if (/^\d{8}$/.test(input)) {
          const year = input.slice(2, 4);
          const monthMap: { [key: string]: string } = {
            '01': 'JAN', '02': 'FEB', '03': 'MAR', '04': 'APR',
            '05': 'MAY', '06': 'JUN', '07': 'JUL', '08': 'AUG',
            '09': 'SEP', '10': 'OCT', '11': 'NOV', '12': 'DEC'
          };
          const month = monthMap[input.slice(4, 6)];
          const day = input.slice(6, 8);
          return month ? `${day}${month}${year}` : null;
        }
        
        return null;
      };

      const expiryCompareKey = (input: string | null | undefined): string | null => {
        const normalized = normalizeExpiry(input);
        if (!normalized) return null;
        const match = normalized.match(/^0?(\d{1,2})([A-Z]{3})(\d{2})$/);
        return match ? `${Number(match[1])}${match[2]}${match[3]}` : normalized;
      };

      // Extract unique expiries from instruments in Deribit canonical format
      const expirySet = new Set<string>();
      instruments.forEach((i: any) => {
        const timestamp = i.expiration_timestamp;
        if (timestamp) {
          const date = new Date(timestamp);
          const day = date.getDate().toString().padStart(2, '0');
          const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
          const month = monthNames[date.getMonth()];
          const year = date.getFullYear().toString().slice(2);
          const expiryDeribit = `${day}${month}${year}`;
          expirySet.add(expiryDeribit);
        }
      });
      
      const expiries = Array.from(expirySet).sort((a, b) => {
        // Sort by actual date, not alphabetically
        const dateA = new Date(
          2000 + parseInt(a.slice(4)), // year
          ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].indexOf(a.slice(2, 5)), // month
          parseInt(a.slice(0, 2)) // day
        );
        const dateB = new Date(
          2000 + parseInt(b.slice(4)),
          ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].indexOf(b.slice(2, 5)),
          parseInt(b.slice(0, 2))
        );
        return dateA.getTime() - dateB.getTime();
      });

      console.log("[DERIBIT_OPTIONS_DEBUG] available expiries", expiries);
      
      const normalizedRequestedExpiry = normalizeExpiry(expiry);
      console.log("[DERIBIT_OPTIONS_DEBUG] normalized requested expiry", { 
        original: expiry, 
        normalized: normalizedRequestedExpiry 
      });

      // Filter by selected expiry or use closest active expiry
      let selectedExpiry = normalizedRequestedExpiry;
      if (!selectedExpiry && expiries.length > 0) {
        selectedExpiry = expiries[0];
      }
      const selectedExpiryKey = expiryCompareKey(selectedExpiry);
      
      console.log("[DERIBIT_OPTIONS_DEBUG] selected expiry", selectedExpiry);

      // Parse instrument names and group by strike
      const strikeMap = new Map<number, { call?: any, put?: any }>();
      const toFiniteNumberOrNull = (...values: unknown[]): number | null => {
        for (const value of values) {
          if (value == null || value === "") continue;
          const n = Number(value);
          if (Number.isFinite(n)) return n;
        }
        return null;
      };
      
      instruments.forEach((instrument: any) => {
        const match = instrument.instrument_name.match(/^(BTC|ETH)-(\d{1,2}[A-Z]{3}\d{2})-(\d+)-([CP])$/);
        if (match) {
          const [, , instrumentExpiry, strikeStr, optionType] = match;
          const instrumentExpiryKey = expiryCompareKey(instrumentExpiry);
          const strike = parseInt(strikeStr);

          // Filter by selected expiry before creating strike rows; otherwise
          // strikes from other expiries become empty rows for the selected book.
          if (selectedExpiryKey && instrumentExpiryKey !== selectedExpiryKey) {
            return;
          }
          
          if (!strikeMap.has(strike)) {
            strikeMap.set(strike, {});
          }
          
          const summary = summaries.find((s: any) => s.instrument_name === instrument.instrument_name);
          const bestBidPrice = toFiniteNumberOrNull(summary?.best_bid_price, summary?.bid_price);
          const bestAskPrice = toFiniteNumberOrNull(summary?.best_ask_price, summary?.ask_price);
          const bestBidSize = toFiniteNumberOrNull(
            summary?.best_bid_amount,
            summary?.bid_amount,
            summary?.bid_size
          );
          const bestAskSize = toFiniteNumberOrNull(
            summary?.best_ask_amount,
            summary?.ask_amount,
            summary?.ask_size
          );
          const optionData = {
            instrumentName: instrument.instrument_name,
            expiry: instrumentExpiry,
            strike: strikeStr,
            type: optionType,
            matchesSelectedExpiry: instrumentExpiryKey === selectedExpiryKey,
            openInterest: summary?.open_interest || null,
            delta: summary?.delta || null,
            bidIv: summary?.bid_iv || null,
            askIv: summary?.ask_iv || null,
            bidPrice: bestBidPrice,
            askPrice: bestAskPrice,
            bidSize: bestBidSize,
            askSize: bestAskSize,
            bestBidPrice,
            bestAskPrice,
            bestBidSize,
            bestAskSize,
            markPrice: summary?.mark_price || null,
            volume24h: summary?.volume_usd || null,
            priceChange24h: summary?.price_change_24h || null
          };
          
          if (optionType === 'C') {
            strikeMap.get(strike)!.call = optionData;
          } else if (optionType === 'P') {
            strikeMap.get(strike)!.put = optionData;
          }
        }
      });

      console.log("EXPIRY_TRACE", {
        requestExpiry: expiry ?? null,
        normalizedRequestedExpiry,
        selectedExpiry,
        selectedExpiryKey,
        sampleInstrumentExpiries: instruments
          .slice(0, 20)
          .map((instrument: any) => {
            const match = instrument.instrument_name?.match(/^(BTC|ETH)-(\d{1,2}[A-Z]{3}\d{2})-(\d+)-([CP])$/);
            return match ? {
              instrumentName: instrument.instrument_name,
              instrumentExpiry: match[2],
              instrumentExpiryKey: expiryCompareKey(match[2]),
              matchesSelectedExpiry: expiryCompareKey(match[2]) === selectedExpiryKey,
            } : null;
          })
          .filter(Boolean),
      });

      // Convert to sorted array
      const rows = Array.from(strikeMap.entries())
        .map(([strike, data]) => ({
          strike,
          call: data.call || null,
          put: data.put || null
        }))
        .sort((a, b) => a.strike - b.strike);

      const prioritizedInstrumentNames = rows
        .flatMap((row) => [
          row.call ? { instrumentName: row.call.instrumentName, strike: row.strike } : null,
          row.put ? { instrumentName: row.put.instrumentName, strike: row.strike } : null,
        ])
        .filter((item): item is { instrumentName: string; strike: number } => !!item?.instrumentName)
        .sort((a, b) => {
          const spot = Number(underlyingPrice);
          if (!Number.isFinite(spot) || spot <= 0) return a.strike - b.strike;
          return Math.abs(a.strike - spot) - Math.abs(b.strike - spot);
        })
        .map((item) => item.instrumentName)
        .slice(0, DERIBIT_OPTIONS_WS_MAX_INSTRUMENTS);

      ensureDeribitOptionsTopOfBookStream(prioritizedInstrumentNames);

      for (const row of rows) {
        for (const side of [row.call, row.put]) {
          if (!side?.instrumentName) continue;
          const wsLiquidity = getDeribitOptionsTopOfBook(side.instrumentName);
          if (wsLiquidity) {
            side.bestBidPrice = wsLiquidity.bestBidPrice;
            side.bestAskPrice = wsLiquidity.bestAskPrice;
            side.bestBidSize = wsLiquidity.bestBidSize;
            side.bestAskSize = wsLiquidity.bestAskSize;
            side.bidPrice = wsLiquidity.bestBidPrice;
            side.askPrice = wsLiquidity.bestAskPrice;
            side.bidSize = wsLiquidity.bestBidSize;
            side.askSize = wsLiquidity.bestAskSize;
            side.deribitReceivedAt = wsLiquidity.deribitReceivedAt;
            side.cacheUpdatedAt = wsLiquidity.cacheUpdatedAt;
            side.liquidityUpdatedAt = wsLiquidity.updatedAt;
            side.liquiditySource = "ws";
            side.bidSizeStats1s = wsLiquidity.bidSizeStats1s;
            side.askSizeStats1s = wsLiquidity.askSizeStats1s;
          } else {
            const hasRestLiquidity =
              side.bestBidPrice != null ||
              side.bestAskPrice != null ||
              side.bestBidSize != null ||
              side.bestAskSize != null;
            side.liquidityUpdatedAt = hasRestLiquidity ? Date.now() : null;
            side.liquiditySource = hasRestLiquidity ? "rest" : "missing";
            side.deribitReceivedAt = null;
            side.cacheUpdatedAt = null;
            side.bidSizeStats1s = undefined;
            side.askSizeStats1s = undefined;
          }
        }
      }

      console.log("BOOK_ROWS_TOTAL", rows.length);
      console.log("ROWS_WITH_CALL_DATA", rows.filter(r => r.call).length);
      console.log("ROWS_WITH_PUT_DATA", rows.filter(r => r.put).length);
      console.log("[DERIBIT_OPTIONS_DEBUG] rows count", rows.length);
      const atmDebugRow = rows.length && underlyingPrice
        ? rows.reduce((closest, row) => {
            return Math.abs(row.strike - underlyingPrice!) < Math.abs(closest.strike - underlyingPrice!)
              ? row
              : closest;
          }, rows[0])
        : rows[0] ?? null;
      console.log("ATM_ROW_BACKEND", JSON.stringify(atmDebugRow ? {
        strike: atmDebugRow.strike,
        call: atmDebugRow.call ? {
          openInterest: atmDebugRow.call.openInterest,
          bidPrice: atmDebugRow.call.bidPrice,
          askPrice: atmDebugRow.call.askPrice,
          bestBidPrice: atmDebugRow.call.bestBidPrice,
          bestAskPrice: atmDebugRow.call.bestAskPrice,
          bestBidSize: atmDebugRow.call.bestBidSize,
          bestAskSize: atmDebugRow.call.bestAskSize,
        } : null,
        put: atmDebugRow.put ? {
          openInterest: atmDebugRow.put.openInterest,
          bidPrice: atmDebugRow.put.bidPrice,
          askPrice: atmDebugRow.put.askPrice,
          bestBidPrice: atmDebugRow.put.bestBidPrice,
          bestAskPrice: atmDebugRow.put.bestAskPrice,
          bestBidSize: atmDebugRow.put.bestBidSize,
          bestAskSize: atmDebugRow.put.bestAskSize,
        } : null,
      } : null, null, 2));
      console.log("[DERIBIT_OPTIONS_DEBUG] atm row shape", atmDebugRow ? {
        strike: atmDebugRow.strike,
        call: atmDebugRow.call ? {
          bidPrice: atmDebugRow.call.bidPrice,
          askPrice: atmDebugRow.call.askPrice,
          openInterest: atmDebugRow.call.openInterest,
          bestBidSize: atmDebugRow.call.bestBidSize,
          bidSize: atmDebugRow.call.bidSize,
          bestAskSize: atmDebugRow.call.bestAskSize,
          askSize: atmDebugRow.call.askSize,
        } : null,
        put: atmDebugRow.put ? {
          bidPrice: atmDebugRow.put.bidPrice,
          askPrice: atmDebugRow.put.askPrice,
          openInterest: atmDebugRow.put.openInterest,
          bestBidSize: atmDebugRow.put.bestBidSize,
          bidSize: atmDebugRow.put.bidSize,
          bestAskSize: atmDebugRow.put.bestAskSize,
          askSize: atmDebugRow.put.askSize,
        } : null,
      } : null);
      console.log("[DERIBIT_OPTIONS_DEBUG] sample rows", rows.slice(0, 3).map(row => ({
        strike: row.strike,
        hasCall: !!row.call,
        hasPut: !!row.put,
        callOI: row.call?.openInterest,
        putOI: row.put?.openInterest
      })));

      console.log("[OPTIONS_UNDERLYING_DEBUG] final underlyingPrice:", underlyingPrice);

      const response = {
        debugVersion: "BOOK_V4",
        currency: currency as "BTC" | "ETH",
        underlyingPrice,
        selectedExpiry: selectedExpiry || null,
        expiries,
        rows,
        generatedAt: Date.now()
      };

      console.log("[DERIBIT_OPTIONS_DEBUG] response summary", {
        currency,
        expiryCount: expiries.length,
        rowCount: rows.length,
        selectedExpiry,
        underlyingPrice
      });

      res.json(response);
    } catch (error: any) {
      console.error("[DERIBIT_OPTIONS_BOOK_ERROR]", error);
      res.status(500).json({
        error: "DERIBIT_BOOK_ERROR",
        details: error.message
      });
    }
  });

  const { registerExchangeRoutes } = await import("./routes/exchanges.routes");
  const { registerExecutionRoutes } = await import("./routes/execution.routes");
  const { registerBrokerRoutes } = await import("./routes/broker.routes");
  const { registerBingxApiRoutes } = await import("./routes/bingxApi.routes");
  const { registerSystemRoutes } = await import("./routes/system.routes");
  const { registerLiveRoutes } = await import("./routes/live.routes");
  const { registerRiskMirrorRoutes } = await import("./routes/riskMirror.routes");
  const { paperTradingRouter } = await import("./routes/paperTrading.routes");
  const { reportsRouter } = await import("./routes/reports.routes");
  registerExchangeRoutes(app);
  registerExecutionRoutes(app);
  registerBrokerRoutes(app);
  registerBingxApiRoutes(app);
  console.log("[routes] bingx read-only registered");
  registerSystemRoutes(app);
  registerLiveRoutes(app);
  console.log("[routes] system registered");
  console.log("[routes] live readiness registered");
  registerRiskMirrorRoutes(app);
  console.log("[routes] risk mirror registered");
  app.use("/api/paper", paperTradingRouter);
  app.use("/api/reports", reportsRouter);

  return httpServer;
}
