export type PositionPnlDisplayMode = "percent" | "dollars";

export const DEFAULT_POSITION_PNL_DISPLAY: PositionPnlDisplayMode = "percent";

export function togglePositionPnlDisplay(mode: PositionPnlDisplayMode): PositionPnlDisplayMode {
  return mode === "percent" ? "dollars" : "percent";
}

export function formatNetPositionPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(3).replace(/(\.\d{2})0$/, "$1")}%`;
}

export function formatCanonicalNetPnlUsdt(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value === 0) return "$0.00";
  return `${value > 0 ? "+" : "-"}$${Math.abs(value).toFixed(2)}`;
}
