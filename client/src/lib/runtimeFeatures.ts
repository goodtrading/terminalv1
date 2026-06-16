import { isDesktopApp } from "./desktopRuntime";

/** Packaged Tauri app or desktop Vite build (`VITE_PLATFORM=desktop`). */
export function isDesktopRuntime(): boolean {
  return isDesktopApp();
}

/** Client build flag — set only for desktop bundles (`npm run dev:desktop` / `build:desktop`). */
export function isViteHeatmapBuildEnabled(): boolean {
  return import.meta.env.VITE_HEATMAP_ENABLED === "true";
}

/**
 * Bookmap / FLOWS tab — desktop runtime only.
 * Web/Railway builds never set VITE_HEATMAP_ENABLED; localhost web stays lightweight.
 */
export function isFlowsEnabled(): boolean {
  return isDesktopRuntime() && isViteHeatmapBuildEnabled();
}

/** Alias for Bookmap panel mount gate. */
export function isBookmapEnabled(): boolean {
  return isFlowsEnabled();
}
