/** Parse chart timeframe string to duration in ms. Returns null if unrecognized. */
export function parseTimeframeToMs(timeframe: string): number | null {
  const tf = timeframe.trim().toLowerCase();
  if (!tf) return null;

  const match = /^(\d+(?:\.\d+)?)([smhd])$/.exec(tf);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;

  switch (match[2]) {
    case "s":
      return Math.round(value * 1000);
    case "m":
      return Math.round(value * 60 * 1000);
    case "h":
      return Math.round(value * 60 * 60 * 1000);
    case "d":
      return Math.round(value * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

/** Milliseconds until the current candle closes for the given timeframe. */
export function getCandleCloseRemainingMs(timeframeMs: number, now = Date.now()): number {
  const currentCandleOpen = Math.floor(now / timeframeMs) * timeframeMs;
  const nextCandleClose = currentCandleOpen + timeframeMs;
  return Math.max(0, nextCandleClose - now);
}
