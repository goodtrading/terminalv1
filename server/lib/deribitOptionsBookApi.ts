/** Scoped helpers for /api/options/deribit/book — timeouts + degraded empty payloads. */

export const DERIBIT_OPTIONS_BOOK_HTTP_TIMEOUT_MS = 12_000;
const DERIBIT_RAW_CACHE_TTL_MS = 45_000;

type DeribitBookRawCache = {
  instruments: unknown[];
  summaries: unknown[];
  underlyingPrice: number | null;
  fetchedAt: number;
};

const deribitBookRawCache = new Map<"BTC" | "ETH", DeribitBookRawCache>();

export async function fetchDeribitWithTimeout(
  url: string,
  timeoutMs = DERIBIT_OPTIONS_BOOK_HTTP_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function emptyDeribitOptionsBookPayload(
  currency: "BTC" | "ETH",
  opts?: { error?: string; message?: string },
) {
  return {
    currency,
    underlyingPrice: null as number | null,
    selectedExpiry: null as string | null,
    expiries: [] as string[],
    rows: [] as unknown[],
    generatedAt: Date.now(),
    degraded: true,
    error: opts?.error ?? "DERIBIT_UNAVAILABLE",
    message: opts?.message ?? "Options data temporarily unavailable",
  };
}

function toFiniteNumberOrNull(...values: unknown[]): number | null {
  for (const value of values) {
    if (value == null || value === "") continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Cached Deribit instruments + summaries + index price (shared across expiry requests). */
export async function fetchDeribitBookRaw(
  currency: "BTC" | "ETH",
): Promise<DeribitBookRawCache> {
  const cached = deribitBookRawCache.get(currency);
  if (cached && Date.now() - cached.fetchedAt < DERIBIT_RAW_CACHE_TTL_MS) {
    return cached;
  }

  const [instrumentsResponse, summaryResponse] = await Promise.all([
    fetchDeribitWithTimeout(
      `https://www.deribit.com/api/v2/public/get_instruments?currency=${currency}&kind=option&expired=false`,
    ),
    fetchDeribitWithTimeout(
      `https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=${currency}&kind=option`,
    ),
  ]);

  if (!instrumentsResponse.ok || !summaryResponse.ok) {
    throw new Error(
      `Deribit HTTP error instruments=${instrumentsResponse.status} summary=${summaryResponse.status}`,
    );
  }

  const [instrumentsData, summaryData] = await Promise.all([
    instrumentsResponse.json(),
    summaryResponse.json(),
  ]);

  if (instrumentsData.error || summaryData.error) {
    throw new Error(
      instrumentsData.error?.message ||
        summaryData.error?.message ||
        "Deribit API error",
    );
  }

  let underlyingPrice: number | null = null;
  try {
    const indexName = currency === "BTC" ? "btc_usd" : "eth_usd";
    const indexResponse = await fetchDeribitWithTimeout(
      `https://www.deribit.com/api/v2/public/get_index_price?index_name=${indexName}`,
    );
    const indexData = await indexResponse.json();
    underlyingPrice = toFiniteNumberOrNull(indexData?.result?.index_price);
  } catch {
    underlyingPrice = null;
  }

  const result: DeribitBookRawCache = {
    instruments: instrumentsData.result || [],
    summaries: summaryData.result || [],
    underlyingPrice,
    fetchedAt: Date.now(),
  };
  deribitBookRawCache.set(currency, result);
  return result;
}
