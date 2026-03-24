import type { Drawing } from "../drawings/types";

export type ChartMenuOverlayKind = "gamma" | "liquidity" | "heatmap" | "sweep" | "absorption" | "magnet" | "other";

export type ChartMenuContext =
  | { kind: "empty"; price: number | null; time: number | null }
  | { kind: "drawing"; drawing: Drawing; price: number | null; time: number | null }
  | { kind: "overlay"; overlayKind: ChartMenuOverlayKind };

export const MENU_ESTIMATE_W = 260;
export const MENU_ESTIMATE_H = 420;

export function clampMenuPosition(
  clientX: number,
  clientY: number,
  menuW = MENU_ESTIMATE_W,
  menuH = MENU_ESTIMATE_H
): { x: number; y: number } {
  const pad = 8;
  const vw = typeof window !== "undefined" ? window.innerWidth : 0;
  const vh = typeof window !== "undefined" ? window.innerHeight : 0;
  let x = clientX;
  let y = clientY;
  if (x + menuW > vw - pad) x = Math.max(pad, vw - menuW - pad);
  if (y + menuH > vh - pad) y = Math.max(pad, vh - menuH - pad);
  if (x < pad) x = pad;
  if (y < pad) y = pad;
  return { x, y };
}
