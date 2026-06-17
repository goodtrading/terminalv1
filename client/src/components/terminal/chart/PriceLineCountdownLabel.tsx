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

const LABEL_HEIGHT = 26;

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
      className="pointer-events-none absolute right-[4px] z-[12]"
      style={{ top }}
      title="Precio actual · tiempo hasta cierre de vela"
    >
      <div
        className={cn(
          "price-line-countdown-label box-border flex w-fit min-h-[24px] min-w-[52px] max-w-full flex-col items-center justify-center gap-0 overflow-hidden rounded-[2px] px-[4px] py-[2px]",
          "pointer-events-none whitespace-nowrap font-mono tabular-nums leading-none",
        )}
        style={{
          backgroundColor: lineColor,
          color: "#ffffff",
        }}
      >
        <div className="price-line-countdown-price text-[11px] font-extrabold leading-none">
          {priceText}
        </div>
        <div className="price-line-countdown-time mt-[1px] text-[9px] font-semibold leading-none opacity-[0.72]">
          {countdownLabel}
        </div>
      </div>
    </div>
  );
}
