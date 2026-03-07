import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLearnMode } from "@/hooks/useLearnMode";

interface ConceptEntry {
  title: string;
  definition: string;
  interpretation: string;
  tradingUse: string;
}

const CONCEPTS: Record<string, ConceptEntry> = {
  "Call Wall": {
    title: "CALL WALL",
    definition: "Large concentration of call open interest at a specific strike price.",
    interpretation: "Dealers short these calls hedge by selling spot as price rises toward the wall, creating dynamic resistance.",
    tradingUse: "Watch for absorption or rejection at this level. A clean break above signals dealer repositioning and potential acceleration.",
  },
  "Put Wall": {
    title: "PUT WALL",
    definition: "Large concentration of put open interest at a specific strike price.",
    interpretation: "Dealers long these puts hedge by buying spot as price drops toward the wall, creating dynamic support.",
    tradingUse: "Expect bids to appear near this level. A break below may trigger dealer de-hedging and accelerate selling.",
  },
  "Gamma Flip": {
    title: "GAMMA FLIP",
    definition: "Price level where aggregate dealer gamma exposure crosses from positive to negative.",
    interpretation: "Above this level, dealers stabilize price (long gamma). Below it, dealers amplify moves (short gamma).",
    tradingUse: "Key regime boundary. Price crossing this level changes the entire market dynamic. Trade mean-reversion above, momentum below.",
  },
  "Gamma Regime": {
    title: "GAMMA REGIME",
    definition: "Current state of aggregate dealer gamma exposure across all strikes.",
    interpretation: "LONG GAMMA means dealers hedge against moves, dampening volatility. SHORT GAMMA means dealer hedging amplifies moves.",
    tradingUse: "In long gamma, fade extremes and expect range-bound action. In short gamma, trade with momentum and expect larger swings.",
  },
  "Magnet": {
    title: "GAMMA MAGNET",
    definition: "Strike with exceptionally high open interest that attracts price through dealer hedging flows.",
    interpretation: "Magnets act as gravitational centers. Price tends to drift toward them during low-volatility periods.",
    tradingUse: "Use as mean-reversion targets. Price near a magnet often consolidates. Strong moves away from magnets may reverse.",
  },
  "Cliff": {
    title: "GAMMA CLIFF",
    definition: "Price zone where gamma exposure drops sharply, creating a sudden change in dealer hedging behavior.",
    interpretation: "Crossing a cliff means dealers rapidly shift hedging, potentially triggering accelerated moves.",
    tradingUse: "Be cautious near cliffs. They mark boundaries where stable price action can suddenly become volatile.",
  },
  "Dealer Pivot": {
    title: "DEALER PIVOT",
    definition: "Calculated level where net dealer hedging flow shifts direction based on current positioning.",
    interpretation: "Above pivot, dealers tend to sell rallies. Below pivot, dealers tend to buy dips.",
    tradingUse: "Use as a directional bias filter. Price above pivot favors longs, below favors shorts.",
  },
  "Sweep Zone": {
    title: "SWEEP ZONE",
    definition: "Price range where concentrated resting liquidity exists and may be rapidly consumed.",
    interpretation: "When price enters this zone, stop orders and resting limits can trigger a cascade of fills, accelerating the move.",
    tradingUse: "Expect fast, directional moves through sweep zones. Avoid fading price inside the zone. Wait for resolution on the other side.",
  },
  "Sweep Trigger": {
    title: "SWEEP TRIGGER",
    definition: "Specific price level that may initiate a liquidity sweep event.",
    interpretation: "Breaking this level can activate a chain reaction of stop-losses and forced liquidations.",
    tradingUse: "Monitor for a decisive break. If triggered, expect follow-through in the sweep direction.",
  },
  "Bid Liquidity": {
    title: "BID LIQUIDITY",
    definition: "Resting buy orders visible in the order book at a specific price zone.",
    interpretation: "Represents passive demand. Large bid clusters may support price temporarily but can be pulled.",
    tradingUse: "Use as soft support reference. Watch for absorption (bids holding) vs spoofing (bids pulling on approach).",
  },
  "Ask Liquidity": {
    title: "ASK LIQUIDITY",
    definition: "Resting sell orders visible in the order book at a specific price zone.",
    interpretation: "Represents passive supply. Large ask clusters may cap price temporarily but can be pulled.",
    tradingUse: "Use as soft resistance reference. Watch for absorption (asks holding) vs spoofing (asks pulling on approach).",
  },
  "Void": {
    title: "LIQUIDITY VOID",
    definition: "Price zone with minimal resting orders in the order book.",
    interpretation: "Price can move quickly through voids due to lack of opposing liquidity. Low friction zone.",
    tradingUse: "Expect fast price movement through voids. Do not expect price to hold or reverse in these areas.",
  },
  "Pocket": {
    title: "LIQUIDATION POCKET",
    definition: "Price zone where concentrated stop-losses or liquidation orders are likely clustered.",
    interpretation: "If price reaches a pocket, forced selling or buying can create a rapid acceleration.",
    tradingUse: "Be aware of pockets as potential cascade zones. Price reaching a pocket often overshoots before reversing.",
  },
  "Long Gamma": {
    title: "LONG GAMMA",
    definition: "Market regime where dealers are net long gamma — their hedging dampens volatility.",
    interpretation: "Dealers sell rallies and buy dips, creating a stabilizing effect that compresses price ranges.",
    tradingUse: "Fade extremes, trade mean-reversion. Expect contained ranges and gravitational pull toward magnets.",
  },
  "Short Gamma": {
    title: "SHORT GAMMA",
    definition: "Market regime where dealers are net short gamma — their hedging amplifies volatility.",
    interpretation: "Dealers buy rallies and sell dips, reinforcing momentum and expanding price ranges.",
    tradingUse: "Trade with momentum. Expect larger moves, wider ranges, and potential for acceleration events.",
  },
  "Dealer Hedging Flow": {
    title: "DEALER HEDGING FLOW",
    definition: "Estimated direction and intensity of dealer delta-hedging activity based on current gamma exposure.",
    interpretation: "Shows whether dealers are likely net buying or selling, and how aggressively.",
    tradingUse: "Align trades with hedging flow direction. Strong hedging flow can support or resist price moves.",
  },
  "Vol Expansion": {
    title: "VOLATILITY EXPANSION",
    definition: "State where implied or realized volatility is increasing, suggesting larger price moves ahead.",
    interpretation: "Often precedes a breakout or trend move. Gamma exposure may shift as volatility rises.",
    tradingUse: "Widen stops, reduce position size, and prepare for momentum trades. Avoid mean-reversion strategies.",
  },
  "Transition Zone": {
    title: "TRANSITION ZONE",
    definition: "Price range surrounding the gamma flip where dealer behavior transitions between regimes.",
    interpretation: "Inside this zone, dealer hedging is mixed. Market behavior is uncertain and can shift rapidly.",
    tradingUse: "Reduce position size in the transition zone. Wait for a clear break in either direction before committing.",
  },
  "Squeeze Risk": {
    title: "SQUEEZE RISK",
    definition: "Probability that hedging flows and liquidity conditions will force a rapid, directional price move.",
    interpretation: "High squeeze risk means leveraged positions and gamma exposure are aligned for a potential cascade.",
    tradingUse: "In high squeeze conditions, avoid counter-trend positions. If triggered, trade in the squeeze direction.",
  },
  "Structure": {
    title: "MARKET STRUCTURE",
    definition: "High-level market mode derived from gamma positioning, volatility state, and institutional bias.",
    interpretation: "Summarizes whether the market favors range-bound, trending, or volatile conditions.",
    tradingUse: "Use as a regime filter for strategy selection. Match your approach to the current structure.",
  },
  "Volatility": {
    title: "VOLATILITY STATE",
    definition: "Current volatility environment derived from options pricing and realized move analysis.",
    interpretation: "LOW means stable, contained price action. HIGH means larger moves and increased risk.",
    tradingUse: "Adjust position sizing and strategy based on vol state. Tighter ranges in low vol, wider stops in high vol.",
  },
  "Dealers": {
    title: "DEALER CONTEXT",
    definition: "Summary of current dealer gamma positioning and its expected effect on price dynamics.",
    interpretation: "Shows whether dealers are likely stabilizing or amplifying price moves.",
    tradingUse: "Align your bias with dealer positioning. Dealers in long gamma favor mean-reversion; short gamma favors momentum.",
  },
  "LEVELS": {
    title: "LEVELS MODE",
    definition: "Chart overlay showing key structural levels from options positioning.",
    interpretation: "Displays Call Wall, Put Wall, Gamma Magnets, and Dealer Pivot — the primary support and resistance levels derived from options data.",
    tradingUse: "Use these levels as your primary reference grid for entries, exits, and stop placement.",
  },
  "GAMMA": {
    title: "GAMMA MODE",
    definition: "Chart overlay showing gamma structure and regime boundaries.",
    interpretation: "Displays Gamma Flip, Transition Zone, and strongest Gamma Cliffs that define regime change points.",
    tradingUse: "Monitor the flip level as the key regime boundary. Cliffs mark where hedging dynamics change sharply.",
  },
  "CASCADE": {
    title: "CASCADE MODE",
    definition: "Chart overlay showing liquidation cascade risk zones.",
    interpretation: "Displays Cascade Trigger and Liquidation Pocket — zones where forced selling or buying may amplify moves.",
    tradingUse: "Be aware of cascade zones when managing risk. Price entering these zones often overshoots.",
  },
  "SQUEEZE": {
    title: "SQUEEZE MODE",
    definition: "Chart overlay showing squeeze probability and target zones.",
    interpretation: "Displays Squeeze Trigger and Squeeze Target — levels where leveraged positions may be forced to unwind.",
    tradingUse: "High squeeze probability near the trigger suggests a potential rapid move toward the target.",
  },
  "HEATMAP": {
    title: "HEATMAP MODE",
    definition: "Chart overlay showing real-time order book liquidity density.",
    interpretation: "BID zones (green) show resting demand, ASK zones (red) show resting supply. Purple marks gamma-liquidity confluence.",
    tradingUse: "Use to identify where real liquidity sits. Confluence zones (gamma + liquidity) are the highest-conviction levels.",
  },
};

interface TooltipWrapperProps {
  concept: string;
  children: React.ReactNode;
  className?: string;
}

export function TooltipWrapper({ concept, children, className }: TooltipWrapperProps) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const { learnMode } = useLearnMode();
  const tip = CONCEPTS[concept];

  if (!tip || !learnMode) return <>{children}</>;

  const handleEnter = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ x: rect.left + rect.width / 2, y: rect.top, w: rect.width, h: rect.height });
    }
    setShow(true);
  }, []);

  const handleLeave = useCallback(() => {
    setShow(false);
  }, []);

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
        <TooltipPanel tip={tip} anchor={pos} />,
        document.body
      )}
    </>
  );
}

function TooltipPanel({ tip, anchor }: { tip: ConceptEntry; anchor: { x: number; y: number; w: number; h: number } }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const TIP_W = 320;
  const MARGIN = 12;

  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  let left = anchor.x - TIP_W / 2;
  let placeBelow = false;

  if (left < MARGIN) left = MARGIN;
  if (left + TIP_W > vw - MARGIN) left = vw - MARGIN - TIP_W;

  if (anchor.y < 200) {
    placeBelow = true;
  }

  const top = placeBelow
    ? anchor.y + anchor.h + 8
    : anchor.y - 8;

  return (
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        left,
        top,
        transform: placeBelow ? "translateY(0)" : "translateY(-100%)",
        zIndex: 2000,
        pointerEvents: "none",
        width: TIP_W,
      }}
    >
      <div style={{
        background: "rgba(12, 12, 14, 0.96)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 6,
        padding: "10px 14px",
        boxShadow: "0 12px 40px rgba(0,0,0,0.7)",
        maxHeight: "60vh",
        overflowY: "auto",
        wordWrap: "break-word",
        whiteSpace: "normal",
      }}>
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: "rgba(96, 165, 250, 0.9)",
          marginBottom: 8,
          fontFamily: "JetBrains Mono, monospace",
        }}>
          {tip.title}
        </div>

        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(255,255,255,0.35)", marginBottom: 3, fontFamily: "JetBrains Mono, monospace" }}>Definition</div>
          <div style={{ fontSize: 11, lineHeight: 1.55, color: "rgba(255,255,255,0.65)" }}>{tip.definition}</div>
        </div>

        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(255,255,255,0.35)", marginBottom: 3, fontFamily: "JetBrains Mono, monospace" }}>Interpretation</div>
          <div style={{ fontSize: 11, lineHeight: 1.55, color: "rgba(255,255,255,0.55)" }}>{tip.interpretation}</div>
        </div>

        <div>
          <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(255,255,255,0.35)", marginBottom: 3, fontFamily: "JetBrains Mono, monospace" }}>How to trade it</div>
          <div style={{ fontSize: 11, lineHeight: 1.55, color: "rgba(255,255,255,0.5)" }}>{tip.tradingUse}</div>
        </div>
      </div>

      <div style={{
        width: 0,
        height: 0,
        borderLeft: "6px solid transparent",
        borderRight: "6px solid transparent",
        ...(placeBelow
          ? { borderBottom: "6px solid rgba(255,255,255,0.1)", transform: "rotate(180deg)" }
          : { borderTop: "6px solid rgba(255,255,255,0.1)" }
        ),
        margin: "0 auto",
      }} />
    </div>
  );
}

export function LearnHelper({ text }: { text: string }) {
  const { learnMode } = useLearnMode();
  if (!learnMode) return null;
  return (
    <div className="text-[9px] text-white/30 italic leading-relaxed mt-1 pl-0.5">{text}</div>
  );
}
