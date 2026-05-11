import type { FootprintMode } from "./footprintTypes";

let lastFootprintTickLogKey = "";

export type FootprintTickSizeResult = {
  baseTickSize: number;
  finalTickSize: number;
  mode: FootprintMode;
};

function baseTickBtc(timeframe: string): number {
  const tf = timeframe.trim().toLowerCase();
  if (tf === "15s") return 5;
  if (tf === "1m") return 10;
  if (tf === "5m") return 25;
  if (tf === "15m") return 50;
  if (tf === "1h") return 100;
  return 25;
}

/**
 * Tick de agrupación y modo visual según TF y ancho de vela en px (Fase 1).
 */
export function getFootprintTickSize({
  symbol,
  timeframe,
  candleWidthPx,
}: {
  symbol: string;
  timeframe: string;
  candleWidthPx: number;
}): FootprintTickSizeResult {
  const sym = symbol.toUpperCase();
  const isBtc = sym.includes("BTC");
  const baseTickSize = isBtc ? baseTickBtc(timeframe) : 25;

  let mode: FootprintMode;
  if (candleWidthPx < 8) mode = "hidden";
  else if (candleWidthPx < 18) mode = "summary";
  else if (candleWidthPx < 35) mode = "compact";
  else mode = "full";

  let mult = 1;
  if (candleWidthPx < 10) mult = 4;
  else if (candleWidthPx < 18) mult = 2;
  // >= 18: base; >= 45 sigue siendo base (sin multiplicar adicional)

  const finalTickSize = Math.max(isBtc ? 1 : 0.01, baseTickSize * mult);

  if (import.meta.env.DEV) {
    const logKey = `${symbol}|${timeframe}|${Math.round(candleWidthPx)}|${baseTickSize}|${finalTickSize}|${mode}`;
    if (logKey !== lastFootprintTickLogKey) {
      lastFootprintTickLogKey = logKey;
      // eslint-disable-next-line no-console
      console.debug("[FootprintTickSize]", {
        symbol,
        timeframe,
        candleWidthPx,
        baseTickSize,
        finalTickSize,
        mode,
      });
    }
  }

  return { baseTickSize, finalTickSize, mode };
}
