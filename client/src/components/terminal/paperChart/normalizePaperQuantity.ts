/** Loose paper entity shapes from API, storage, or legacy trades. */
export type PaperQuantitySource = {
  qtyBTC?: unknown;
  qty?: unknown;
  quantity?: unknown;
  size?: unknown;
  notionalUSDT?: unknown;
  notionalUsdt?: unknown;
  entryPrice?: unknown;
  price?: unknown;
};

export type NormalizedPaperQuantity = {
  qtyBTC: number | null;
  notionalUSDT: number | null;
};

function finitePositive(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function entryFromItem(
  item: PaperQuantitySource,
  entryPriceHint?: unknown,
): number | null {
  return (
    finitePositive(entryPriceHint) ??
    finitePositive(item.entryPrice) ??
    finitePositive(item.price)
  );
}

/**
 * Resolve BTC qty and USDT notional from mixed legacy/new paper fields.
 * Never throws; returns nulls when data is missing.
 */
export function normalizePaperQuantity(
  item: PaperQuantitySource | null | undefined,
  entryPriceHint?: unknown,
): NormalizedPaperQuantity {
  if (!item) {
    return { qtyBTC: null, notionalUSDT: null };
  }

  let qtyBTC =
    finitePositive(item.qtyBTC) ??
    finitePositive(item.qty) ??
    finitePositive(item.quantity) ??
    finitePositive(item.size);

  const notionalRaw =
    finitePositive(item.notionalUSDT) ?? finitePositive(item.notionalUsdt);

  const entry = entryFromItem(item, entryPriceHint);

  if (qtyBTC == null && notionalRaw != null && entry != null) {
    qtyBTC = notionalRaw / entry;
  }

  let notionalUSDT = notionalRaw;
  if (notionalUSDT == null && qtyBTC != null && entry != null) {
    notionalUSDT = qtyBTC * entry;
  }

  if (qtyBTC != null && (!Number.isFinite(qtyBTC) || qtyBTC <= 0)) {
    qtyBTC = null;
  }
  if (notionalUSDT != null && (!Number.isFinite(notionalUSDT) || notionalUSDT <= 0)) {
    notionalUSDT = null;
  }

  return { qtyBTC, notionalUSDT };
}
