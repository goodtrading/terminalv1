import type { IPriceLine } from "lightweight-charts";
export type ProtectiveLineSpec = { price: number; title: string; color: string };
type Series = {
  createPriceLine: (options: ProtectiveLineSpec & { lineWidth: 2; lineStyle: number; axisLabelVisible: true }) => IPriceLine;
  removePriceLine: (line: IPriceLine) => void;
};
/** The native line owns both the horizontal and the price-axis marker. */
export function reconcileProtectivePriceLines(series: Series, refs: Map<string, IPriceLine>, specs: Map<string, ProtectiveLineSpec>, lineStyle: number): void {
  for (const [id, line] of Array.from(refs)) {
    if (!specs.has(id)) { series.removePriceLine(line); refs.delete(id); }
  }
  for (const [id, spec] of Array.from(specs)) {
    const old = refs.get(id);
    if (old) old.applyOptions(spec);
    else refs.set(id, series.createPriceLine({ ...spec, lineWidth: 2, lineStyle, axisLabelVisible: true }));
  }
}
