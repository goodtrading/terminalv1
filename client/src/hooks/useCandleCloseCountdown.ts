import { useEffect, useState } from "react";
import { formatCandleCountdown } from "@/lib/formatCandleCountdown";
import { getCandleCloseRemainingMs, parseTimeframeToMs } from "@/lib/parseTimeframeToMs";

const TICK_MS = 1000;

export function useCandleCloseCountdown(timeframe: string): string | null {
  const timeframeMs = parseTimeframeToMs(timeframe);
  const [label, setLabel] = useState<string | null>(() =>
    timeframeMs != null ? formatCandleCountdown(getCandleCloseRemainingMs(timeframeMs)) : null,
  );

  useEffect(() => {
    if (timeframeMs == null) {
      setLabel(null);
      return;
    }

    const tick = () => {
      setLabel(formatCandleCountdown(getCandleCloseRemainingMs(timeframeMs)));
    };

    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, [timeframe, timeframeMs]);

  return label;
}
