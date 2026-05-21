export function paperRiskReferencePrice(
  markPrice: number | null | undefined,
  entryPrice: number | null | undefined,
): number | null {
  if (markPrice != null && Number.isFinite(markPrice) && markPrice > 0) {
    return markPrice;
  }
  if (entryPrice != null && Number.isFinite(entryPrice) && entryPrice > 0) {
    return entryPrice;
  }
  return null;
}

export function validatePaperRiskLevels(
  side: "long" | "short",
  referencePrice: number | null,
  stopLoss: number | null | undefined,
  takeProfit: number | null | undefined,
): string | null {
  if (referencePrice == null) return null;
  if (stopLoss != null && Number.isFinite(stopLoss) && stopLoss > 0) {
    if (side === "long" && stopLoss >= referencePrice) {
      return "For a long position, stop loss must be below price.";
    }
    if (side === "short" && stopLoss <= referencePrice) {
      return "For a short position, stop loss must be above price.";
    }
  }
  if (takeProfit != null && Number.isFinite(takeProfit) && takeProfit > 0) {
    if (side === "long" && takeProfit <= referencePrice) {
      return "For a long position, take profit must be above price.";
    }
    if (side === "short" && takeProfit >= referencePrice) {
      return "For a short position, take profit must be below price.";
    }
  }
  return null;
}

export function parseRiskInput(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Order ticket: empty → null; invalid string → error */
export function parseTicketRiskField(
  raw: string,
  label: "Stop loss" | "Take profit",
): { value: number | null; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null };
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) {
    return { value: null, error: `Invalid ${label.toLowerCase()} price` };
  }
  return { value: n };
}

/** Pre-submit validation (market uses mark; limit may use limit price) */
export function validatePaperTicketRisk(
  side: "long" | "short",
  referencePrice: number | null,
  stopLoss: number | null,
  takeProfit: number | null,
): string | null {
  if (referencePrice == null) return null;
  if (stopLoss != null) {
    if (side === "long" && stopLoss >= referencePrice) {
      return "For a long, SL must be below entry.";
    }
    if (side === "short" && stopLoss <= referencePrice) {
      return "For a short, SL must be above entry.";
    }
  }
  if (takeProfit != null) {
    if (side === "long" && takeProfit <= referencePrice) {
      return "For a long, TP must be above entry.";
    }
    if (side === "short" && takeProfit >= referencePrice) {
      return "For a short, TP must be below entry.";
    }
  }
  return null;
}

export function buildPaperSubmitRiskPayload(
  stopLossRaw: string,
  takeProfitRaw: string,
): {
  stopLoss: number | null;
  takeProfit: number | null;
  error?: string;
} {
  const sl = parseTicketRiskField(stopLossRaw, "Stop loss");
  if (sl.error) return { stopLoss: null, takeProfit: null, error: sl.error };
  const tp = parseTicketRiskField(takeProfitRaw, "Take profit");
  if (tp.error) return { stopLoss: null, takeProfit: null, error: tp.error };
  return { stopLoss: sl.value, takeProfit: tp.value };
}
