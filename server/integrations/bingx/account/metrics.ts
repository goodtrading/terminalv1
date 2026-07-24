type MetricKey =
  | "fetch_balance_ms"
  | "fetch_positions_ms"
  | "fetch_orders_ms"
  | "fetch_fills_ms"
  | "normalize_ms"
  | "reconcile_ms"
  | "refresh_total_ms"
  | "rate_limit_errors"
  | "signature_errors"
  | "clock_drift_errors"
  | "stale_snapshots"
  | "write_blocked";

const samples: Record<string, number[]> = {};
const counters: Record<string, number> = {};

function pushSample(key: string, ms: number): void {
  const arr = samples[key] ?? (samples[key] = []);
  arr.push(ms);
  if (arr.length > 200) arr.shift();
}

export function recordBingxLatency(key: MetricKey, ms: number): void {
  pushSample(key, ms);
}

export function incrBingxCounter(key: MetricKey, by = 1): void {
  counters[key] = (counters[key] ?? 0) + by;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

export function getBingxAccountMetricsSnapshot(): {
  latency: Record<string, { p50: number | null; p95: number | null; n: number }>;
  counters: Record<string, number>;
} {
  const latency: Record<
    string,
    { p50: number | null; p95: number | null; n: number }
  > = {};
  for (const [k, arr] of Object.entries(samples)) {
    const sorted = [...arr].sort((a, b) => a - b);
    latency[k] = {
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      n: sorted.length,
    };
  }
  return { latency, counters: { ...counters } };
}

export function timed<T>(
  key: MetricKey,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  return fn().finally(() => {
    recordBingxLatency(key, Date.now() - start);
  });
}
