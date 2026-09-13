import type { DrawingsCoordinateHelpers } from "../drawings/DrawingsLayer";
import type { PaperFillSnapshot } from "../execution/executionTypes";

type PaperFillPriceMarkersProps = {
  fills: readonly PaperFillSnapshot[];
  coordinates: DrawingsCoordinateHelpers;
  chartWidth: number;
  chartHeight: number;
};

/** Price-anchored presentation of canonical fills. */
export function PaperFillPriceMarkers({
  fills,
  coordinates,
  chartWidth,
  chartHeight,
}: PaperFillPriceMarkersProps) {
  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ width: chartWidth, height: chartHeight, zIndex: 12 }}
      data-paper-fill-price-markers
    >
      {fills.map((fill) => {
        const timestampMs = Date.parse(fill.timestamp);
        const time = Number.isFinite(timestampMs) ? Math.floor(timestampMs / 1000) : null;
        const x = time == null ? null : coordinates.timeToCoordinate(time);
        const y = Number.isFinite(fill.price) ? coordinates.priceToCoordinate(fill.price) : null;
        if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
        const isBuy = fill.side === "buy";
        return (
          <div
            key={fill.fillId}
            className="absolute whitespace-nowrap font-mono text-[9px] leading-none"
            style={{ left: x, top: y, transform: "translate(-50%, -50%)" }}
            data-fill-price={fill.price}
            data-fill-id={fill.fillId}
          >
            <span className={isBuy ? "text-emerald-300" : "text-red-300"}>
              {isBuy ? "▲" : "▼"} {isBuy ? "BUY" : "SELL"} {fill.quantity}
            </span>
          </div>
        );
      })}
    </div>
  );
}
