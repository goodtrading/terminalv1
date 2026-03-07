import { useState, useRef } from "react";
import { cn } from "@/lib/utils";

const TOOLTIPS: Record<string, { title: string; text: string }> = {
  "Gamma Regime": {
    title: "GAMMA REGIME",
    text: "Dealers hedge against price moves. LONG GAMMA stabilizes price and creates mean reversion. SHORT GAMMA amplifies volatility."
  },
  "Gamma Flip": {
    title: "GAMMA FLIP",
    text: "Level where dealer positioning changes from stabilizing the market to amplifying volatility."
  },
  "Call Wall": {
    title: "CALL WALL",
    text: "Large concentration of call options. Often acts as resistance due to dealer hedging."
  },
  "Put Wall": {
    title: "PUT WALL",
    text: "Large concentration of put options. Often acts as support due to dealer hedging."
  },
  "Magnet": {
    title: "GAMMA MAGNET",
    text: "Strike with heavy options positioning. Price often gravitates toward these levels."
  },
  "Dealer Pivot": {
    title: "DEALER PIVOT",
    text: "Key level where dealer hedging flow may shift direction."
  },
  "Squeeze Risk": {
    title: "SQUEEZE RISK",
    text: "Market conditions where hedging flows may accelerate price movement rapidly."
  },
  "Transition Zone": {
    title: "TRANSITION ZONE",
    text: "Area where the market moves between long gamma and short gamma regimes."
  },
  "Structure": {
    title: "MARKET STRUCTURE",
    text: "High-level market mode derived from gamma positioning, volatility state, and institutional bias."
  },
  "Volatility": {
    title: "VOLATILITY",
    text: "Current volatility environment. LOW means stable price action, HIGH means larger moves are expected."
  },
  "Dealers": {
    title: "DEALER CONTEXT",
    text: "Current dealer gamma positioning. Determines whether dealers stabilize or amplify price moves."
  },
  "LEVELS": {
    title: "LEVELS MODE",
    text: "Shows structural levels: Call Wall, Put Wall, Gamma Magnets, and Dealer Pivot."
  },
  "GAMMA": {
    title: "GAMMA MODE",
    text: "Shows gamma structure: Gamma Flip, Transition Zone, and Gamma Cliffs."
  },
  "CASCADE": {
    title: "CASCADE MODE",
    text: "Shows cascade risk: Cascade Trigger and Liquidation Pocket zones."
  },
  "SQUEEZE": {
    title: "SQUEEZE MODE",
    text: "Shows squeeze setup: Squeeze Trigger and Squeeze Target levels."
  },
};

interface TooltipWrapperProps {
  concept: string;
  children: React.ReactNode;
  className?: string;
}

export function TooltipWrapper({ concept, children, className }: TooltipWrapperProps) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const tip = TOOLTIPS[concept];

  if (!tip) return <>{children}</>;

  return (
    <div
      ref={ref}
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none">
          <div className="bg-[#1a1a1a] border border-white/10 rounded px-3 py-2 shadow-xl min-w-[200px] max-w-[260px]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/80 mb-1">{tip.title}</div>
            <div className="text-[10px] leading-relaxed text-white/50">{tip.text}</div>
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-white/10" />
        </div>
      )}
    </div>
  );
}
