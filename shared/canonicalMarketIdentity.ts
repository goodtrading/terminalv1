export type ContractStyle = "Linear" | "Inverse";

export type CanonicalEconomicMarketIdentity =
  | Readonly<{
      baseAsset: string;
      quoteAsset: string;
      settlementAsset: string;
      productType: "Spot";
      expiry: null;
    }>
  | Readonly<{
      baseAsset: string;
      quoteAsset: string;
      settlementAsset: string;
      productType: "Perpetual";
      contractStyle: ContractStyle;
      expiry: null;
    }>;

function requiredAsset(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
}

export function validateCanonicalEconomicMarketIdentity(
  identity: CanonicalEconomicMarketIdentity,
): void {
  if (identity === null || typeof identity !== "object") {
    throw new Error("canonical economic market identity is required");
  }
  requiredAsset(identity.baseAsset, "baseAsset");
  requiredAsset(identity.quoteAsset, "quoteAsset");
  requiredAsset(identity.settlementAsset, "settlementAsset");

  if (identity.expiry !== null) {
    throw new Error("expiry must be null for the supported canonical market types");
  }

  if (identity.productType === "Spot") {
    if (Object.prototype.hasOwnProperty.call(identity, "contractStyle")) {
      throw new Error("Spot identity must not define contractStyle");
    }
    return;
  }

  if (identity.productType !== "Perpetual") {
    throw new Error("productType must be Spot or Perpetual");
  }
  if (identity.contractStyle !== "Linear" && identity.contractStyle !== "Inverse") {
    throw new Error("Perpetual identity requires a valid contractStyle");
  }
}

export function sameCanonicalEconomicMarket(
  a: CanonicalEconomicMarketIdentity,
  b: CanonicalEconomicMarketIdentity,
): boolean {
  validateCanonicalEconomicMarketIdentity(a);
  validateCanonicalEconomicMarketIdentity(b);

  if (a.productType !== b.productType) return false;
  if (
    a.baseAsset !== b.baseAsset ||
    a.quoteAsset !== b.quoteAsset ||
    a.settlementAsset !== b.settlementAsset ||
    a.expiry !== b.expiry
  ) {
    return false;
  }

  if (a.productType === "Perpetual" && b.productType === "Perpetual") {
    return a.contractStyle === b.contractStyle;
  }
  return true;
}
