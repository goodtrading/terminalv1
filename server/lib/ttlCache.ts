type CacheEntry<T> = {
  value: T | null;
  updatedAt: number;
  expiresAt: number;
  inFlight?: Promise<T>;
  hits: number;
  misses: number;
  staleHits: number;
  errors: number;
};

export type CacheFetchOptions = {
  ttlMs: number;
  staleTtlMs?: number;
};

export type CacheSnapshot = {
  key: string;
  hasValue: boolean;
  ageMs: number | null;
  expiresInMs: number | null;
  inFlight: boolean;
  hits: number;
  misses: number;
  staleHits: number;
  errors: number;
};

const cache = new Map<string, CacheEntry<unknown>>();

function nowMs() {
  return Date.now();
}

export async function cachedFetch<T>(
  key: string,
  options: CacheFetchOptions,
  loader: () => Promise<T>,
): Promise<T & { degraded?: boolean; warning?: string }> {
  const now = nowMs();
  const existing = cache.get(key) as CacheEntry<T> | undefined;

  if (existing?.value != null && existing.expiresAt > now) {
    existing.hits += 1;
    return existing.value as T & { degraded?: boolean; warning?: string };
  }

  if (existing?.inFlight) {
    existing.hits += 1;
    try {
      return (await existing.inFlight) as T & { degraded?: boolean; warning?: string };
    } catch (error) {
      if (existing.value != null && withinStaleWindow(existing, options.staleTtlMs, nowMs())) {
        existing.staleHits += 1;
        return withStaleWarning(existing.value, error);
      }
      throw error;
    }
  }

  const entry =
    existing ??
    ({
      value: null,
      updatedAt: 0,
      expiresAt: 0,
      hits: 0,
      misses: 0,
      staleHits: 0,
      errors: 0,
    } satisfies CacheEntry<T>);

  entry.misses += 1;
  const inFlight = loader()
    .then((value) => {
      const refreshedAt = nowMs();
      entry.value = value;
      entry.updatedAt = refreshedAt;
      entry.expiresAt = refreshedAt + options.ttlMs;
      return value;
    })
    .catch((error) => {
      entry.errors += 1;
      if (entry.value != null && withinStaleWindow(entry, options.staleTtlMs, nowMs())) {
        entry.staleHits += 1;
        return withStaleWarning(entry.value, error);
      }
      throw error;
    })
    .finally(() => {
      entry.inFlight = undefined;
    });

  entry.inFlight = inFlight;
  cache.set(key, entry as CacheEntry<unknown>);
  return (await inFlight) as T & { degraded?: boolean; warning?: string };
}

function withinStaleWindow<T>(entry: CacheEntry<T>, staleTtlMs: number | undefined, now: number): boolean {
  if (staleTtlMs == null) return true;
  return now - entry.updatedAt <= staleTtlMs;
}

function withStaleWarning<T>(value: T, error: unknown): T & { degraded?: boolean; warning?: string } {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {
      ...(value as Record<string, unknown>),
      degraded: true,
      warning: `Serving stale cache after refresh failure: ${error instanceof Error ? error.message : String(error)}`,
    } as T & { degraded?: boolean; warning?: string };
  }
  return value as T & { degraded?: boolean; warning?: string };
}

export function getCacheSnapshots(): CacheSnapshot[] {
  const now = nowMs();
  return Array.from(cache.entries()).map(([key, entry]) => ({
    key,
    hasValue: entry.value != null,
    ageMs: entry.updatedAt > 0 ? now - entry.updatedAt : null,
    expiresInMs: entry.expiresAt > 0 ? entry.expiresAt - now : null,
    inFlight: Boolean(entry.inFlight),
    hits: entry.hits,
    misses: entry.misses,
    staleHits: entry.staleHits,
    errors: entry.errors,
  }));
}
