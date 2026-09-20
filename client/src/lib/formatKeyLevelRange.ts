function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Formats a key-level range without turning unavailable data into zero. */
export function formatKeyLevelRange(start: unknown, end: unknown): string {
  const normalizedStart = finiteNumber(start);
  const normalizedEnd = finiteNumber(end);
  if (normalizedStart == null || normalizedEnd == null) return "—";
  return `${normalizedStart.toLocaleString()} – ${normalizedEnd.toLocaleString()}`;
}
