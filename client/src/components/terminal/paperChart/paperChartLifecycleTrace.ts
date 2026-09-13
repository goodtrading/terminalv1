import { useEffect } from "react";

// Development-only ownership evidence. No financial state is retained here.
const ids = new WeakMap<object, number>();
let nextId = 0;
export function chartObjectId(value: object | null | undefined): number | null {
  if (!value) return null;
  if (!ids.has(value)) ids.set(value, ++nextId);
  return ids.get(value)!;
}
export function tracePaperChart(event: string, detail: Record<string, unknown> = {}) {
  if (!import.meta.env?.DEV) return;
  const entry = { time: new Date().toISOString(), event, ...detail };
  const target = window as unknown as { __paperChartTrace?: unknown[] };
  const entries = target.__paperChartTrace ??= [];
  entries.push(entry);
  navigator.sendBeacon("http://127.0.0.1:9846", JSON.stringify(entry));
  if (entries.length > 3000) entries.shift();
  if (!["createPriceLine", "removePriceLine", "PRICE_LINE_CREATED"].includes(event)) console.warn("[PAPER_CHART_LIFETIME]", JSON.stringify(entry));
}
export function usePaperChartLifetime(owner: string, series?: object | null) {
  useEffect(() => {
    tracePaperChart("MOUNT", { owner, series: chartObjectId(series) });
    return () => tracePaperChart("UNMOUNT", { owner, series: chartObjectId(series) });
  }, [owner, series]);
}
export function traceChartApi<T extends object>(value: T, owner: string): T {
  if (!import.meta.env?.DEV) return value;
  const api = value as Record<string, any>;
  const id = chartObjectId(value);
  tracePaperChart("CREATE", { owner, id });
  for (const method of ["remove", "removeSeries", "createPriceLine", "removePriceLine", "dispose", "destroy"]) {
    if (typeof api[method] !== "function") continue;
    const original = api[method];
    api[method] = function (...args: any[]) {
      tracePaperChart(method, { owner, id, object: method === "removePriceLine" || method === "removeSeries" ? chartObjectId(args[0]) : undefined, stack: new Error().stack });
      const result = original.apply(value, args);
      if (method === "createPriceLine") tracePaperChart("PRICE_LINE_CREATED", { owner, series: id, line: chartObjectId(result) });
      return result;
    };
  }
  return value;
}
if (import.meta.env?.DEV) {
  const onError = (event: ErrorEvent) => tracePaperChart("ERROR", { message: event.message, stack: event.error?.stack });
  const onRejection = (event: PromiseRejectionEvent) => tracePaperChart("REJECTION", { message: String(event.reason), stack: event.reason?.stack });
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  import.meta.hot?.dispose(() => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  });
}
