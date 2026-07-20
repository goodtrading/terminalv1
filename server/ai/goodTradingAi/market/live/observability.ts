/**
 * Observability for live snapshot — no full payload logs.
 */
export function logLiveSnapshotObs(meta: {
  symbol: string;
  completeness: string;
  durationMs: number;
  adapterCount: number;
  availableCount: number;
}): void {
  // Keep log compact — never dump snapshot/evidence/book
  console.info(
    `[ai-market-live] symbol=${meta.symbol} completeness=${meta.completeness} adapters=${meta.availableCount}/${meta.adapterCount} ms=${meta.durationMs}`,
  );
}
