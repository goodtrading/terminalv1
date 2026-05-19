import { normalizeLiquidityContext } from "@/lib/normalizeLiquidityContext";
import type { SessionReportLiquidityEvent, SessionLevelHierarchy, SessionTerminalInput } from "./sessionReportTypes";
import { formatPriceShort, isNear, num } from "./sessionReportLevelUtils";
import { isShortGamma } from "./sessionReportGammaUtils";
import { FAR_MAGNET_WARNING } from "./sessionMagnetRules";

export type LiquidityBuildResult = {
  events: SessionReportLiquidityEvent[];
  hasRealFlow: boolean;
  hasStructuralFromLive: boolean;
};

export function buildLiquidityEvents(input: {
  terminal: SessionTerminalInput;
  spot: number | null;
  hierarchy: SessionLevelHierarchy;
  gammaLabel: string;
  vacuumActive: boolean;
}): LiquidityBuildResult {
  const { terminal, spot, hierarchy, gammaLabel, vacuumActive } = input;
  const events: SessionReportLiquidityEvent[] = [];
  const liq = normalizeLiquidityContext(terminal, spot ?? undefined);
  let hasRealFlow = false;

  const push = (e: SessionReportLiquidityEvent) => {
    events.push(e);
  };

  const sweep = liq.sweep;
  if (sweep?.status && sweep.status !== "IDLE" && sweep.status !== "RESOLVED") {
    hasRealFlow = true;
    const dir = sweep.direction === "DOWN" ? "Downside" : sweep.direction === "UP" ? "Upside" : "";
    const lvl = sweep.level != null ? ` near ${formatPriceShort(sweep.level)}` : "";
    push({
      label: `${dir} sweep detected${lvl}`.trim(),
      type: "sweep",
      price: sweep.level,
      importance: sweep.confidence != null && sweep.confidence >= 0.6 ? "high" : "medium",
    });
  }

  if (liq.absorption?.detected) {
    hasRealFlow = true;
    const side =
      liq.absorption.side === "BID"
        ? "bid"
        : liq.absorption.side === "ASK"
          ? "ask"
          : "passive";
    const lvl =
      liq.absorption.level != null ? ` near ${formatPriceShort(liq.absorption.level)}` : "";
    push({
      label: `Passive ${side} absorption${lvl}`,
      type: "absorption",
      price: liq.absorption.level,
      importance:
        liq.absorption.strength === "EXTREME" || liq.absorption.strength === "HIGH"
          ? "high"
          : "medium",
    });
  }

  const voids = liq.liquidityVoids ?? [];
  if (voids.length > 0 || vacuumActive) {
    if (voids.length > 0) {
      hasRealFlow = true;
      const v = liq.nearestVoid ?? voids[0]!;
      const mid = (v.low + v.high) / 2;
      push({
        label:
          spot != null && mid > spot
            ? "Liquidity vacuum above spot"
            : "Liquidity vacuum below spot",
        type: "vacuum",
        price: mid,
        importance: "high",
      });
    } else {
      push({
        label: "Vacuum risk detected: fast repricing possible",
        type: "vacuum",
        importance: "high",
        isStructural: true,
      });
    }
  }

  const wall = liq.nearestWall;
  if (wall?.price != null && wall.side) {
    push({
      label: `Passive liquidity concentration (${wall.side}) near ${formatPriceShort(wall.price)}`,
      type: "pull",
      price: wall.price,
      importance: wall.strength === "EXTREME" || wall.strength === "HIGH" ? "high" : "medium",
    });
  }

  const decision = hierarchy.intradayDecision;
  const active = hierarchy.activeTrading;
  const macro = hierarchy.macroGravity;

  if (macro.price != null) {
    push({
      label: `Macro gravity at ${formatPriceShort(macro.price)} — ${FAR_MAGNET_WARNING}`,
      type: "magnet",
      price: macro.price,
      isStructural: true,
      importance: "low",
    });
  }

  if (spot != null && decision.price != null) {
    push({
      label: `Intraday decision level at ${formatPriceShort(decision.price)} (${decision.type})`,
      type: "flip",
      price: decision.price,
      isStructural: true,
      importance: "high",
    });
  }

  if (active.valid && active.price != null) {
    push({
      label: `Active trading magnet at ${formatPriceShort(active.price)} (${active.direction}, ${active.distanceLabel})`,
      type: "magnet",
      price: active.price,
      isStructural: true,
      importance: "medium",
    });
  }

  if (gammaLabel !== "Unknown" && isShortGamma(gammaLabel)) {
    push({
      label: "Short gamma regime increases sensitivity around liquidity pockets",
      type: "gamma",
      isStructural: true,
      importance: "medium",
    });
  }

  if (spot != null && hierarchy.localFlip != null && isNear(spot, hierarchy.localFlip, 0.5)) {
    const exists = events.some((e) => e.type === "flip" && e.label.includes("decision"));
    if (!exists) {
      push({
        label: "Price testing local gamma flip",
        type: "flip",
        price: hierarchy.localFlip,
        importance: "high",
        isStructural: true,
      });
    }
  }

  const deduped = dedupeEvents(events);
  const hasStructuralFromLive =
    deduped.some((e) => e.isStructural) &&
    (spot != null || decision.price != null || active.price != null || macro.price != null);

  return {
    events: deduped.slice(0, 8),
    hasRealFlow,
    hasStructuralFromLive: hasStructuralFromLive || deduped.length > 0,
  };
}

function dedupeEvents(events: SessionReportLiquidityEvent[]): SessionReportLiquidityEvent[] {
  const seen = new Set<string>();
  const out: SessionReportLiquidityEvent[] = [];
  for (const e of events) {
    const key = `${e.type}:${e.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}
