import { useCandleCountdown } from "./useCandleCountdown";

/** @deprecated Prefer useCandleCountdown — returns label string only. */
export function useCandleCloseCountdown(timeframe: string): string | null {
  return useCandleCountdown(timeframe).label;
}
