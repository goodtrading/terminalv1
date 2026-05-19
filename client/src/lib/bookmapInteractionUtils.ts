/** Compact duration for Bookmap debug (e.g. `12m`, `1.5h`). */
export function formatBookmapTimeSpanMs(ms: number): string {
  const abs = Math.abs(ms);
  const sec = Math.round(abs / 1000);
  if (sec < 90) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 120) return `${min}m`;
  const hours = abs / 3_600_000;
  return hours >= 10 ? `${Math.round(hours)}h` : `${hours.toFixed(1)}h`;
}
