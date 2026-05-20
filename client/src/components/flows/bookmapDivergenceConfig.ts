export type DivergenceMinSeverity = "medium" | "high";

export type BookmapDivergencePrefs = {
  enabled: boolean;
  minSeverity: DivergenceMinSeverity;
  showPanel: boolean;
  showChartMarkers: boolean;
};

export const DEFAULT_BOOKMAP_DIVERGENCE_PREFS: BookmapDivergencePrefs = {
  enabled: true,
  minSeverity: "medium",
  showPanel: true,
  showChartMarkers: false,
};

export function parseDivergencePrefs(raw: unknown): BookmapDivergencePrefs {
  const o = raw && typeof raw === "object" ? (raw as Partial<BookmapDivergencePrefs>) : {};
  return {
    enabled: o.enabled !== false,
    minSeverity: o.minSeverity === "high" ? "high" : "medium",
    showPanel: o.showPanel !== false,
    showChartMarkers: o.showChartMarkers === true,
  };
}

export function severityMeetsMin(
  severity: "low" | "medium" | "high",
  min: DivergenceMinSeverity,
): boolean {
  if (min === "high") return severity === "high";
  return severity === "medium" || severity === "high";
}
