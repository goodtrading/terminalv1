import { fetchWithTimeout } from "../lib/fetchWithTimeout";
import {
  DERIBIT_OPTIONS_WS_MAX_INSTRUMENTS,
  ensureDeribitOptionsTopOfBookStream,
} from "./deribitOptionsTopOfBookStream";

export type DeribitBookPayload = {
  debugVersion: string;
  currency: "BTC" | "ETH";
  underlyingPrice: number | null;
  selectedExpiry: string | null;
  expiries: string[];
  rows: Array<{ strike: number; call: Record<string, unknown> | null; put: Record<string, unknown> | null }>;
  generatedAt: number;
  stale?: boolean;
  cacheHit?: boolean;
};

const DERIBIT_FETCH_TIMEOUT_MS = 12_000;

function normalizeExpiry(input: string | undefined | null): string | null {
  if (!input) return null;
  const deribitMatch = input.toUpperCase().match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);
  if (deribitMatch) {
    const [, day, month, year] = deribitMatch;
    return `${day.padStart(2, "0")}${month}${year}`;
  }
  if (/^\d{8}$/.test(input)) {
    const year = input.slice(2, 4);
    const monthMap: Record<string, string> = {
      "01": "JAN", "02": "FEB", "03": "MAR", "04": "APR",
      "05": "MAY", "06": "JUN", "07": "JUL", "08": "AUG",
      "09": "SEP", "10": "OCT", "11": "NOV", "12": "DEC",
    };
    const month = monthMap[input.slice(4, 6)];
    const day = input.slice(6, 8);
    return month ? `${day}${month}${year}` : null;
  }
  return null;
}

function expiryCompareKey(input: string | null | undefined): string | null {
  const normalized = normalizeExpiry(input);
  if (!normalized) return null;
  const match = normalized.match(/^0?(\d{1,2})([A-Z]{3})(\d{2})$/);
  return match ? `${Number(match[1])}${match[2]}${match[3]}` : normalized;
}

function toFiniteNumberOrNull(...values: unknown[]): number | null {
  for (const value of values) {
    if (value == null || value === "") continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export async function fetchDeribitOptionsBook(params: {
  currency: string;
  expiry?: string;
}): Promise<DeribitBookPayload> {
  const startedAt = performance.now();
  const currency = params.currency.toUpperCase();
  const expiry = params.expiry;

  if (process.env.NODE_ENV !== "production") {
    console.debug("[OPTIONS_API_START]", { route: "/api/options/deribit/book", asset: currency, expiry });
  }

  const indexName = currency === "BTC" ? "btc_usd" : "eth_usd";
  const [instrumentsResponse, summaryResponse, indexResponse] = await Promise.all([
    fetchWithTimeout(
      `https://www.deribit.com/api/v2/public/get_instruments?currency=${currency}&kind=option&expired=false`,
      DERIBIT_FETCH_TIMEOUT_MS,
    ),
    fetchWithTimeout(
      `https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=${currency}&kind=option`,
      DERIBIT_FETCH_TIMEOUT_MS,
    ),
    fetchWithTimeout(
      `https://www.deribit.com/api/v2/public/get_index_price?index_name=${indexName}`,
      DERIBIT_FETCH_TIMEOUT_MS,
    ).catch(() => null),
  ]);

  if (!instrumentsResponse.ok || !summaryResponse.ok) {
    throw new Error("Failed to fetch data from Deribit API");
  }

  const [instrumentsData, summaryData, indexData] = await Promise.all([
    instrumentsResponse.json(),
    summaryResponse.json(),
    indexResponse?.ok ? indexResponse.json() : Promise.resolve(null),
  ]);

  if (instrumentsData.error || summaryData.error) {
    throw new Error(instrumentsData.error?.message || summaryData.error?.message || "Deribit API error");
  }

  const instruments = instrumentsData.result || [];
  const summaries = summaryData.result || [];
  const summaryByInstrument = new Map<string, Record<string, unknown>>(
    summaries.map((s: Record<string, unknown>) => [String(s.instrument_name), s]),
  );

  let underlyingPrice: number | null = null;
  if (indexData?.result?.index_price && Number.isFinite(indexData.result.index_price)) {
    underlyingPrice = indexData.result.index_price;
  }

  const expirySet = new Set<string>();
  instruments.forEach((i: { expiration_timestamp?: number }) => {
    const timestamp = i.expiration_timestamp;
    if (!timestamp) return;
    const date = new Date(timestamp);
    const day = date.getDate().toString().padStart(2, "0");
    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear().toString().slice(2);
    expirySet.add(`${day}${month}${year}`);
  });

  const expiries = Array.from(expirySet).sort((a, b) => {
    const parse = (v: string) =>
      new Date(
        2000 + parseInt(v.slice(4)),
        ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"].indexOf(v.slice(2, 5)),
        parseInt(v.slice(0, 2)),
      ).getTime();
    return parse(a) - parse(b);
  });

  let selectedExpiry = normalizeExpiry(expiry);
  if (!selectedExpiry && expiries.length > 0) {
    selectedExpiry = expiries[0];
  }
  const selectedExpiryKey = expiryCompareKey(selectedExpiry);

  const strikeMap = new Map<number, { call?: Record<string, unknown>; put?: Record<string, unknown> }>();

  instruments.forEach((instrument: { instrument_name?: string }) => {
    const match = instrument.instrument_name?.match(/^(BTC|ETH)-(\d{1,2}[A-Z]{3}\d{2})-(\d+)-([CP])$/);
    if (!match) return;
    const [, , instrumentExpiry, strikeStr, optionType] = match;
    const instrumentExpiryKey = expiryCompareKey(instrumentExpiry);
    const strike = parseInt(strikeStr, 10);
    if (selectedExpiryKey && instrumentExpiryKey !== selectedExpiryKey) return;
    if (!strikeMap.has(strike)) strikeMap.set(strike, {});

    const summary = summaryByInstrument.get(instrument.instrument_name!);
    const bestBidPrice = toFiniteNumberOrNull(summary?.best_bid_price, summary?.bid_price);
    const bestAskPrice = toFiniteNumberOrNull(summary?.best_ask_price, summary?.ask_price);
    const bestBidSize = toFiniteNumberOrNull(summary?.best_bid_amount, summary?.bid_amount, summary?.bid_size);
    const bestAskSize = toFiniteNumberOrNull(summary?.best_ask_amount, summary?.ask_amount, summary?.ask_size);

    const optionData = {
      instrumentName: instrument.instrument_name,
      expiry: instrumentExpiry,
      strike: strikeStr,
      type: optionType,
      matchesSelectedExpiry: instrumentExpiryKey === selectedExpiryKey,
      openInterest: summary?.open_interest ?? null,
      delta: summary?.delta ?? null,
      bidIv: summary?.bid_iv ?? null,
      askIv: summary?.ask_iv ?? null,
      bidPrice: bestBidPrice,
      askPrice: bestAskPrice,
      bidSize: bestBidSize,
      askSize: bestAskSize,
      bestBidPrice,
      bestAskPrice,
      bestBidSize,
      bestAskSize,
      markPrice: summary?.mark_price ?? null,
      volume24h: summary?.volume_usd ?? null,
      priceChange24h: summary?.price_change_24h ?? null,
    };

    if (optionType === "C") strikeMap.get(strike)!.call = optionData;
    else if (optionType === "P") strikeMap.get(strike)!.put = optionData;
  });

  const rows = Array.from(strikeMap.entries())
    .map(([strike, data]) => ({ strike, call: data.call || null, put: data.put || null }))
    .sort((a, b) => a.strike - b.strike);

  const prioritizedInstrumentNames = rows
    .flatMap((row) => [
      row.call ? { instrumentName: String(row.call.instrumentName), strike: row.strike } : null,
      row.put ? { instrumentName: String(row.put.instrumentName), strike: row.strike } : null,
    ])
    .filter((item): item is { instrumentName: string; strike: number } => !!item?.instrumentName)
    .sort((a, b) => {
      const spot = Number(underlyingPrice);
      if (!Number.isFinite(spot) || spot <= 0) return a.strike - b.strike;
      return Math.abs(a.strike - spot) - Math.abs(b.strike - spot);
    })
    .map((item) => item.instrumentName)
    .slice(0, DERIBIT_OPTIONS_WS_MAX_INSTRUMENTS);

  for (const row of rows) {
    for (const side of [row.call, row.put]) {
      if (!side?.instrumentName) continue;
      const hasRestLiquidity =
        side.bestBidPrice != null ||
        side.bestAskPrice != null ||
        side.bestBidSize != null ||
        side.bestAskSize != null;
      side.liquidityUpdatedAt = hasRestLiquidity ? Date.now() : null;
      side.liquiditySource = hasRestLiquidity ? "rest" : "missing";
      side.deribitReceivedAt = null;
      side.cacheUpdatedAt = null;
    }
  }

  setImmediate(() => {
    ensureDeribitOptionsTopOfBookStream(prioritizedInstrumentNames);
  });

  const payload: DeribitBookPayload = {
    debugVersion: "BOOK_V5",
    currency: currency as "BTC" | "ETH",
    underlyingPrice,
    selectedExpiry: selectedExpiry || null,
    expiries,
    rows,
    generatedAt: Date.now(),
  };

  if (process.env.NODE_ENV !== "production") {
    const json = JSON.stringify(payload);
    console.debug("[OPTIONS_API_DONE]", {
      route: "/api/options/deribit/book",
      durationMs: Math.round(performance.now() - startedAt),
      instrumentsCount: instruments.length,
      rowsCount: rows.length,
      bytes: Buffer.byteLength(json),
    });
    console.debug("[OPTIONS_PAYLOAD_SIZE]", {
      bytes: Buffer.byteLength(json),
      rows: rows.length,
    });
  }

  return payload;
}
