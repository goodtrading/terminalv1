import { MarketDataGateway } from "../../market-gateway";
import { getTerminalState } from "../../terminal-state";
import { buildReadOnlyRiskMirrorSnapshot } from "../riskMirror/riskMirrorService";
import type { ReadOnlyRiskMirrorSnapshot } from "../riskMirror/riskMirrorTypes";
import { getOrderBook } from "../orderbookService";
import type { ExecutionContextSnapshot } from "./executionContextTypes";

export type { ExecutionContextSnapshot } from "./executionContextTypes";

function safeNum(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function distancePct(spot: number, level: number): number | undefined {
  if (!Number.isFinite(spot) || spot <= 0 || !Number.isFinite(level) || level <= 0) {
    return undefined;
  }
  return (Math.abs(level - spot) / spot) * 100;
}

function parseGammaRegime(
  raw: string | null | undefined,
): ExecutionContextSnapshot["gamma"]["regime"] {
  const s = String(raw ?? "").toUpperCase();
  if (s.includes("LONG")) return "long_gamma";
  if (s.includes("SHORT")) return "short_gamma";
  if (s.includes("TRANSITION")) return "transition";
  return "unknown";
}

function resolveMarketDataHealth(): ExecutionContextSnapshot["market"]["marketDataHealth"] {
  const now = Date.now();
  const ticker = MarketDataGateway.getCachedTicker();
  const fresh =
    ticker != null &&
    Number.isFinite(ticker.timestamp) &&
    now - ticker.timestamp < 15_000;
  const ob = getOrderBook();
  const levels = ob.bids.length + ob.asks.length;
  if (!fresh && levels < 4) return "error";
  if (!fresh || levels < 10) return "degraded";
  return "healthy";
}

type InstitutionalLevels = {
  spot?: number;
  gamma: ExecutionContextSnapshot["gamma"];
  liquidity: ExecutionContextSnapshot["liquidity"];
  captureWarnings: string[];
};

async function loadInstitutionalLevels(
  spotHint?: number,
): Promise<InstitutionalLevels> {
  const captureWarnings: string[] = [];
  const gamma: ExecutionContextSnapshot["gamma"] = {};
  const liquidity: ExecutionContextSnapshot["liquidity"] = {};
  let spot = spotHint;

  try {
    const state = await getTerminalState();
    const market = state.market as Record<string, unknown> | null | undefined;
    const levels = state.levels as Record<string, unknown> | null | undefined;
    const positioning = state.positioning as Record<string, unknown> | null | undefined;
    const options = state.options as Record<string, unknown> | null | undefined;

    spot =
      spot ??
      safeNum(state.ticker?.price) ??
      safeNum(options?.spot) ??
      safeNum(market?.spotPrice);

    gamma.regime = parseGammaRegime(
      (options?.gammaRegimeLocal as string) ??
        (options?.gammaRegime as string) ??
        (market?.gammaRegime as string),
    );

    const flip =
      safeNum(options?.gammaFlip) ??
      safeNum(market?.gammaFlip) ??
      safeNum(options?.gammaFlipGlobal);
    if (flip != null && flip > 0) gamma.flip = flip;

    const tzLower =
      safeNum(options?.localTransitionZoneStart) ??
      safeNum(market?.transitionZoneStart);
    const tzUpper =
      safeNum(options?.localTransitionZoneEnd) ??
      safeNum(market?.transitionZoneEnd);
    if (tzLower != null || tzUpper != null) {
      gamma.transitionZone = { lower: tzLower, upper: tzUpper };
    }

    const callWall = safeNum(positioning?.callWall) ?? safeNum(options?.callWall);
    const putWall = safeNum(positioning?.putWall) ?? safeNum(options?.putWall);
    const magnets = Array.isArray(levels?.gammaMagnets)
      ? (levels!.gammaMagnets as unknown[])
          .map((m) => safeNum(m))
          .filter((n): n is number => n != null && n > 0)
      : Array.isArray(options?.topMagnets)
        ? (options!.topMagnets as { strike?: number; price?: number }[])
            .map((m) => safeNum(m.strike ?? m.price))
            .filter((n): n is number => n != null && n > 0)
        : [];

    const gammaCandidates: Array<{
      price: number;
      type: "call_wall" | "put_wall" | "gex_magnet" | "unknown";
    }> = [];
    if (callWall != null && callWall > 0) {
      gammaCandidates.push({ price: callWall, type: "call_wall" });
    }
    if (putWall != null && putWall > 0) {
      gammaCandidates.push({ price: putWall, type: "put_wall" });
    }
    for (const m of magnets) {
      gammaCandidates.push({ price: m, type: "gex_magnet" });
    }

    if (gammaCandidates.length > 0 && spot != null && spot > 0) {
      let best = gammaCandidates[0]!;
      let bestDist = distancePct(spot, best.price) ?? Infinity;
      for (const c of gammaCandidates) {
        const d = distancePct(spot, c.price);
        if (d != null && d < bestDist) {
          best = c;
          bestDist = d;
        }
      }
      gamma.nearestMagnet = {
        price: best.price,
        distancePct: Math.round(bestDist * 100) / 100,
        type: best.type,
      };
    } else if (
      !gamma.flip &&
      gamma.regime === "unknown" &&
      !gamma.transitionZone
    ) {
      captureWarnings.push("Gamma context unavailable.");
    }
  } catch {
    captureWarnings.push("Gamma context unavailable.");
  }

  try {
    const ob = getOrderBook();
    const ref = spot;
    if (ref != null && ref > 0 && (ob.bids.length > 0 || ob.asks.length > 0)) {
      const minWallBtc = 5;
      let bestBid: { price: number; size: number } | null = null;
      let bestAsk: { price: number; size: number } | null = null;

      for (const b of ob.bids) {
        if (b.size >= minWallBtc && b.price < ref) {
          if (!bestBid || b.size > bestBid.size) bestBid = b;
        }
      }
      for (const a of ob.asks) {
        if (a.size >= minWallBtc && a.price > ref) {
          if (!bestAsk || a.size > bestAsk.size) bestAsk = a;
        }
      }

      const supports: Array<{ price: number; distancePct: number; source: string }> =
        [];
      const resistances: Array<{
        price: number;
        distancePct: number;
        source: string;
      }> = [];

      if (bestBid) {
        const d = distancePct(ref, bestBid.price);
        if (d != null) {
          supports.push({
            price: bestBid.price,
            distancePct: Math.round(d * 100) / 100,
            source: "orderbook_bid_wall",
          });
        }
      }
      if (bestAsk) {
        const d = distancePct(ref, bestAsk.price);
        if (d != null) {
          resistances.push({
            price: bestAsk.price,
            distancePct: Math.round(d * 100) / 100,
            source: "orderbook_ask_wall",
          });
        }
      }

      if (supports.length) {
        liquidity.nearestSupport = supports.reduce((a, b) =>
          a.distancePct < b.distancePct ? a : b,
        );
      }
      if (resistances.length) {
        liquidity.nearestResistance = resistances.reduce((a, b) =>
          a.distancePct < b.distancePct ? a : b,
        );
      }

      const magnets: Array<{
        price: number;
        sizeBtc: number;
        side: "bid" | "ask";
      }> = [];
      if (bestBid) magnets.push({ price: bestBid.price, sizeBtc: bestBid.size, side: "bid" });
      if (bestAsk) magnets.push({ price: bestAsk.price, sizeBtc: bestAsk.size, side: "ask" });
      if (magnets.length > 0) {
        let nearest = magnets[0]!;
        let nearDist = distancePct(ref, nearest.price) ?? Infinity;
        for (const m of magnets) {
          const d = distancePct(ref, m.price);
          if (d != null && d < nearDist) {
            nearest = m;
            nearDist = d;
          }
        }
        liquidity.nearestMagnet = {
          price: nearest.price,
          distancePct: Math.round(nearDist * 100) / 100,
          side: nearest.side,
          sizeBtc: nearest.sizeBtc,
        };
      }
    } else {
      captureWarnings.push("Liquidity context unavailable.");
    }
  } catch {
    captureWarnings.push("Liquidity context unavailable.");
  }

  return { spot, gamma, liquidity, captureWarnings };
}

function estimateRiskFromStops(
  side: "long" | "short",
  entry: number,
  quantity: number,
  equity: number | undefined,
  stopLoss?: number,
  takeProfit?: number,
): Pick<
  ExecutionContextSnapshot["risk"],
  | "estimatedLossUsdt"
  | "estimatedLossAccountPct"
  | "estimatedGainUsdt"
  | "estimatedGainAccountPct"
> {
  const out: Pick<
    ExecutionContextSnapshot["risk"],
    | "estimatedLossUsdt"
    | "estimatedLossAccountPct"
    | "estimatedGainUsdt"
    | "estimatedGainAccountPct"
  > = {};

  if (entry > 0 && quantity > 0) {
    if (stopLoss != null && stopLoss > 0) {
      const lossPerUnit =
        side === "long" ? entry - stopLoss : stopLoss - entry;
      if (lossPerUnit > 0) {
        out.estimatedLossUsdt = Math.round(lossPerUnit * quantity * 100) / 100;
        if (equity != null && equity > 0) {
          out.estimatedLossAccountPct =
            Math.round((out.estimatedLossUsdt / equity) * 10000) / 100;
        }
      }
    }
    if (takeProfit != null && takeProfit > 0) {
      const gainPerUnit =
        side === "long" ? takeProfit - entry : entry - takeProfit;
      if (gainPerUnit > 0) {
        out.estimatedGainUsdt = Math.round(gainPerUnit * quantity * 100) / 100;
        if (equity != null && equity > 0) {
          out.estimatedGainAccountPct =
            Math.round((out.estimatedGainUsdt / equity) * 10000) / 100;
        }
      }
    }
  }
  return out;
}

function buildInstitutionalDiagnostics(
  side: "long" | "short",
  ctx: Omit<ExecutionContextSnapshot, "diagnostics">,
  captureWarnings: string[],
): ExecutionContextSnapshot["diagnostics"] {
  const warnings: string[] = [...captureWarnings];
  const positives: string[] = [];
  const { risk, gamma, liquidity, market } = ctx;

  if (risk.stopLossDetected) {
    positives.push("Trade has real stop loss protection.");
  } else {
    warnings.push("No stop loss detected.");
  }

  if (risk.takeProfitDetected) {
    positives.push("Take-profit level detected.");
  }

  if (risk.estimatedLossAccountPct != null && risk.estimatedLossAccountPct < 1) {
    positives.push("Risk is below 1% of account.");
  } else if (risk.estimatedLossAccountPct != null && risk.estimatedLossAccountPct > 2) {
    warnings.push("Estimated risk exceeds 2% of account.");
  }

  if (risk.riskMirrorStatus === "aligned") {
    positives.push("Risk Mirror marks context as aligned.");
  } else if (risk.riskMirrorStatus === "conflicted") {
    warnings.push("Position is conflicted with Risk Mirror.");
  } else if (risk.riskMirrorStatus === "danger") {
    warnings.push("Risk Mirror marks context as danger.");
  }

  if (
    risk.distanceToLiquidationPct != null &&
    risk.distanceToLiquidationPct < 7
  ) {
    warnings.push("Liquidation distance is below 7%.");
  }

  if (market.marketDataHealth === "degraded") {
    warnings.push("Market data degraded at capture time.");
  } else if (market.marketDataHealth === "error") {
    warnings.push("Market data unavailable at capture time.");
  }

  const nearPct = 1.2;
  if (side === "long" && liquidity.nearestResistance?.distancePct != null) {
    if (liquidity.nearestResistance.distancePct <= nearPct) {
      warnings.push("Long opened near resistance.");
    }
  }
  if (side === "short" && liquidity.nearestSupport?.distancePct != null) {
    if (liquidity.nearestSupport.distancePct <= nearPct) {
      warnings.push("Short opened near support.");
    }
  }

  if (gamma.flip != null && ctx.market.spotPrice != null) {
    if (side === "long" && ctx.market.spotPrice > gamma.flip) {
      positives.push("Entry is above gamma flip.");
    }
    if (side === "short" && ctx.market.spotPrice < gamma.flip) {
      positives.push("Entry is below gamma flip.");
    }
  }

  const gm = gamma.nearestMagnet;
  if (gm && side === "long" && gm.type === "call_wall" && gm.distancePct <= 1.5) {
    positives.push("Position is aligned with nearest upside gamma magnet.");
  }
  if (gm && side === "short" && gm.type === "put_wall" && gm.distancePct <= 1.5) {
    positives.push("Position is aligned with nearest downside gamma magnet.");
  }

  const lm = liquidity.nearestMagnet;
  if (lm && side === "long" && lm.side === "ask" && lm.distancePct <= 1) {
    positives.push("Nearby ask-side liquidity magnet above spot.");
  }

  let contextAlignment: ExecutionContextSnapshot["diagnostics"]["contextAlignment"] =
    "unknown";

  if (risk.riskMirrorStatus === "danger" || warnings.some((w) => w.includes("Liquidation"))) {
    contextAlignment = "danger";
  } else if (
    risk.riskMirrorStatus === "conflicted" ||
    warnings.some((w) => w.includes("near resistance") || w.includes("near support"))
  ) {
    contextAlignment = "conflicted";
  } else if (
    risk.riskMirrorStatus === "aligned" &&
    risk.stopLossDetected &&
    warnings.length <= captureWarnings.length + 1
  ) {
    contextAlignment = "aligned";
  } else if (risk.riskMirrorStatus === "neutral" || positives.length >= 2) {
    contextAlignment = "neutral";
  }

  const regimeLabel =
    gamma.regime === "long_gamma"
      ? "long gamma"
      : gamma.regime === "short_gamma"
        ? "short gamma"
        : gamma.regime === "transition"
          ? "transition"
          : "unknown gamma";

  const prot = risk.stopLossDetected ? "Protected" : "Unprotected";
  const sideLabel = side === "long" ? "long" : "short";
  const alignLabel = contextAlignment;

  let summary = `${prot} ${sideLabel} with ${regimeLabel} context · alignment ${alignLabel}.`;
  if (ctx.source === "bingx") {
    summary = `${prot} real ${sideLabel}. Risk Mirror ${risk.riskMirrorStatus ?? "unknown"}. ${alignLabel} context.`;
  }
  if (warnings.includes("No stop loss detected.") && ctx.source === "bingx") {
    summary = "Unprotected real position. Risk Mirror marks context as conflicted.";
  }
  if (positives.length >= 2 && contextAlignment === "aligned") {
    summary = `Protected ${sideLabel} with aligned institutional context and nearby structure.`;
  }

  return {
    contextAlignment,
    warnings: Array.from(new Set(warnings)).slice(0, 8),
    positives: Array.from(new Set(positives)).slice(0, 6),
    summary: summary.slice(0, 280),
  };
}

function mergeRiskMirror(
  risk: ExecutionContextSnapshot["risk"],
  mirror: ReadOnlyRiskMirrorSnapshot | null,
): ExecutionContextSnapshot["risk"] {
  if (!mirror) return risk;
  risk.riskMirrorStatus = mirror.score.status;
  risk.riskMirrorConfidence = mirror.score.confidence;
  if (mirror.protection.stopLoss?.triggerPrice != null) {
    risk.stopLossDetected = true;
    risk.stopLossPrice = mirror.protection.stopLoss.triggerPrice;
  }
  if (mirror.protection.takeProfit?.triggerPrice != null) {
    risk.takeProfitDetected = true;
    risk.takeProfitPrice = mirror.protection.takeProfit.triggerPrice;
  }
  if (mirror.position?.liquidationPrice != null) {
    risk.liquidationPrice = mirror.position.liquidationPrice;
    risk.distanceToLiquidationPct = mirror.position.distanceToLiquidationPct;
  }
  return risk;
}

function createUnavailableExecutionContext(params: {
  source: "paper" | "bingx";
  symbol: string;
  side?: "long" | "short";
  entryPrice?: number;
  markPrice?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
}): ExecutionContextSnapshot {
  const symbol = params.symbol.trim() || "BTC-USDT";
  const side = params.side ?? "long";
  const mark = params.markPrice ?? params.entryPrice;
  const hasSl = params.stopLossPrice != null && params.stopLossPrice > 0;
  const hasTp = params.takeProfitPrice != null && params.takeProfitPrice > 0;
  return {
    timestamp: Date.now(),
    symbol,
    source: params.source,
    brokerMode: params.source === "bingx" ? "read-only" : "paper",
    market: {
      markPrice: mark,
      spotPrice: mark,
      marketDataHealth: "unknown",
    },
    gamma: {},
    liquidity: {},
    risk: {
      stopLossDetected: hasSl,
      takeProfitDetected: hasTp,
      stopLossPrice: hasSl ? params.stopLossPrice : undefined,
      takeProfitPrice: hasTp ? params.takeProfitPrice : undefined,
      riskMirrorStatus: "unknown",
    },
    diagnostics: {
      contextAlignment: "unknown",
      warnings: ["Context unavailable — capture failed."],
      positives: [],
      summary: "Context unavailable at capture time.",
    },
  };
}

export async function captureExecutionContext(params: {
  userId?: number;
  source: "paper" | "bingx";
  symbol: string;
  side?: "long" | "short";
  entryPrice?: number;
  markPrice?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  quantity?: number;
  accountEquityUsdt?: number;
  liquidationPrice?: number;
  connectionId?: string;
}): Promise<ExecutionContextSnapshot> {
  try {
    return await captureExecutionContextInner(params);
  } catch (err) {
    console.warn(
      "[execution-context] capture failed",
      params.source,
      err instanceof Error ? err.message : err,
    );
    return createUnavailableExecutionContext(params);
  }
}

async function captureExecutionContextInner(params: {
  userId?: number;
  source: "paper" | "bingx";
  symbol: string;
  side?: "long" | "short";
  entryPrice?: number;
  markPrice?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  quantity?: number;
  accountEquityUsdt?: number;
  liquidationPrice?: number;
  connectionId?: string;
}): Promise<ExecutionContextSnapshot> {
  const symbol = params.symbol.trim() || "BTC-USDT";
  const side = params.side ?? "long";
  const brokerMode = params.source === "bingx" ? "read-only" : "paper";
  const mark = params.markPrice ?? params.entryPrice;
  const entry = params.entryPrice ?? mark;

  const { spot, gamma, liquidity, captureWarnings } = await loadInstitutionalLevels(
    mark ?? entry,
  );

  const marketDataHealth = resolveMarketDataHealth();
  const sl = params.stopLossPrice;
  const tp = params.takeProfitPrice;
  const hasSl = sl != null && sl > 0;
  const hasTp = tp != null && tp > 0;
  const equity = params.accountEquityUsdt;
  const qty = params.quantity ?? 0;

  let risk: ExecutionContextSnapshot["risk"] = {
    stopLossDetected: hasSl,
    takeProfitDetected: hasTp,
    stopLossPrice: hasSl ? sl : undefined,
    takeProfitPrice: hasTp ? tp : undefined,
    liquidationPrice:
      params.liquidationPrice != null && params.liquidationPrice > 0
        ? params.liquidationPrice
        : undefined,
    ...estimateRiskFromStops(side, entry ?? 0, qty, equity, sl, tp),
  };

  if (
    risk.liquidationPrice != null &&
    mark != null &&
    mark > 0 &&
    entry != null &&
    entry > 0
  ) {
    const liqDist =
      side === "long"
        ? ((mark - risk.liquidationPrice) / entry) * 100
        : ((risk.liquidationPrice - mark) / entry) * 100;
    if (Number.isFinite(liqDist) && liqDist >= 0) {
      risk.distanceToLiquidationPct = Math.round(liqDist * 100) / 100;
    }
  }

  if (params.source === "bingx" && params.userId != null && params.connectionId) {
    try {
      const mirror = await buildReadOnlyRiskMirrorSnapshot(
        params.connectionId,
        params.userId,
        symbol,
      );
      risk = mergeRiskMirror(risk, mirror);
    } catch {
      risk.riskMirrorStatus = "unknown";
    }
  }

  const partial: Omit<ExecutionContextSnapshot, "diagnostics"> = {
    timestamp: Date.now(),
    symbol,
    source: params.source,
    brokerMode,
    market: {
      spotPrice: spot,
      markPrice: mark,
      marketDataHealth,
    },
    gamma,
    liquidity,
    risk,
  };

  const diagnostics = buildInstitutionalDiagnostics(side, partial, captureWarnings);

  return { ...partial, diagnostics };
}
