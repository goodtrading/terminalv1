/**
 * Resumen legible para la barra "Estado del mercado" (modo SIMPLE).
 * Los datos reales se derivan del estado del terminal + API de escenarios.
 *
 * Para conectar más señales después: ampliar buildMarketStateSummary() manteniendo MarketStateSummary estable.
 */

import type { MarketState, KeyLevels } from "@shared/schema";

export type MarketStateSummary = {
  bias: string;
  marketType: string;
  keyZone: string;
  scenario: string;
};

/** Escenario estructural (respuesta /api/scenarios) — subset usado aquí. */
export type StructuralScenarioSlice = {
  title: string;
  summary: string;
  regime: string;
  trigger: string;
};

/** Respuesta típica de GET /api/scenarios (subset tipado para esta barra). */
export type StructuralScenariosPayload = {
  marketRegime?: string;
  baseCase: StructuralScenarioSlice;
  altCase: StructuralScenarioSlice;
  volCase: StructuralScenarioSlice;
};

export type StructuralScenariosApi = StructuralScenariosPayload | null;

function fmtK(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return "";
  const k = p / 1000;
  return k >= 100 ? `${Math.round(k)}k` : `${k.toFixed(1)}k`;
}

function fmtRange(lo: number | null | undefined, hi: number | null | undefined): string {
  if (lo != null && hi != null && Number.isFinite(lo) && Number.isFinite(hi) && hi > lo) {
    return `${fmtK(lo)} – ${fmtK(hi)}`;
  }
  if (lo != null && Number.isFinite(lo)) return `~${fmtK(lo)}`;
  if (hi != null && Number.isFinite(hi)) return `~${fmtK(hi)}`;
  return "—";
}

function deriveBias(market: MarketState | null | undefined, positioning: unknown): string {
  // FIXED: Use market.gammaRegime directly to avoid overwrite with fallback bias
  const regime = String(market?.gammaRegime ?? "").toUpperCase();
  console.log("GT_MOBILE_DEBUG: deriveBias USING GAMMA REGIME DIRECTLY", {
    gammaRegime: market?.gammaRegime,
    regime: regime,
    result: regime === "SHORT GAMMA" ? "Bajista" : regime === "LONG GAMMA" ? "Alcista" : "Checking fallback"
  });
  
  if (regime === "SHORT GAMMA") return "Bajista";
  if (regime === "LONG GAMMA") return "Alcista";
  
  // Fallback to positioning only if gammaRegime is not available
  const pos = positioning as Record<string, unknown> | null | undefined;
  const tradeDir = (pos?.tradeDecisionEngine as { tradeDirection?: string } | undefined)?.tradeDirection;
  if (tradeDir === "LONG" || tradeDir === "BUY") return "Alcista";
  if (tradeDir === "SHORT" || tradeDir === "SELL") return "Bajista";

  const inst = String((pos?.institutionalBiasEngine as { institutionalBias?: string } | undefined)?.institutionalBias ?? "");
  if (/bull|long|up/i.test(inst)) return "Alcista";
  if (/bear|short|down/i.test(inst)) return "Bajista";

  console.log("GT_MOBILE_DEBUG: deriveBias FALLBACK TO NEUTRAL", { regime, positioning });
  return "Neutral";
}

function deriveMarketType(market: MarketState | null | undefined): string {
  const r = String(market?.gammaRegime ?? "").toUpperCase();
  if (r === "SHORT GAMMA") return "Short gamma";
  if (r === "LONG GAMMA") return "Long gamma";
  if (r === "TRANSITION" || r.includes("TRANSITION")) return "Transición";
  if (r.length > 0) return r.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return "—";
}

function deriveKeyZone(
  market: MarketState | null | undefined,
  levels: KeyLevels | null | undefined,
  positioning: unknown
): string {
  console.log("GT_MOBILE_DEBUG: deriveKeyZone INPUT:", {
    market: {
      gammaFlip: market?.gammaFlip,
      transitionZoneStart: market?.transitionZoneStart,
      transitionZoneEnd: market?.transitionZoneEnd
    },
    levels: {
      shortGammaPocketStart: levels?.shortGammaPocketStart,
      shortGammaPocketEnd: levels?.shortGammaPocketEnd
    },
    positioning: {
      callWall: (positioning as any)?.callWall,
      putWall: (positioning as any)?.putWall
    }
  });

  const pos = positioning as { callWall?: number; putWall?: number } | null | undefined;

  // PRIORITY 1: Use gammaFlip as primary zone if available
  const gammaFlip = market?.gammaFlip;
  if (gammaFlip != null && Number.isFinite(gammaFlip)) {
    const result = fmtRange(gammaFlip - 50, gammaFlip + 50);
    console.log("GT_MOBILE_DEBUG: deriveKeyZone USING GAMMA FLIP:", { gammaFlip, result });
    return result;
  }

  // PRIORITY 2: Use transition zone
  const ts = market?.transitionZoneStart;
  const te = market?.transitionZoneEnd;
  const range = fmtRange(ts ?? null, te ?? null);
  if (range !== "—") {
    console.log("GT_MOBILE_DEBUG: deriveKeyZone USING TRANSITION ZONE:", { ts, te, result: range });
    return range;
  }

  // PRIORITY 3: Use short gamma pocket
  const sg0 = levels?.shortGammaPocketStart;
  const sg1 = levels?.shortGammaPocketEnd;
  const pocket = fmtRange(sg0 ?? null, sg1 ?? null);
  if (pocket !== "—") {
    console.log("GT_MOBILE_DEBUG: deriveKeyZone USING SHORT GAMMA POCKET:", { sg0, sg1, result: pocket });
    return pocket;
  }

  // PRIORITY 4: Use call/put walls
  const cw = pos?.callWall;
  const pw = pos?.putWall;
  if (cw != null && pw != null && Number.isFinite(cw) && Number.isFinite(pw)) {
    const a = Math.min(cw, pw);
    const b = Math.max(cw, pw);
    const result = fmtRange(a, b);
    console.log("GT_MOBILE_DEBUG: deriveKeyZone USING CALL/PUT WALLS:", { cw, pw, result });
    return result;
  }

  console.log("GT_MOBILE_DEBUG: deriveKeyZone FALLBACK TO DEFAULT");
  return "—";
}

function pickScenario(scenarios: StructuralScenariosApi | null | undefined, active: "BASE" | "ALT" | "VOL"): string {
  if (!scenarios) return "";
  const s = active === "ALT" ? scenarios.altCase : active === "VOL" ? scenarios.volCase : scenarios.baseCase;
  if (!s) return "";
  const raw = [s.title, s.trigger].filter(Boolean).join(" → ");
  const line = raw.trim() || s.summary?.trim() || "";
  if (!line) return "";
  return line.length > 72 ? `${line.slice(0, 69)}…` : line;
}

export function buildMarketStateSummary(params: {
  market: MarketState | null | undefined;
  levels: KeyLevels | null | undefined;
  positioning: unknown;
  scenarios: StructuralScenariosPayload | null | undefined;
  activeScenario: "BASE" | "ALT" | "VOL";
}): MarketStateSummary {
  console.log("GT_MOBILE_DEBUG: buildMarketStateSummary INPUT PARAMS:", params);

  const { market, levels, positioning, scenarios, activeScenario } = params;

  const bias = deriveBias(market, positioning);
  const marketType = deriveMarketType(market);
  const keyZone = deriveKeyZone(market, levels, positioning);
  let scenario = pickScenario(scenarios, activeScenario);

  if (!scenario) {
    scenario =
      scenarios == null
        ? "Escenarios no disponibles"
        : "Seleccioná un escenario en el panel o esperá la próxima actualización.";
  }

  const result = {
    bias,
    marketType,
    keyZone: keyZone === "—" ? "Sin zona destacada" : keyZone,
    scenario,
  };

  console.log("GT_MOBILE_DEBUG: buildMarketStateSummary FINAL RESULT:", {
    bias: result.bias,
    marketType: result.marketType,
    keyZone: result.keyZone,
    scenario: result.scenario,
    rawResult: result
  });

  return result;
}
