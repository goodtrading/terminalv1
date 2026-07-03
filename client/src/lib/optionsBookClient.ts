import { apiUrl } from "./apiBase";
import type { DeribitOptionsBookResponse } from "@shared/types/deribit-options";

const CACHE_PREFIX = "gt:options:book:v1:";
const CACHE_TTL_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 12_000;

const inflightRequests = new Map<string, Promise<DeribitOptionsBookResponse>>();

function cacheKey(currency: string, expiry: string | null): string {
  return `${CACHE_PREFIX}${currency}:${expiry ?? "auto"}`;
}

function parseCacheEntry(raw: string | null): DeribitOptionsBookResponse | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as { savedAt: number; data: DeribitOptionsBookResponse };
    return parsed?.data;
  } catch {
    return undefined;
  }
}

export function readOptionsBookCache(
  currency: string,
  expiry: string | null,
): DeribitOptionsBookResponse | undefined {
  try {
    const data = parseCacheEntry(localStorage.getItem(cacheKey(currency, expiry)));
    if (!data) return undefined;
    const raw = localStorage.getItem(cacheKey(currency, expiry));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { savedAt: number; data: DeribitOptionsBookResponse };
    if (Date.now() - parsed.savedAt > CACHE_TTL_MS) return undefined;
    return data;
  } catch {
    return undefined;
  }
}

/** Any cached book for this asset (fresh or stale) — used for instant first paint. */
export function readAnyOptionsBookCache(
  currency: string,
  expiry: string | null,
): DeribitOptionsBookResponse | undefined {
  const keys = [expiry, null] as const;
  for (const key of keys) {
    try {
      const data = parseCacheEntry(localStorage.getItem(cacheKey(currency, key)));
      if (data?.rows?.length) return data;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

export function writeOptionsBookCache(
  currency: string,
  expiry: string | null,
  data: DeribitOptionsBookResponse,
): void {
  try {
    localStorage.setItem(
      cacheKey(currency, expiry),
      JSON.stringify({ savedAt: Date.now(), data }),
    );
    if (data.selectedExpiry) {
      localStorage.setItem(
        cacheKey(currency, data.selectedExpiry),
        JSON.stringify({ savedAt: Date.now(), data }),
      );
    }
  } catch {
    /* ignore quota */
  }
}

function withTimeoutSignal(parent?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const onAbort = () => controller.abort();
  parent?.addEventListener("abort", onAbort, { once: true });

  const signal =
    parent && "any" in AbortSignal
      ? (AbortSignal as typeof AbortSignal & { any: (signals: AbortSignal[]) => AbortSignal }).any([
          parent,
          controller.signal,
        ])
      : controller.signal;

  return {
    signal,
    cleanup: () => {
      window.clearTimeout(timer);
      parent?.removeEventListener("abort", onAbort);
    },
  };
}

export async function fetchOptionsBook(params: {
  currency: string;
  expiry: string | null;
  signal?: AbortSignal;
}): Promise<DeribitOptionsBookResponse> {
  const { currency, expiry, signal: parentSignal } = params;
  const requestKey = `${currency}:${expiry ?? "auto"}`;

  if (import.meta.env.DEV) {
    console.debug("[OPTIONS_LOAD_START]", {
      asset: currency,
      expiry,
      source: "deribit-book",
      startedAt: performance.now(),
    });
  }

  const existing = inflightRequests.get(requestKey);
  if (existing) return existing;

  const promise = (async () => {
    const search = new URLSearchParams({ currency });
    if (expiry) search.append("expiry", expiry);
    const url = apiUrl(`/api/options/deribit/book?${search}`);
    const requestStartedAt = performance.now();
    const { signal, cleanup } = withTimeoutSignal(parentSignal);

    try {
      const response = await fetch(url, { credentials: "include", signal });
      if (!response.ok) {
        throw new Error(`Failed to fetch options book (${response.status})`);
      }
      const data = (await response.json()) as DeribitOptionsBookResponse;

      if (import.meta.env.DEV) {
        const json = JSON.stringify(data);
        console.debug("[OPTIONS_REQUEST_DONE]", {
          name: "deribit-book",
          url,
          status: response.status,
          durationMs: Math.round(performance.now() - requestStartedAt),
          rows: data.rows?.length ?? 0,
          bytes: typeof TextEncoder !== "undefined" ? new TextEncoder().encode(json).length : json.length,
        });
      }

      writeOptionsBookCache(currency, expiry, data);
      return data;
    } catch (error) {
      const cached = readAnyOptionsBookCache(currency, expiry);
      if (cached) {
        if (import.meta.env.DEV) {
          console.debug("[OPTIONS_REQUEST_FALLBACK_CACHE]", {
            name: "deribit-book",
            durationMs: Math.round(performance.now() - requestStartedAt),
            rows: cached.rows?.length ?? 0,
          });
        }
        return cached;
      }

      if (import.meta.env.DEV) {
        console.debug("[OPTIONS_REQUEST_FAILED]", {
          name: "deribit-book",
          url,
          durationMs: Math.round(performance.now() - requestStartedAt),
          error: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    } finally {
      cleanup();
      inflightRequests.delete(requestKey);
    }
  })();

  inflightRequests.set(requestKey, promise);
  return promise;
}

export function prefetchOptionsBook(currency: "BTC" | "ETH" = "BTC"): void {
  if (typeof window === "undefined") return;
  if (readAnyOptionsBookCache(currency, null)) return;

  const run = () => {
    void fetchOptionsBook({ currency, expiry: null }).catch(() => {
      /* background prefetch — ignore */
    });
  };

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(run, { timeout: 4000 });
  } else {
    window.setTimeout(run, 1500);
  }
}
