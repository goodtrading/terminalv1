type DrawDebugPayload = Record<string, unknown>;

function isEnabled() {
  if (typeof window === "undefined") return false;
  try {
    const flag = window.localStorage.getItem("GT_DRAWING_DEBUG");
    return flag === "1" || (window as any).__DRAWING_DEBUG__ === true;
  } catch {
    return (window as any).__DRAWING_DEBUG__ === true;
  }
}

export function drawDebug(tag: string, payload: DrawDebugPayload) {
  if (!isEnabled()) return;
  // eslint-disable-next-line no-console
  console.log(`[DRAWING_${tag}]`, payload);
}

export function setChartViewportVersion(version: number) {
  if (typeof window === "undefined") return;
  (window as any).__DRAWING_CHART_VIEWPORT_VERSION__ = version;
}

export function getChartViewportVersion(): number | null {
  if (typeof window === "undefined") return null;
  const v = (window as any).__DRAWING_CHART_VIEWPORT_VERSION__;
  return typeof v === "number" ? v : null;
}
