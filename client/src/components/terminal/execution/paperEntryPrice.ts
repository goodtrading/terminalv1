export type PaperEntryPriceSource =
  | "mark"
  | "bingx"
  | "ticker"
  | "chart"
  | "limit"
  | "manual";

export type ResolvePaperEntryPriceInput = {
  orderType: "market" | "limit";
  limitPrice?: number | null;
  markPrice?: number | null;
  bingxLastPrice?: number | null;
  tickerPrice?: number | null;
  chartClosePrice?: number | null;
  manualEntry?: number | null;
};

export type ResolvedPaperEntryPrice = {
  price: number | null;
  source: PaperEntryPriceSource | null;
  usedFallback: boolean;
};

function validPrice(n: number | null | undefined): n is number {
  return n != null && Number.isFinite(n) && n > 0;
}

/** Market: mark → BingX → ticker → chart → manual. Limit: limit price only. */
export function resolvePaperEntryPrice(
  input: ResolvePaperEntryPriceInput,
): ResolvedPaperEntryPrice {
  if (input.orderType === "limit") {
    if (validPrice(input.limitPrice)) {
      return { price: input.limitPrice, source: "limit", usedFallback: false };
    }
    return { price: null, source: null, usedFallback: false };
  }

  if (validPrice(input.markPrice)) {
    return { price: input.markPrice, source: "mark", usedFallback: false };
  }
  if (validPrice(input.bingxLastPrice)) {
    return {
      price: input.bingxLastPrice,
      source: "bingx",
      usedFallback: true,
    };
  }
  if (validPrice(input.tickerPrice)) {
    return {
      price: input.tickerPrice,
      source: "ticker",
      usedFallback: true,
    };
  }
  if (validPrice(input.chartClosePrice)) {
    return {
      price: input.chartClosePrice,
      source: "chart",
      usedFallback: true,
    };
  }
  if (validPrice(input.manualEntry)) {
    return {
      price: input.manualEntry,
      source: "manual",
      usedFallback: true,
    };
  }

  return { price: null, source: null, usedFallback: false };
}

export const PAPER_PRICE_FALLBACK_HINT =
  "Using chart/ticker price fallback for paper execution.";

export const PAPER_NO_PRICE_MESSAGE =
  "No valid price available for paper execution. Connect market data or enter a limit price.";
