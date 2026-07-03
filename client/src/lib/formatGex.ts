/**
 * Adaptive Total GEX display — shared by Market State and Options Snapshot.
 * Input is raw GEX in the same units as server `totalGex` (no extra scaling).
 */
export function formatGex(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  const abs = Math.abs(value);
  if (abs >= 1e9) return (value / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (value / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (value / 1e3).toFixed(1) + "K";
  return value.toFixed(0);
}
