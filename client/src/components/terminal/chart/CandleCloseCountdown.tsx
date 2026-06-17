import { useCandleCloseCountdown } from "@/hooks/useCandleCloseCountdown";

type CandleCloseCountdownProps = {
  timeframe: string;
};

export function CandleCloseCountdown({ timeframe }: CandleCloseCountdownProps) {
  const label = useCandleCloseCountdown(timeframe);
  if (!label) return null;

  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-mono tabular-nums text-white/45"
      title="Tiempo hasta cierre de vela"
    >
      <span aria-hidden>⏱</span>
      {label}
    </span>
  );
}
