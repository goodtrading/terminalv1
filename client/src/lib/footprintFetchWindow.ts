/**
 * Normalize footprint agg-trade fetch window to Unix milliseconds for Binance / our API.
 * Fixes inverted ranges, sub-second windows, and accidental second-level timestamps.
 */

const MIN_WINDOW_MS = 30_000;
const MAX_WINDOW_CAP_MS = 120_000;
const FALLBACK_MS = 60_000;

/** Values in (~1e9, 1e12) behave like Unix seconds, not current-era epoch ms. */
function coerceLikelySecondsToMs(a: number, b: number): { a: number; b: number } {
  const looksLikeSeconds =
    a > 1e8 &&
    a < 1e12 &&
    b > 1e8 &&
    b < 1e12 &&
    Math.max(a, b) < 1e11; // ms since 1970 is already > 1e12 in 2001+
  if (!looksLikeSeconds) return { a: Math.floor(a), b: Math.floor(b) };
  return { a: Math.floor(a) * 1000, b: Math.floor(b) * 1000 };
}

/**
 * @param startMsInclusive - first visible bar open (or raw end-exclusive wrongly passed — caller should pass bar opens)
 * @param endMsExclusive - instant after last visible bar (bar open + barSec in ms)
 */
export function normalizeFootprintFetchWindow(
  startMsIn: number,
  endMsExclusiveIn: number,
  barSec: number,
): { startMs: number; endMs: number } {
  if (!Number.isFinite(startMsIn) || !Number.isFinite(endMsExclusiveIn)) {
    const e = Date.now();
    return { startMs: e - FALLBACK_MS, endMs: e };
  }

  let { a: start, b: end } = coerceLikelySecondsToMs(startMsIn, endMsExclusiveIn);

  if (start > end) {
    const t = start;
    start = end;
    end = t;
  }

  const now = Date.now();
  if (end > now) end = now;

  const barMs = Math.max(1, Math.floor(barSec)) * 1000;
  const minDur = Math.max(MIN_WINDOW_MS, Math.min(MAX_WINDOW_CAP_MS, barMs * 2 + 15_000));

  if (end - start < minDur) {
    start = end - minDur;
  }

  if (end <= start || start < 0) {
    end = now;
    start = end - FALLBACK_MS;
  }

  return { startMs: Math.floor(start), endMs: Math.floor(end) };
}
