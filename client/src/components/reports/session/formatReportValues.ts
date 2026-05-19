export function formatReportPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "N/A";
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function formatReportPct(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "N/A";
  return `${n.toFixed(digits)}%`;
}

export function formatSessionQuality(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "N/A";
  return `${Math.round(n)}/100`;
}
