import { useEffect, useMemo, useState } from "react";
import {
  formatCandleCountdown,
  getCandleCloseRemainingMs,
  parseTimeframeToMs,
} from "@/lib/timeframe";

const TICK_MS = 1000;

export type CandleCountdownState = {
  remainingMs: number | null;
  label: string | null;
  timeframeMs: number | null;
};

export function useCandleCountdown(
  timeframe: string | null | undefined,
): CandleCountdownState {
  const timeframeMs = useMemo(() => {
    if (!timeframe) return null;
    return parseTimeframeToMs(timeframe);
  }, [timeframe]);

  const [remainingMs, setRemainingMs] = useState<number | null>(() =>
    timeframeMs != null ? getCandleCloseRemainingMs(timeframeMs) : null,
  );

  useEffect(() => {
    if (timeframeMs == null) {
      setRemainingMs(null);
      return;
    }

    const tick = () => setRemainingMs(getCandleCloseRemainingMs(timeframeMs));

    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, [timeframe, timeframeMs]);

  const label = remainingMs != null ? formatCandleCountdown(remainingMs) : null;

  return { remainingMs, label, timeframeMs };
}
