/**
 * Format USD notional for display.
 * Examples: 1_200_000 => $1.2M, 45_000_000 => $45M, 1_200_000_000 => $1.2B
 */
export function formatNotionalUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "--";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

/**
 * Compute OI notional in USD for a strike.
 * Deribit: 1 contract = 1 BTC. USD notional = oiContracts * spot.
 * If contract multiplier differs by instrument, pass it explicitly.
 */
export function oiToUsd(
  oiContracts: number,
  spotPrice: number,
  contractMultiplier: number = 1
): number {
  if (!Number.isFinite(oiContracts) || !Number.isFinite(spotPrice) || spotPrice <= 0) return 0;
  return oiContracts * spotPrice * contractMultiplier;
}
