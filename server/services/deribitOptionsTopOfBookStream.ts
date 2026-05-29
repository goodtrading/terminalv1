import WebSocket from "ws";

export const DERIBIT_OPTIONS_WS_MAX_INSTRUMENTS = 80;
export const DERIBIT_OPTIONS_WS_STALE_MS = 5000;
export const DERIBIT_OPTIONS_WS_RECONNECT_MS = 2000;
export const DERIBIT_OPTIONS_TOB_ROLLING_WINDOW_MS = 1000;
export const DERIBIT_OPTIONS_TOB_MAX_TICKS_PER_INSTRUMENT = 30;
export const DERIBIT_OPTIONS_TOB_SPIKE_ABS_THRESHOLD = 10;
export const DERIBIT_OPTIONS_TOB_SPIKE_PCT_THRESHOLD = 0.35;

export type TopOfBookTick = {
  ts: number;
  bestBidPrice: number | null;
  bestAskPrice: number | null;
  bestBidSize: number | null;
  bestAskSize: number | null;
};

export type TopOfBookSizeStats = {
  current: number | null;
  min: number | null;
  max: number | null;
  delta: number | null;
  spike: boolean;
  spikeAbs: number | null;
  spikePct: number | null;
  samples: number;
};

export type OptionTopOfBookLiquidity = {
  instrumentName: string;
  bestBidPrice: number | null;
  bestAskPrice: number | null;
  bestBidSize: number | null;
  bestAskSize: number | null;
  deribitReceivedAt: number;
  cacheUpdatedAt: number;
  updatedAt: number;
  source: "ws" | "rest";
  recentTicks: TopOfBookTick[];
  bidSizeStats1s: TopOfBookSizeStats;
  askSizeStats1s: TopOfBookSizeStats;
};

const DERIBIT_WS_URL = "wss://www.deribit.com/ws/api/v2";
const LOG_TAG = "[deribit-options-tob-ws]";
const isDev = process.env.NODE_ENV !== "production";

const optionTopOfBookCache = new Map<string, OptionTopOfBookLiquidity>();
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let requestId = 1;
let desiredInstruments = new Set<string>();
let subscribedInstruments = new Set<string>();

function log(...args: unknown[]): void {
  if (isDev) console.log(LOG_TAG, ...args);
}

function warn(...args: unknown[]): void {
  console.warn(LOG_TAG, ...args);
}

function toFiniteNumberOrNull(...values: unknown[]): number | null {
  for (const value of values) {
    if (value == null || value === "") continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function emptySizeStats(): TopOfBookSizeStats {
  return {
    current: null,
    min: null,
    max: null,
    delta: null,
    spike: false,
    spikeAbs: null,
    spikePct: null,
    samples: 0,
  };
}

function trimRecentTicks(ticks: TopOfBookTick[], now: number): TopOfBookTick[] {
  return ticks
    .filter((tick) => now - tick.ts <= DERIBIT_OPTIONS_TOB_ROLLING_WINDOW_MS)
    .slice(-DERIBIT_OPTIONS_TOB_MAX_TICKS_PER_INSTRUMENT);
}

function computeSizeStats(
  ticks: TopOfBookTick[],
  side: "bid" | "ask"
): TopOfBookSizeStats {
  const key = side === "bid" ? "bestBidSize" : "bestAskSize";
  const values = ticks
    .map((tick) => tick[key])
    .filter((value): value is number => value != null && Number.isFinite(value));

  if (values.length === 0) return emptySizeStats();

  const current = values[values.length - 1] ?? null;
  const first = values[0];
  if (first == null) return emptySizeStats();

  let min = first;
  let max = first;

  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }

  const delta = current != null && Number.isFinite(first) ? current - first : null;
  const spikeAbs = max - min;
  const spikePct = min > 0 ? spikeAbs / min : null;
  const spike =
    values.length >= 2 &&
    (spikeAbs >= DERIBIT_OPTIONS_TOB_SPIKE_ABS_THRESHOLD ||
      (spikePct != null && spikePct >= DERIBIT_OPTIONS_TOB_SPIKE_PCT_THRESHOLD));

  return {
    current,
    min,
    max,
    delta,
    spike,
    spikeAbs,
    spikePct,
    samples: values.length,
  };
}

function normalizeInstrumentNames(instrumentNames: string[]): string[] {
  const unique = Array.from(new Set(instrumentNames))
    .filter((name): name is string => typeof name === "string" && name.length > 0)
    .filter((name) => name.startsWith("BTC-") || name.startsWith("ETH-"));

  if (unique.length > DERIBIT_OPTIONS_WS_MAX_INSTRUMENTS) {
    warn(
      `instrument cap applied ${DERIBIT_OPTIONS_WS_MAX_INSTRUMENTS}/${unique.length}`
    );
  }

  return unique.slice(0, DERIBIT_OPTIONS_WS_MAX_INSTRUMENTS);
}

function channelForInstrument(instrumentName: string): string {
  return `ticker.${instrumentName}.100ms`;
}

function send(method: string, params: Record<string, unknown>): void {
  if (ws?.readyState !== WebSocket.OPEN) return;
  ws.send(
    JSON.stringify({
      jsonrpc: "2.0",
      id: requestId++,
      method,
      params,
    })
  );
}

function syncSubscriptions(): void {
  if (ws?.readyState !== WebSocket.OPEN) return;

  const toSubscribe = Array.from(desiredInstruments).filter(
    (instrument) => !subscribedInstruments.has(instrument)
  );
  const toUnsubscribe = Array.from(subscribedInstruments).filter(
    (instrument) => !desiredInstruments.has(instrument)
  );

  if (toSubscribe.length) {
    send("public/subscribe", {
      channels: toSubscribe.map(channelForInstrument),
    });
    toSubscribe.forEach((instrument) => subscribedInstruments.add(instrument));
    log(`subscribed ${toSubscribe.length} instruments`);
  }

  if (toUnsubscribe.length) {
    send("public/unsubscribe", {
      channels: toUnsubscribe.map(channelForInstrument),
    });
    toUnsubscribe.forEach((instrument) => subscribedInstruments.delete(instrument));
    log(`unsubscribed ${toUnsubscribe.length} instruments`);
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    log("reconnecting");
    connect();
  }, DERIBIT_OPTIONS_WS_RECONNECT_MS);
}

function handleTicker(data: any): void {
  const instrumentName = data?.instrument_name;
  if (typeof instrumentName !== "string") return;
  const now = Date.now();
  const bestBidPrice = toFiniteNumberOrNull(data.best_bid_price, data.bid_price);
  const bestAskPrice = toFiniteNumberOrNull(data.best_ask_price, data.ask_price);
  const bestBidSize = toFiniteNumberOrNull(data.best_bid_amount, data.bid_amount, data.bid_size);
  const bestAskSize = toFiniteNumberOrNull(data.best_ask_amount, data.ask_amount, data.ask_size);
  const previous = optionTopOfBookCache.get(instrumentName);
  const tick: TopOfBookTick = {
    ts: now,
    bestBidPrice,
    bestAskPrice,
    bestBidSize,
    bestAskSize,
  };
  const recentTicks = trimRecentTicks([...(previous?.recentTicks ?? []), tick], now);

  const item: OptionTopOfBookLiquidity = {
    instrumentName,
    bestBidPrice,
    bestAskPrice,
    bestBidSize,
    bestAskSize,
    deribitReceivedAt: now,
    cacheUpdatedAt: now,
    updatedAt: now,
    source: "ws",
    recentTicks,
    bidSizeStats1s: computeSizeStats(recentTicks, "bid"),
    askSizeStats1s: computeSizeStats(recentTicks, "ask"),
  };

  optionTopOfBookCache.set(instrumentName, item);
}

function handleMessage(raw: WebSocket.RawData): void {
  try {
    const msg = JSON.parse(raw.toString());
    const data = msg?.params?.data;
    if (!data) return;
    handleTicker(data);
  } catch (error) {
    warn("message parse failed", error instanceof Error ? error.message : String(error));
  }
}

function connect(): void {
  if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
    return;
  }

  try {
    ws = new WebSocket(DERIBIT_WS_URL);
  } catch (error) {
    warn("connect failed", error instanceof Error ? error.message : String(error));
    scheduleReconnect();
    return;
  }

  ws.on("open", () => {
    subscribedInstruments = new Set();
    log("connected");
    syncSubscriptions();
  });

  ws.on("message", handleMessage);

  ws.on("close", () => {
    ws = null;
    subscribedInstruments = new Set();
    scheduleReconnect();
  });

  ws.on("error", (error) => {
    warn("error", error.message);
  });
}

export function ensureDeribitOptionsTopOfBookStream(instrumentNames: string[]): void {
  desiredInstruments = new Set(normalizeInstrumentNames(instrumentNames));
  if (desiredInstruments.size === 0) return;
  connect();
  syncSubscriptions();
}

export function getDeribitOptionsTopOfBookSnapshot(
  instrumentNames?: string[],
  options?: { includeStale?: boolean }
): Record<string, OptionTopOfBookLiquidity> {
  const now = Date.now();
  const names =
    instrumentNames && instrumentNames.length
      ? normalizeInstrumentNames(instrumentNames)
      : Array.from(optionTopOfBookCache.keys());

  const out: Record<string, OptionTopOfBookLiquidity> = {};
  for (const instrumentName of names) {
    const item = optionTopOfBookCache.get(instrumentName);
    if (!item) continue;
    if (!options?.includeStale && now - item.updatedAt > DERIBIT_OPTIONS_WS_STALE_MS) {
      continue;
    }
    out[instrumentName] = item;
  }
  return out;
}

export function getDeribitOptionsTopOfBook(
  instrumentName: string,
  maxAgeMs = DERIBIT_OPTIONS_WS_STALE_MS
): OptionTopOfBookLiquidity | null {
  const item = optionTopOfBookCache.get(instrumentName);
  if (!item) return null;
  if (Date.now() - item.updatedAt > maxAgeMs) return null;
  return item;
}
