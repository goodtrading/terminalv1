/**
 * Dual-market aggTrade buffers — spot (legacy) + Binance USDT-M perp.
 * Spot: stream.binance.com / api v3
 * Perp: fstream.binance.com / fapi v1
 */

import WebSocket from "ws";
import type { BookmapMarketSource } from "@shared/bookmapMarket";
import { DEFAULT_BOOKMAP_MARKET, parseBookmapMarket } from "@shared/bookmapMarket";
import { getSpotAggTradeWsBase, getSpotAggTradesRestUrls } from "./binanceSpotMarketData";
import { isHeatmapEnabled } from "../lib/runtimeEnv";

export type BufferedAggTrade = {
  id: string;
  price: number;
  qty: number;
  time: number;
  side: "buy" | "sell";
};

type BufferConfig = {
  market: BookmapMarketSource;
  streamSymbol: string;
  wsBase: string;
  wsPath: string;
  restAggTradesUrls: string[];
  logTag: string;
};

const RETENTION_MS = 90 * 60 * 1000;
const COMPACT_AFTER_DROPPED = 40_000;
const SEED_REST_LIMIT = 1000;
const MAX_BUFFER_RETURN = 120_000;
const DEBUG = process.env.NODE_ENV === "development";
const HEATMAP_ENABLED = isHeatmapEnabled();
const TRADE_STALE_MS = 3_000;
const TRADE_HEALTH_MS = 2_000;
/** Perp WS considered silent if no raw message in this window. */
const WS_SILENT_RECOVER_MS = 10_000;
/** Narrow REST gap-fill window when buffer newest is already live. */
const REST_TAIL_WINDOW_MS = 60_000;
/** Target historical coverage for boot/backfill (matches client TRADE_BUFFER_MS ~7.5m). */
const HISTORICAL_BACKFILL_MS = 452_000;
/** Max REST pages when paging backward from latest trades. */
const HISTORICAL_BACKFILL_MAX_PAGES = 12;

type RestSeedMode = "historical" | "tail" | "gap-fill";
/** Do not terminate a socket still in CONNECTING until this grace elapses. */
const WS_CONNECT_GRACE_MS = 10_000;
/** Minimum spacing between explicit reconnect attempts. */
const RECONNECT_MIN_INTERVAL_MS = 5_000;

let perpSseClients = 0;
let spotSseClients = 0;

function createAggTradeBuffer(config: BufferConfig) {
  const { market, streamSymbol, wsBase, wsPath, restAggTradesUrls, logTag } = config;
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  let reconnectScheduled = false;
  let connectingStartedAt = 0;
  let lastConnectAttemptAt = 0;
  let connected = false;
  /** Wall-clock time of last raw WS frame only (not REST). */
  let lastWsMessageAt = 0;
  /** Wall-clock time of last accepted trade push (WS or REST). */
  let lastAcceptedTradeAt = 0;
  let lastTrade: BufferedAggTrade | null = null;
  let healthTimer: ReturnType<typeof setInterval> | null = null;
  let lastError: string | null = null;
  let lastRestSeedTs = 0;
  let lastRestSeedFetchedCount = 0;
  let lastRestSeedAcceptedCount = 0;
  let lastRestSeedMode: RestSeedMode | null = null;
  const listeners = new Set<(trade: BufferedAggTrade) => void>();
  const wsUrl = `${wsBase}${wsPath}`;
  const backing: BufferedAggTrade[] = [];
  let start = 0;

  type PushSource = "ws" | "rest";

  const pushTrace = {
    rawMessageCount: 0,
    parsedTradeCount: 0,
    parseErrorCount: 0,
    lastRawEventTime: null as number | null,
    lastRawTradeTime: null as number | null,
    lastRawAggId: null as string | null,
    lastParsedTradeTs: null as number | null,
    acceptedPushCount: 0,
    duplicateDropCount: 0,
    staleDropCount: 0,
    invalidDropCount: 0,
    restSeedFetchedCount: 0,
    restSeedAcceptedCount: 0,
    restSeedLatestTradeTs: null as number | null,
    lastBufferNewestBefore: null as number | null,
    lastBufferNewestAfter: null as number | null,
    lastPushSource: null as PushSource | null,
  };

  function bufferNewestTs(): number | null {
    trimByRetention();
    const end = backing.length;
    if (start >= end) return null;
    return backing[end - 1]!.time;
  }

  function bufferOldestTs(): number | null {
    trimByRetention();
    const end = backing.length;
    if (start >= end) return null;
    return backing[start]!.time;
  }

  function bufferCoverageMs(): number {
    const oldest = bufferOldestTs();
    const newest = bufferNewestTs();
    if (oldest == null || newest == null) return 0;
    return Math.max(0, newest - oldest);
  }

  function log(msg: string): void {
    if (DEBUG) console.log(`[${logTag}] ${msg}`);
  }

  function trimByRetention(): void {
    const cutoff = Date.now() - RETENTION_MS;
    while (start < backing.length && backing[start]!.time < cutoff) {
      start++;
    }
    if (start >= COMPACT_AFTER_DROPPED) {
      backing.splice(0, start);
      start = 0;
    }
  }

  function lowerBound(from: number, to: number, timeMs: number): number {
    let lo = from;
    let hi = to;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (backing[mid]!.time < timeMs) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function upperBound(from: number, to: number, timeMs: number): number {
    let lo = from;
    let hi = to;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (backing[mid]!.time <= timeMs) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function pushTrade(t: BufferedAggTrade, source: PushSource = "ws"): boolean {
    if (
      !Number.isFinite(t.price) ||
      !Number.isFinite(t.qty) ||
      !Number.isFinite(t.time) ||
      t.qty <= 0
    ) {
      pushTrace.invalidDropCount++;
      return false;
    }

    const newestBefore = bufferNewestTs();
    pushTrace.lastBufferNewestBefore = newestBefore;
    pushTrace.lastPushSource = source;

    trimByRetention();
    const scanFrom = Math.max(start, backing.length - 80);
    for (let i = scanFrom; i < backing.length; i++) {
      if (backing[i]!.id === t.id) {
        pushTrace.duplicateDropCount++;
        pushTrace.lastBufferNewestAfter = bufferNewestTs();
        return false;
      }
    }
    const last = backing[backing.length - 1];
    if (last && t.time < last.time) {
      const idx = lowerBound(start, backing.length, t.time);
      if (backing[idx]?.id === t.id) {
        pushTrace.duplicateDropCount++;
        pushTrace.lastBufferNewestAfter = bufferNewestTs();
        return false;
      }
      backing.splice(idx, 0, t);
      lastAcceptedTradeAt = Date.now();
      lastTrade = backing[backing.length - 1]!;
      pushTrace.acceptedPushCount++;
      pushTrace.lastParsedTradeTs = t.time;
      pushTrace.lastBufferNewestAfter = bufferNewestTs();
      for (const fn of listeners) fn(t);
      return true;
    }
    backing.push(t);
    lastAcceptedTradeAt = Date.now();
    lastTrade = t;
    pushTrace.acceptedPushCount++;
    pushTrace.lastParsedTradeTs = t.time;
    pushTrace.lastBufferNewestAfter = bufferNewestTs();
    for (const fn of listeners) fn(t);
    return true;
  }

  function bufferNewestAgeMs(): number {
    const newest = bufferNewestTs();
    return newest != null ? Date.now() - newest : Infinity;
  }

  function wsSilentAgeMs(): number {
    return lastWsMessageAt > 0 ? Date.now() - lastWsMessageAt : Infinity;
  }

  function logTradesHealth(reason?: string): void {
    if (!DEBUG && process.env.NODE_ENV !== "production") return;
    const newest = bufferNewestTs();
    console.debug("[AGG_TRADES_HEALTH]", {
      market,
      reason,
      connected,
      bufferNewestTs: newest,
      bufferNewestAgeMs: newest != null ? Date.now() - newest : null,
      lastWsMessageAt: lastWsMessageAt || null,
      lastWsMessageAgeMs: lastWsMessageAt > 0 ? Date.now() - lastWsMessageAt : null,
      lastAcceptedTradeAt: lastAcceptedTradeAt || null,
      latestTradeTs: newest ?? lastTrade?.time ?? null,
      tradesInBuffer: Math.max(0, backing.length - start),
      bufferKey: aggTradeBufferKey(streamSymbol, market),
      reconnectCount: reconnectAttempt,
      sseClients: market === "perp" ? perpSseClients : spotSseClients,
      lastTradePrice: lastTrade?.price ?? null,
      lastTradeSize: lastTrade?.qty ?? null,
      lastTradeSide: lastTrade?.side ?? null,
      lastError,
      lastRestSeedTs: lastRestSeedTs || null,
    });
  }

  function safeTerminate(socket: WebSocket): void {
    try {
      socket.removeAllListeners("message");
      socket.removeAllListeners("open");
      socket.removeAllListeners("close");
      socket.removeAllListeners("error");
      socket.on("error", () => {});
      socket.terminate();
    } catch (err) {
      log(
        `safeTerminate non-fatal: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  function safeReconnectAllowed(): boolean {
    if (reconnectScheduled) return false;
    const now = Date.now();
    if (now - lastConnectAttemptAt < RECONNECT_MIN_INTERVAL_MS) return false;
    if (!ws) return true;
    if (ws.readyState === WebSocket.CONNECTING) {
      return now - connectingStartedAt >= WS_CONNECT_GRACE_MS;
    }
    return true;
  }

  function forceReconnectWs(): void {
    const now = Date.now();

    if (reconnectScheduled) {
      log("skip reconnect: reconnect already scheduled");
      return;
    }
    if (now - lastConnectAttemptAt < RECONNECT_MIN_INTERVAL_MS) {
      log("skip reconnect: min interval not elapsed");
      return;
    }

    if (reconnectTimer != null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
      reconnectScheduled = false;
    }

    if (!ws) {
      reconnectAttempt++;
      connect();
      return;
    }

    const state = ws.readyState;
    if (state === WebSocket.CONNECTING) {
      if (now - connectingStartedAt < WS_CONNECT_GRACE_MS) {
        log("skip reconnect: socket still connecting");
        return;
      }
      safeTerminate(ws);
      ws = null;
      connected = false;
      reconnectAttempt++;
      connect();
      return;
    }

    if (state === WebSocket.OPEN) {
      safeTerminate(ws);
      ws = null;
      connected = false;
      reconnectAttempt++;
      connect();
      return;
    }

    ws = null;
    connected = false;
    reconnectAttempt++;
    connect();
  }

  function runTradeHealthCheck(): void {
    const newestAgeMs = bufferNewestAgeMs();
    const isEmpty = backing.length <= start;

    if (isEmpty) {
      logTradesHealth("empty");
      void seedFromRest();
      if (ws?.readyState !== WebSocket.OPEN && ws?.readyState !== WebSocket.CONNECTING) {
        connect();
      }
      return;
    }

    if (newestAgeMs > TRADE_STALE_MS) {
      logTradesHealth("buffer-newest-stale");
      void seedFromRest();
      if (market === "perp") {
        if (safeReconnectAllowed()) forceReconnectWs();
      } else if (
        ws?.readyState !== WebSocket.OPEN &&
        ws?.readyState !== WebSocket.CONNECTING
      ) {
        connect();
      }
      return;
    }

    if (market === "perp" && wsSilentAgeMs() > WS_SILENT_RECOVER_MS) {
      logTradesHealth("perp-ws-silent");
      void seedFromRest();
      if (safeReconnectAllowed()) forceReconnectWs();
    }
  }

  function parseAggTradePayload(raw: string): BufferedAggTrade | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      pushTrace.parseErrorCount++;
      return null;
    }
    if (!parsed || typeof parsed !== "object") {
      pushTrace.parseErrorCount++;
      return null;
    }
    const root = parsed as Record<string, unknown>;
    const row = (root.data && typeof root.data === "object" ? root.data : root) as Record<
      string,
      unknown
    >;
    if (row.e !== "aggTrade") {
      pushTrace.parseErrorCount++;
      return null;
    }
    const eventTime = Number(row.E);
    if (Number.isFinite(eventTime)) pushTrace.lastRawEventTime = eventTime;
    const p = parseFloat(String(row.p));
    const q = parseFloat(String(row.q));
    const time = Number(row.T);
    if (!Number.isFinite(p) || !Number.isFinite(q) || !Number.isFinite(time) || q <= 0) {
      pushTrace.parseErrorCount++;
      return null;
    }
    pushTrace.lastRawTradeTime = time;
    pushTrace.lastRawAggId = row.a != null ? String(row.a) : null;
    pushTrace.parsedTradeCount++;
    return {
      id: String(row.a),
      price: p,
      qty: q,
      time,
      side: row.m === true ? "sell" : "buy",
    };
  }

  function parseRestAggRow(row: unknown): BufferedAggTrade | null {
    if (!row || typeof row !== "object") return null;
    const r = row as Record<string, unknown>;
    const price = parseFloat(String(r.p));
    const qty = parseFloat(String(r.q));
    const time = Number(r.T);
    if (!Number.isFinite(price) || !Number.isFinite(qty) || !Number.isFinite(time) || qty <= 0) {
      return null;
    }
    return {
      id: String(r.a),
      price,
      qty,
      time,
      side: r.m === true ? "sell" : "buy",
    };
  }

  async function fetchRestAggTrades(
    params: URLSearchParams,
  ): Promise<{ rows: unknown[]; provider: string | null; error: string | null }> {
    let lastSeedError: string | null = null;
    for (const restAggTradesUrl of restAggTradesUrls) {
      try {
        const res = await fetch(`${restAggTradesUrl}?${params}`);
        if (!res.ok) {
          lastSeedError = `${restAggTradesUrl} status ${res.status}`;
          continue;
        }
        const data = await res.json();
        if (!Array.isArray(data)) {
          lastSeedError = `${restAggTradesUrl} non-array response`;
          continue;
        }
        return { rows: data, provider: restAggTradesUrl, error: null };
      } catch (error) {
        lastSeedError =
          error instanceof Error
            ? `${restAggTradesUrl} ${error.message}`
            : `${restAggTradesUrl} ${String(error)}`;
      }
    }
    return { rows: [], provider: null, error: lastSeedError };
  }

  function ingestRestRows(rows: unknown[]): {
    accepted: number;
    fetched: number;
    minT: number | null;
    maxT: number | null;
  } {
    const seen = new Set<string>();
    for (let i = start; i < backing.length; i++) seen.add(backing[i]!.id);
    let seedMinT: number | null = null;
    let seedMaxT: number | null = null;
    let seedAccepted = 0;
    for (const row of rows) {
      const t = parseRestAggRow(row);
      if (!t) continue;
      if (seedMinT == null || t.time < seedMinT) seedMinT = t.time;
      if (seedMaxT == null || t.time > seedMaxT) seedMaxT = t.time;
      if (!seen.has(t.id)) {
        seen.add(t.id);
        if (pushTrade(t, "rest")) seedAccepted++;
      } else {
        pushTrace.duplicateDropCount++;
      }
    }
    return { accepted: seedAccepted, fetched: rows.length, minT: seedMinT, maxT: seedMaxT };
  }

  function recordRestSeedResult(
    mode: RestSeedMode,
    fetched: number,
    accepted: number,
    maxT: number | null,
    provider: string | null,
  ): void {
    const end = Date.now();
    pushTrace.restSeedFetchedCount += fetched;
    pushTrace.restSeedAcceptedCount += accepted;
    if (maxT != null) {
      pushTrace.restSeedLatestTradeTs =
        pushTrace.restSeedLatestTradeTs == null
          ? maxT
          : Math.max(pushTrace.restSeedLatestTradeTs, maxT);
    }
    lastError = null;
    lastRestSeedTs = Date.now();
    lastRestSeedFetchedCount = fetched;
    lastRestSeedAcceptedCount = accepted;
    lastRestSeedMode = mode;
    const seedLatestAgeMs =
      maxT != null ? Math.max(0, end - maxT) : null;
    if (seedLatestAgeMs != null && seedLatestAgeMs > TRADE_STALE_MS) {
      console.warn(`[${logTag}] REST ${mode} still stale after fetch`, {
        fetched,
        accepted,
        seedMaxT: maxT,
        seedLatestAgeMs,
        coverageMs: bufferCoverageMs(),
        url: provider,
      });
    }
    log(
      `Seeded ${accepted}/${fetched} rows from REST${provider ? ` (${provider})` : ""} [${mode}]` +
        ` coverageMs=${bufferCoverageMs()}`,
    );
  }

  async function liveTailSeed(): Promise<void> {
    const params = new URLSearchParams({
      symbol: streamSymbol,
      limit: String(SEED_REST_LIMIT),
    });
    const { rows, provider, error } = await fetchRestAggTrades(params);
    if (error && rows.length === 0) {
      lastError = error;
      return;
    }
    const { accepted, fetched, maxT } = ingestRestRows(rows);
    recordRestSeedResult("tail", fetched, accepted, maxT, provider);
  }

  async function gapFillSeed(): Promise<void> {
    const end = Date.now();
    const newest = bufferNewestTs();
    if (newest == null) {
      await liveTailSeed();
      return;
    }
    const startMs = Math.max(end - REST_TAIL_WINDOW_MS, newest - 1);
    const params = new URLSearchParams({
      symbol: streamSymbol,
      limit: String(SEED_REST_LIMIT),
      startTime: String(startMs),
      endTime: String(end),
    });
    const { rows, provider, error } = await fetchRestAggTrades(params);
    if (error && rows.length === 0) {
      lastError = error;
      return;
    }
    const { accepted, fetched, maxT } = ingestRestRows(rows);
    recordRestSeedResult("gap-fill", fetched, accepted, maxT, provider);
  }

  async function historicalBackfillSeed(): Promise<void> {
    const end = Date.now();
    let totalFetched = 0;
    let totalAccepted = 0;
    let seedMaxT: number | null = null;
    let provider: string | null = null;
    let pageEnd: number | undefined;

    for (let page = 0; page < HISTORICAL_BACKFILL_MAX_PAGES; page++) {
      const params = new URLSearchParams({
        symbol: streamSymbol,
        limit: String(SEED_REST_LIMIT),
      });
      if (pageEnd != null) params.set("endTime", String(pageEnd));

      const result = await fetchRestAggTrades(params);
      if (result.error && result.rows.length === 0) {
        if (page === 0) lastError = result.error;
        break;
      }
      provider = result.provider ?? provider;
      if (result.rows.length === 0) break;

      const ingested = ingestRestRows(result.rows);
      totalFetched += ingested.fetched;
      totalAccepted += ingested.accepted;
      if (ingested.maxT != null) {
        seedMaxT =
          seedMaxT == null ? ingested.maxT : Math.max(seedMaxT, ingested.maxT);
      }

      const oldest = bufferOldestTs();
      const coverage = bufferCoverageMs();
      if (coverage >= HISTORICAL_BACKFILL_MS) break;
      if (ingested.minT == null) break;

      const nextEnd = Math.min(ingested.minT - 1, (oldest ?? ingested.minT) - 1);
      if (pageEnd != null && nextEnd >= pageEnd) break;
      pageEnd = nextEnd;
      if (result.rows.length < SEED_REST_LIMIT) break;
    }

    if (totalFetched === 0) {
      await liveTailSeed();
      return;
    }
    recordRestSeedResult("historical", totalFetched, totalAccepted, seedMaxT, provider);
  }

  async function seedFromRest(): Promise<void> {
    const end = Date.now();
    const newest = bufferNewestTs();
    const isEmpty = backing.length <= start;
    const bufferStale = newest == null || end - newest > TRADE_STALE_MS;
    const coverageMs = bufferCoverageMs();
    const needsHistorical = isEmpty || coverageMs < HISTORICAL_BACKFILL_MS;

    try {
      if (needsHistorical) {
        await historicalBackfillSeed();
        return;
      }
      if (bufferStale) {
        await liveTailSeed();
        return;
      }
      await gapFillSeed();
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.warn(`[${logTag}] REST seed failed:`, lastError);
    }
  }

  function scheduleReconnect(): void {
    if (reconnectTimer != null) return;
    reconnectScheduled = true;
    const delay = Math.min(30_000, 800 + reconnectAttempt * 900);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      reconnectScheduled = false;
      reconnectAttempt++;
      connect();
    }, delay);
  }

  function connect(): void {
    if (ws?.readyState === WebSocket.OPEN) return;
    if (ws?.readyState === WebSocket.CONNECTING) return;

    const now = Date.now();
    lastConnectAttemptAt = now;
    connectingStartedAt = now;

    try {
      ws = new WebSocket(`${wsBase}${wsPath}`);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.error(`[${logTag}] connect failed:`, e);
      ws = null;
      scheduleReconnect();
      return;
    }

    ws.on("error", (err) => {
      lastError = err.message;
      console.warn(`[${logTag}] WebSocket error:`, err.message);
    });
    ws.on("open", () => {
      connected = true;
      reconnectAttempt = 0;
      reconnectScheduled = false;
      connectingStartedAt = 0;
      lastError = null;
      console.log(`[${logTag}] WebSocket connected`);
      void seedFromRest();
    });
    ws.on("message", (data: Buffer | string) => {
      lastWsMessageAt = Date.now();
      pushTrace.rawMessageCount++;
      const raw = typeof data === "string" ? data : data.toString();
      const trade = parseAggTradePayload(raw);
      if (trade) pushTrade(trade, "ws");
    });
    ws.on("close", () => {
      connected = false;
      connectingStartedAt = 0;
      ws = null;
      scheduleReconnect();
    });
  }

  connect();
  void seedFromRest();
  healthTimer = setInterval(runTradeHealthCheck, TRADE_HEALTH_MS);

  return {
    query(symbol: string, startMs: number, endMs: number): BufferedAggTrade[] {
      const sym = symbol.replace(/[^A-Z0-9]/gi, "").toUpperCase() || streamSymbol;
      if (sym !== streamSymbol) return [];
      trimByRetention();
      const end = backing.length;
      if (start >= end) return [];
      const lo = lowerBound(start, end, startMs);
      const hi = upperBound(lo, end, endMs);
      const slice = backing.slice(lo, hi);
      if (slice.length <= MAX_BUFFER_RETURN) return slice;
      return slice.slice(0, MAX_BUFFER_RETURN);
    },
    subscribe(symbol: string, listener: (trade: BufferedAggTrade) => void): () => void {
      const sym = symbol.replace(/[^A-Z0-9]/gi, "").toUpperCase() || streamSymbol;
      if (sym !== streamSymbol) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getCoverage(symbol: string) {
      const sym = symbol.replace(/[^A-Z0-9]/gi, "").toUpperCase() || streamSymbol;
      if (sym !== streamSymbol) {
        return { connected: false, oldestMs: null, newestMs: null, size: 0 };
      }
      trimByRetention();
      const end = backing.length;
      if (start >= end) {
        return { connected, oldestMs: null, newestMs: null, size: 0 };
      }
      return {
        connected,
        oldestMs: backing[start]!.time,
        newestMs: backing[end - 1]!.time,
        size: end - start,
      };
    },
    getHealth(symbol: string) {
      const cov = this.getCoverage(symbol);
      const now = Date.now();
      const bufferNewest = cov.newestMs;
      return {
        ...cov,
        lastMessageTs: lastWsMessageAt || null,
        lastWsMessageAt: lastWsMessageAt || null,
        lastAcceptedTradeAt: lastAcceptedTradeAt || null,
        latestTradeTs: bufferNewest ?? lastTrade?.time ?? null,
        latestAgeMs:
          bufferNewest != null
            ? now - bufferNewest
            : lastTrade?.time != null
              ? now - lastTrade.time
              : null,
        reconnectCount: reconnectAttempt,
        sseClients: market === "perp" ? perpSseClients : spotSseClients,
        bufferKey: aggTradeBufferKey(streamSymbol, market),
        lastError,
        lastRestSeedTs: lastRestSeedTs || null,
      };
    },
    getBufferState(symbol: string) {
      const cov = this.getCoverage(symbol);
      const now = Date.now();
      const bufferNewest = cov.newestMs;
      return {
        key: aggTradeBufferKey(streamSymbol, market),
        market,
        connected,
        subscriberCount: listeners.size,
        bufferCount: cov.size,
        latestTradeTs: bufferNewest ?? lastTrade?.time ?? null,
        latestTradeAgeMs:
          bufferNewest != null
            ? Math.max(0, now - bufferNewest)
            : lastTrade?.time != null
              ? Math.max(0, now - lastTrade.time)
              : null,
        lastWsMessageAt: lastWsMessageAt > 0 ? lastWsMessageAt : null,
        lastWsMessageAgeMs:
          lastWsMessageAt > 0 ? Math.max(0, now - lastWsMessageAt) : null,
        lastAcceptedTradeAt: lastAcceptedTradeAt > 0 ? lastAcceptedTradeAt : null,
        lastRestSeedAt: lastRestSeedTs > 0 ? lastRestSeedTs : null,
        lastRestSeedCount: lastRestSeedFetchedCount,
        lastRestSeedAcceptedCount,
        lastRestSeedMode,
        oldestTradeTs: cov.oldestMs,
        coverageMs:
          cov.oldestMs != null && cov.newestMs != null
            ? Math.max(0, cov.newestMs - cov.oldestMs)
            : null,
        lastError,
        reconnectCount: reconnectAttempt,
        wsUrl,
      };
    },
    flushPushTrace() {
      const now = Date.now();
      const bufferNewest = bufferNewestTs();
      const snapshot = {
        market,
        key: aggTradeBufferKey(streamSymbol, market),
        connected,
        wsUrl,
        lastWsMessageAt: lastWsMessageAt > 0 ? lastWsMessageAt : null,
        lastWsMessageAgeMs:
          lastWsMessageAt > 0 ? Math.max(0, now - lastWsMessageAt) : null,
        lastAcceptedTradeAt: lastAcceptedTradeAt > 0 ? lastAcceptedTradeAt : null,
        rawMessageCount: pushTrace.rawMessageCount,
        parsedTradeCount: pushTrace.parsedTradeCount,
        parseErrorCount: pushTrace.parseErrorCount,
        lastRawEventTime: pushTrace.lastRawEventTime,
        lastRawTradeTime: pushTrace.lastRawTradeTime,
        lastRawAggId: pushTrace.lastRawAggId,
        lastParsedTradeTs: pushTrace.lastParsedTradeTs,
        lastParsedTradeAgeMs:
          pushTrace.lastParsedTradeTs != null
            ? Math.max(0, now - pushTrace.lastParsedTradeTs)
            : null,
        bufferNewestBefore: pushTrace.lastBufferNewestBefore,
        bufferNewestAfter: pushTrace.lastBufferNewestAfter,
        bufferLatestTradeAgeMs:
          bufferNewest != null ? Math.max(0, now - bufferNewest) : null,
        acceptedPushCount: pushTrace.acceptedPushCount,
        duplicateDropCount: pushTrace.duplicateDropCount,
        staleDropCount: pushTrace.staleDropCount,
        invalidDropCount: pushTrace.invalidDropCount,
        restSeedCount: pushTrace.restSeedFetchedCount,
        restSeedAcceptedCount: pushTrace.restSeedAcceptedCount,
        restSeedLatestTradeTs: pushTrace.restSeedLatestTradeTs,
        restSeedLatestTradeAgeMs:
          pushTrace.restSeedLatestTradeTs != null
            ? Math.max(0, now - pushTrace.restSeedLatestTradeTs)
            : null,
        lastPushSource: pushTrace.lastPushSource,
        lastError,
      };
      pushTrace.rawMessageCount = 0;
      pushTrace.parsedTradeCount = 0;
      pushTrace.parseErrorCount = 0;
      pushTrace.acceptedPushCount = 0;
      pushTrace.duplicateDropCount = 0;
      pushTrace.staleDropCount = 0;
      pushTrace.invalidDropCount = 0;
      pushTrace.restSeedFetchedCount = 0;
      pushTrace.restSeedAcceptedCount = 0;
      return snapshot;
    },
  };
}

const spotBuffer = HEATMAP_ENABLED
  ? createAggTradeBuffer({
      market: "spot",
      streamSymbol: "BTCUSDT",
      wsBase: getSpotAggTradeWsBase(),
      wsPath: "/ws/btcusdt@aggTrade",
      restAggTradesUrls: getSpotAggTradesRestUrls(),
      logTag: "AggTradeBuffer:spot",
    })
  : null;

const perpBuffer = HEATMAP_ENABLED
  ? createAggTradeBuffer({
      market: "perp",
      streamSymbol: "BTCUSDT",
      wsBase: "wss://fstream.binance.com",
      wsPath: "/ws/btcusdt@aggTrade",
      restAggTradesUrls: ["https://fapi.binance.com/fapi/v1/aggTrades"],
      logTag: "AggTradeBuffer:perp",
    })
  : null;

const buffers: Partial<Record<BookmapMarketSource, ReturnType<typeof createAggTradeBuffer>>> = {
  spot: spotBuffer ?? undefined,
  perp: perpBuffer ?? undefined,
};

function resolveBuffer(market?: unknown): ReturnType<typeof createAggTradeBuffer> | null {
  return buffers[parseBookmapMarket(market)] ?? null;
}

export function queryBufferedAggTrades(
  symbol: string,
  startMs: number,
  endMs: number,
  market: BookmapMarketSource = DEFAULT_BOOKMAP_MARKET,
): BufferedAggTrade[] {
  return resolveBuffer(market)?.query(symbol, startMs, endMs) ?? [];
}

export function subscribeAggTradeBuffer(
  symbol: string,
  listener: (trade: BufferedAggTrade) => void,
  market: BookmapMarketSource = DEFAULT_BOOKMAP_MARKET,
): () => void {
  return resolveBuffer(market)?.subscribe(symbol, listener) ?? (() => {});
}

export function getBufferCoverage(
  symbol: string,
  market: BookmapMarketSource = DEFAULT_BOOKMAP_MARKET,
) {
  return (
    resolveBuffer(market)?.getCoverage(symbol) ?? {
      connected: false,
      oldestMs: null,
      newestMs: null,
      size: 0,
    }
  );
}

/** Stable buffer id for diagnostics (exchange:symbol:market). */
export function aggTradeBufferKey(
  symbol: string,
  market: BookmapMarketSource = DEFAULT_BOOKMAP_MARKET,
): string {
  const sym = symbol.replace(/[^A-Z0-9]/gi, "").toUpperCase() || "BTCUSDT";
  const m = parseBookmapMarket(market);
  return `binance:${sym}:${m}`;
}

export function trackAggTradeSseClient(
  market: BookmapMarketSource,
  delta: 1 | -1,
): void {
  if (parseBookmapMarket(market) === "perp") {
    perpSseClients = Math.max(0, perpSseClients + delta);
  } else {
    spotSseClients = Math.max(0, spotSseClients + delta);
  }
}

export function getPerpTradesBufferHealth() {
  return getTradesBufferHealth("BTCUSDT", "perp");
}

export function getTradesBufferHealth(
  symbol = "BTCUSDT",
  market: BookmapMarketSource = DEFAULT_BOOKMAP_MARKET,
) {
  return (
    resolveBuffer(market)?.getHealth(symbol) ?? {
      connected: false,
      oldestMs: null,
      newestMs: null,
      size: 0,
      bufferNewestAgeMs: null,
      lastWsMessageAt: null,
      lastWsMessageAgeMs: null,
      lastAcceptedTradeAt: null,
      latestTradeTs: null,
      tradesInBuffer: 0,
      bufferKey: aggTradeBufferKey(symbol, market),
      reconnectCount: 0,
      sseClients: 0,
      lastTradePrice: null,
      lastTradeSize: null,
      lastTradeSide: null,
      lastError: "HEATMAP_DISABLED",
      lastRestSeedTs: null,
      lastRestSeedAgeMs: null,
      lastRestSeedFetchedCount: 0,
      lastRestSeedAcceptedCount: 0,
      lastRestSeedMode: null,
    }
  );
}

export function getAggTradeBufferState(
  symbol = "BTCUSDT",
  market: BookmapMarketSource,
) {
  const m = parseBookmapMarket(market);
  return (
    resolveBuffer(m)?.getBufferState(symbol) ?? {
      disabled: true,
      key: aggTradeBufferKey(symbol, m),
      market: m,
      connected: false,
      subscriberCount: m === "perp" ? perpSseClients : spotSseClients,
      bufferCount: 0,
      latestTradeTs: null,
      latestTradeAgeMs: null,
      lastWsMessageAt: null,
      lastWsMessageAgeMs: null,
      lastAcceptedTradeAt: null,
      lastRestSeedAt: null,
      lastRestSeedCount: 0,
      lastRestSeedAcceptedCount: 0,
      lastRestSeedMode: null,
      oldestTradeTs: null,
      coverageMs: null,
      lastError: "HEATMAP_DISABLED",
      reconnectCount: 0,
      wsUrl: null,
    }
  );
}

export function getAllAggTradeBufferStates(symbol = "BTCUSDT") {
  return {
    spot: getAggTradeBufferState(symbol, "spot"),
    perp: getAggTradeBufferState(symbol, "perp"),
  };
}

if (DEBUG && HEATMAP_ENABLED) {
  setInterval(() => {
    const states = getAllAggTradeBufferStates("BTCUSDT");
    console.debug("[AGG_TRADE_BUFFER_STATE]", states);
    console.debug("[AGG_TRADE_PUSH_TRACE]", {
      spot: spotBuffer?.flushPushTrace(),
      perp: perpBuffer?.flushPushTrace(),
    });
  }, 2_000);
}
