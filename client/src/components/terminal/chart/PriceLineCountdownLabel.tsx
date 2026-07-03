import { useEffect, useState } from "react";
import { useCandleCountdown } from "@/hooks/useCandleCountdown";
import { cn } from "@/lib/utils";

const PRICE_LABEL_AXIS_PADDING_X = 2;
const PRICE_LABEL_DEBUG = false;

type PriceLineCountdownLabelProps = {
  price: number;
  isUp: boolean;
  timeframe: string;
  plotWidth: number;
  priceAxisWidth: number;
  chartHeight: number;
  priceToCoordinate: (price: number) => number | null;
  viewportVersion?: number;
  visible?: boolean;
};

const LABEL_HEIGHT = 22;

export function PriceLineCountdownLabel({
  price,
  isUp,
  timeframe,
  plotWidth,
  priceAxisWidth,
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
    const clampedY = Math.max(
      LABEL_HEIGHT / 2 + 4,
      Math.min(chartHeight - LABEL_HEIGHT / 2 - 4, y),
    );
    setTop(clampedY);
  }, [price, priceToCoordinate, chartHeight, viewportVersion]);

  if (
    !visible ||
    countdownLabel == null ||
    top == null ||
    !Number.isFinite(price) ||
    price <= 0 ||
    plotWidth <= 0 ||
    priceAxisWidth <= 0
  ) {
    return null;
  }

  const priceText = price.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const lineColor = isUp ? "#22c55e" : "#ef4444";
  const x = plotWidth + PRICE_LABEL_AXIS_PADDING_X;
  const width = Math.max(44, priceAxisWidth - PRICE_LABEL_AXIS_PADDING_X * 2);

  return (
    <div
      className={cn(
        "price-line-countdown-anchor pointer-events-none absolute z-[12]",
        PRICE_LABEL_DEBUG && "outline outline-2 outline-yellow-400",
      )}
      style={{
        left: `${x}px`,
        top: `${top - LABEL_HEIGHT / 2}px`,
        width: `${width}px`,
        height: `${LABEL_HEIGHT}px`,
        transform: "none",
      }}
      title="Precio actual · tiempo hasta cierre de vela"
    >
      <div
        className={cn(
          "price-line-countdown-label box-border flex h-full w-full min-h-[20px] flex-col items-center justify-center gap-0 overflow-hidden rounded-[1px] px-[3px] py-[1px] text-center",
          "pointer-events-none whitespace-nowrap font-mono tabular-nums leading-none",
        )}
        style={{
          backgroundColor: lineColor,
          color: "#ffffff",
        }}
      >
        <div className="price-line-countdown-price text-[10px] font-bold leading-none">
          {priceText}
        </div>
        <div className="price-line-countdown-time mt-[1px] text-[8px] font-semibold leading-none opacity-[0.68]">
          {countdownLabel}
        </div>
      </div>
    </div>
  );
}
