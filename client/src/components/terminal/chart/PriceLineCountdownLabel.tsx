import { useEffect, useState } from "react";
import { useCandleCountdown } from "@/hooks/useCandleCountdown";
import { cn } from "@/lib/utils";

type PriceLineCountdownLabelProps = {
  price: number;
  isUp: boolean;
  timeframe: string;
  chartHeight: number;
  priceToCoordinate: (price: number) => number | null;
  viewportVersion?: number;
  visible?: boolean;
};

const LABEL_HEIGHT = 20;
const RIGHT_AXIS_WIDTH = 100;

export function PriceLineCountdownLabel({
  price,
  isUp,
  timeframe,
  chartHeight,
  priceToCoordinate,
  viewportVersion = 0,
  visible = true,
}: PriceLineCountdownLabelProps) {
  const { label: countdownLabel } = useCandleCountdown(timeframe);
  const [top, setTop] = useState<number | null>(null);

  useEffect(() => {
    const y = priceToCoordinate(price);
    if (y == null || !Number.isFinite(y)) {
      setTop(null);
      return;
    }
    const clamped = Math.max(4, Math.min(chartHeight - LABEL_HEIGHT - 4, y - LABEL_HEIGHT / 2));
    setTop(clamped);
  }, [price, priceToCoordinate, chartHeight, viewportVersion]);

  if (!visible || countdownLabel == null || top == null || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  const priceText = price.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const lineColor = isUp ? "#22c55e" : "#ef4444";

  return (
    <div
      className="pointer-events-none absolute z-[12]"
      style={{
        top,
        right: 0,
        width: RIGHT_AXIS_WIDTH,
      }}
      title="Precio actual · tiempo hasta cierre de vela"
    >
      <div
        className={cn(
          "ml-auto flex max-w-full items-center justify-end gap-1.5 overflow-hidden px-1.5 py-0.5",
          "font-mono text-[11px] leading-none tabular-nums",
        )}
        style={{
          backgroundColor: lineColor,
          color: "#ffffff",
        }}
      >
        <span className="truncate font-semibold">{priceText}</span>
        <span className="shrink-0 text-[10px] font-normal text-white/80">{countdownLabel}</span>
      </div>
    </div>
  );
}
