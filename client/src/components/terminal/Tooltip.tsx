import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLearnMode } from "@/hooks/useLearnMode";

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
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const { learnMode } = useLearnMode();
  const tip = TOOLTIPS[concept];

  if (!tip || !learnMode) return <>{children}</>;

  const handleEnter = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ x: rect.left + rect.width / 2, y: rect.top });
    }
    setShow(true);
  };

  const handleLeave = () => {
    setShow(false);
  };

  return (
    <>
      <span
        ref={triggerRef}
        className={className}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        style={{ cursor: "help", position: "relative", zIndex: 10, pointerEvents: "auto" }}
      >
        {children}
      </span>
      {show && pos && createPortal(
        <div
          style={{
            position: "fixed",
            left: pos.x,
            top: pos.y,
            transform: "translate(-50%, -100%)",
            zIndex: 2000,
            pointerEvents: "none",
            paddingBottom: 6,
          }}
        >
          <div style={{
            background: "#1a1a1a",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 4,
            padding: "8px 12px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
            minWidth: 200,
            maxWidth: 260,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.8)", marginBottom: 4 }}>{tip.title}</div>
            <div style={{ fontSize: 10, lineHeight: 1.5, color: "rgba(255,255,255,0.5)" }}>{tip.text}</div>
          </div>
          <div style={{
            width: 0,
            height: 0,
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderTop: "5px solid rgba(255,255,255,0.12)",
            margin: "0 auto",
          }} />
        </div>,
        document.body
      )}
    </>
  );
}

export function LearnHelper({ text }: { text: string }) {
  const { learnMode } = useLearnMode();
  if (!learnMode) return null;
  return (
    <div className="text-[9px] text-white/30 italic leading-relaxed mt-1 pl-0.5">{text}</div>
  );
}
