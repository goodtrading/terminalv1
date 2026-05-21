import { getConnectionForUser } from "../exchanges/bingx/bingxCredentialStore";
import {
  getBingXReadOnlySnapshot,
  type BingXNormalizedPosition,
} from "../exchanges/bingx/bingxReadOnlyService";
import { getOrderBook } from "../orderbookService";
import { getTerminalState } from "../../terminal-state";
import type {
  ReadOnlyRiskMirrorSnapshot,
  RiskMirrorContext,
  RiskMirrorPosition,
  RiskMirrorScore,
  RiskMirrorScoreStatus,
  RiskMirrorWarning,
} from "./riskMirrorTypes";

export type { ReadOnlyRiskMirrorSnapshot } from "./riskMirrorTypes";

function normalizeSymbol(s: string): string {
  return s.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

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

function parseGammaState(raw: string | null | undefined): RiskMirrorContext["gammaState"] {
  const s = String(raw ?? "").toUpperCase();
  if (s.includes("LONG")) return "long_gamma";
  if (s.includes("SHORT")) return "short_gamma";
  if (s.includes("TRANSITION")) return "transition";
  return "unknown";
}

function pickPosition(
  positions: BingXNormalizedPosition[],
  symbol: string,
): BingXNormalizedPosition | null {
  const want = normalizeSymbol(symbol);
  const open = positions.filter(
    (p) => p.side !== "flat" && p.side !== "unknown" && p.quantity > 0,
  );
  if (!open.length) return null;
  const match = open.find((p) => normalizeSymbol(p.symbol).includes(want.slice(0, 6)));
  return match ?? open[0] ?? null;
}

function buildPositionMetrics(
  raw: BingXNormalizedPosition,
  accountEquity?: number,
): RiskMirrorPosition | null {
  const side = raw.side === "short" ? "short" : raw.side === "long" ? "long" : null;
  if (!side) return null;

  const entry = safeNum(raw.entryPrice);
  if (entry == null || entry <= 0) return null;

  const mark = safeNum(raw.markPrice) ?? entry;
  const qty = safeNum(raw.quantity) ?? 0;
  if (qty <= 0) return null;

  const notionalUsdt =
    safeNum(raw.notionalUsdt) ?? (mark > 0 ? qty * mark : qty * entry);
  const unrealizedPnlUsdt = safeNum(raw.unrealizedPnlUsdt);
  const liq = safeNum(raw.liquidationPrice);

  let distanceToLiquidationPct: number | undefined;
  if (liq != null && liq > 0 && mark > 0) {
    distanceToLiquidationPct =
      side === "long"
        ? ((mark - liq) / mark) * 100
        : ((liq - mark) / mark) * 100;
    if (!Number.isFinite(distanceToLiquidationPct) || distanceToLiquidationPct < 0) {
      distanceToLiquidationPct = undefined;
    }
  }

  const distanceToEntryPct =
    side === "long"
      ? ((mark - entry) / entry) * 100
      : ((entry - mark) / entry) * 100;

  let unrealizedPnlAccountPct: number | undefined;
  if (
    unrealizedPnlUsdt != null &&
    accountEquity != null &&
    accountEquity > 0
  ) {
    unrealizedPnlAccountPct = (unrealizedPnlUsdt / accountEquity) * 100;
  }

  return {
    symbol: raw.symbol,
    side,
    quantity: qty,
    entryPrice: entry,
    markPrice: mark > 0 ? mark : undefined,
    liquidationPrice: liq,
    leverage: safeNum(raw.leverage),
    marginMode:
      raw.marginMode === "cross" || raw.marginMode === "isolated"
        ? raw.marginMode
        : "unknown",
    notionalUsdt: Number.isFinite(notionalUsdt) ? notionalUsdt : undefined,
    unrealizedPnlUsdt,
    unrealizedPnlAccountPct:
      unrealizedPnlAccountPct != null && Number.isFinite(unrealizedPnlAccountPct)
        ? Math.round(unrealizedPnlAccountPct * 100) / 100
        : undefined,
    distanceToLiquidationPct:
      distanceToLiquidationPct != null && Number.isFinite(distanceToLiquidationPct)
        ? Math.round(distanceToLiquidationPct * 100) / 100
        : undefined,
    distanceToEntryPct: Number.isFinite(distanceToEntryPct)
      ? Math.round(distanceToEntryPct * 100) / 100
      : undefined,
    roePct: safeNum(raw.roePct),
  };
}

async function loadInstitutionalContext(
  spotPrice: number | undefined,
): Promise<{
  context: RiskMirrorContext;
  warnings: RiskMirrorWarning[];
  contextAvailable: { gamma: boolean; liquidity: boolean };
}> {
  const warnings: RiskMirrorWarning[] = [];
  const context: RiskMirrorContext = { spotPrice };
  let gammaOk = false;
  let liquidityOk = false;

  try {
    const state = await getTerminalState();
    const market = state.market as Record<string, unknown> | null | undefined;
    const levels = state.levels as Record<string, unknown> | null | undefined;
    const positioning = state.positioning as Record<string, unknown> | null | undefined;
    const options = state.options as Record<string, unknown> | null | undefined;

    const spot =
      spotPrice ??
      safeNum(state.ticker?.price) ??
      safeNum(options?.spot) ??
      safeNum(market?.spotPrice);
    if (spot != null && spot > 0) context.spotPrice = spot;

    const gammaRegimeRaw =
      (options?.gammaRegimeLocal as string) ??
      (options?.gammaRegime as string) ??
      (market?.gammaRegime as string);
    context.gammaState = parseGammaState(gammaRegimeRaw);

    const flip =
      safeNum(options?.gammaFlip) ??
      safeNum(market?.gammaFlip) ??
      safeNum(options?.gammaFlipGlobal);
    if (flip != null && flip > 0) context.gammaFlip = flip;

    const tzLower =
      safeNum(options?.localTransitionZoneStart) ??
      safeNum(market?.transitionZoneStart);
    const tzUpper =
      safeNum(options?.localTransitionZoneEnd) ??
      safeNum(market?.transitionZoneEnd);
    if (tzLower != null || tzUpper != null) {
      context.transitionZone = {
        lower: tzLower,
        upper: tzUpper,
      };
    }

    const callWall = safeNum(positioning?.callWall) ?? safeNum(options?.callWall);
    const putWall = safeNum(positioning?.putWall) ?? safeNum(options?.putWall);
    const magnets = Array.isArray(levels?.gammaMagnets)
      ? (levels!.gammaMagnets as unknown[]).map((m) => safeNum(m)).filter((n): n is number => n != null && n > 0)
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

    if (gammaCandidates.length > 0 && context.spotPrice != null && context.spotPrice > 0) {
      gammaOk = true;
      let best = gammaCandidates[0]!;
      let bestDist = distancePct(context.spotPrice, best.price) ?? Infinity;
      for (const c of gammaCandidates) {
        const d = distancePct(context.spotPrice, c.price);
        if (d != null && d < bestDist) {
          best = c;
          bestDist = d;
        }
      }
      context.nearestGammaMagnet = {
        price: best.price,
        distancePct: Math.round(bestDist * 100) / 100,
        type: best.type ?? "unknown",
      };
    } else if (
      context.gammaFlip != null ||
      context.gammaState !== "unknown" ||
      context.transitionZone
    ) {
      gammaOk = true;
    }

    if (!gammaOk) {
      warnings.push({
        id: "gamma_context_unavailable",
        severity: "info",
        title: "Gamma context",
        message: "Gamma context unavailable.",
        source: "gamma",
      });
    }
  } catch {
    warnings.push({
      id: "gamma_context_unavailable",
      severity: "info",
      title: "Gamma context",
      message: "Gamma context unavailable.",
      source: "gamma",
    });
  }

  try {
    const ob = getOrderBook();
    const ref = context.spotPrice;
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

      const supports: Array<{ price: number; distancePct: number; source: string }> = [];
      const resistances: Array<{ price: number; distancePct: number; source: string }> = [];

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

      if (bestBid || bestAsk) {
        liquidityOk = true;
        const magnets: Array<{
          price: number;
          sizeBtc: number;
          side: "bid" | "ask";
        }> = [];
        if (bestBid) magnets.push({ ...bestBid, side: "bid" });
        if (bestAsk) magnets.push({ ...bestAsk, side: "ask" });
        let nearest = magnets[0]!;
        let nearDist = distancePct(ref, nearest.price) ?? Infinity;
        for (const m of magnets) {
          const d = distancePct(ref, m.price);
          if (d != null && d < nearDist) {
            nearest = m;
            nearDist = d;
          }
        }
        context.nearestLiquidityMagnet = {
          price: nearest.price,
          distancePct: Math.round(nearDist * 100) / 100,
          side: nearest.side,
          sizeBtc: nearest.sizeBtc,
        };
      }

      if (supports.length) {
        context.nearestSupport = supports.reduce((a, b) =>
          a.distancePct < b.distancePct ? a : b,
        );
      }
      if (resistances.length) {
        context.nearestResistance = resistances.reduce((a, b) =>
          a.distancePct < b.distancePct ? a : b,
        );
      }
    }

    if (!liquidityOk) {
      warnings.push({
        id: "liquidity_context_unavailable",
        severity: "info",
        title: "Liquidity context",
        message: "Liquidity context unavailable.",
        source: "liquidity",
      });
    }
  } catch {
    warnings.push({
      id: "liquidity_context_unavailable",
      severity: "info",
      title: "Liquidity context",
      message: "Liquidity context unavailable.",
      source: "liquidity",
    });
  }

  return {
    context,
    warnings,
    contextAvailable: { gamma: gammaOk, liquidity: liquidityOk },
  };
}

function computeScore(
  position: RiskMirrorPosition | null,
  context: RiskMirrorContext,
  warnings: RiskMirrorWarning[],
): RiskMirrorScore {
  if (!position) {
    return {
      status: "unknown",
      confidence: 0,
      summary: "No real BingX position open.",
    };
  }

  const hasDanger = warnings.some((w) => w.severity === "danger");
  if (hasDanger) {
    return {
      status: "danger",
      confidence: 75,
      summary: "Position risk elevated — review liquidation and account drawdown.",
    };
  }

  const spot = context.spotPrice ?? position.markPrice ?? position.entryPrice;
  const flip = context.gammaFlip;
  const gamma = context.gammaState ?? "unknown";
  let conflictPoints = 0;
  let alignPoints = 0;
  let dataPoints = 0;

  if (flip != null && spot > 0) {
    dataPoints += 1;
    if (position.side === "long" && spot > flip) alignPoints += 1;
    if (position.side === "long" && spot < flip && gamma === "short_gamma") {
      conflictPoints += 1;
    }
    if (position.side === "short" && spot < flip) alignPoints += 1;
    if (position.side === "short" && spot > flip && gamma === "long_gamma") {
      conflictPoints += 1;
    }
  }

  const res = context.nearestResistance;
  const sup = context.nearestSupport;
  const magnet = context.nearestGammaMagnet;
  const liqMag = context.nearestLiquidityMagnet;

  if (position.side === "long") {
    if (res != null && res.distancePct < 1.5) conflictPoints += 1;
    if (sup != null && sup.distancePct > 3) alignPoints += 1;
    if (magnet != null && magnet.price > spot && magnet.distancePct < 2) {
      conflictPoints += 1;
    }
    if (liqMag != null && liqMag.side === "ask" && liqMag.sizeBtc != null && liqMag.sizeBtc >= 20 && liqMag.distancePct < 1.5) {
      conflictPoints += 1;
    }
  } else {
    if (sup != null && sup.distancePct < 1.5) conflictPoints += 1;
    if (res != null && res.distancePct > 3) alignPoints += 1;
    if (magnet != null && magnet.price < spot && magnet.distancePct < 2) {
      conflictPoints += 1;
    }
    if (liqMag != null && liqMag.side === "bid" && liqMag.sizeBtc != null && liqMag.sizeBtc >= 20 && liqMag.distancePct < 1.5) {
      conflictPoints += 1;
    }
  }

  if (
    position.distanceToLiquidationPct != null &&
    position.distanceToLiquidationPct < 3
  ) {
    conflictPoints += 2;
  } else if (
    position.distanceToLiquidationPct != null &&
    position.distanceToLiquidationPct >= 7
  ) {
    alignPoints += 1;
  }

  let status: RiskMirrorScoreStatus = "neutral";
  let confidence = 35;

  if (dataPoints === 0 && !magnet && !res && !sup) {
    return {
      status: "neutral",
      confidence: 25,
      summary: "Position open — institutional context limited; risk metrics only.",
    };
  }

  if (conflictPoints >= 2) {
    status = "conflicted";
    confidence = Math.min(85, 45 + conflictPoints * 12);
  } else if (alignPoints >= 2 && conflictPoints === 0) {
    status = "aligned";
    confidence = Math.min(80, 40 + alignPoints * 10);
  } else {
    status = "neutral";
    confidence = 45;
  }

  const summary =
    status === "aligned"
      ? `${position.side.toUpperCase()} context appears broadly aligned with terminal structure (read-only).`
      : status === "conflicted"
        ? `${position.side.toUpperCase()} context shows tension vs gamma/liquidity structure (read-only).`
        : `${position.side.toUpperCase()} — mixed institutional context; monitor risk levels (read-only).`;

  return { status, confidence, summary };
}

function buildPositionWarnings(position: RiskMirrorPosition): RiskMirrorWarning[] {
  const out: RiskMirrorWarning[] = [];

  if (position.distanceToLiquidationPct != null) {
    if (position.distanceToLiquidationPct < 3) {
      out.push({
        id: "liq_distance_critical",
        severity: "danger",
        title: "Liquidation proximity",
        message: `Distance to liquidation ~${position.distanceToLiquidationPct.toFixed(1)}% — elevated risk.`,
        source: "position",
      });
    } else if (position.distanceToLiquidationPct < 7) {
      out.push({
        id: "liq_distance_warn",
        severity: "warning",
        title: "Liquidation proximity",
        message: `Distance to liquidation ~${position.distanceToLiquidationPct.toFixed(1)}%.`,
        source: "position",
      });
    }
  } else if (position.liquidationPrice == null) {
    out.push({
      id: "liq_unavailable",
      severity: "info",
      title: "Liquidation",
      message: "Liquidation price unavailable from read-only sync.",
      source: "position",
    });
  }

  if (position.leverage != null && position.leverage >= 20) {
    out.push({
      id: "high_leverage",
      severity: "warning",
      title: "Leverage",
      message: `Leverage ${position.leverage}x — elevated notional risk.`,
      source: "position",
    });
  }

  if (position.unrealizedPnlAccountPct != null) {
    if (position.unrealizedPnlAccountPct <= -5) {
      out.push({
        id: "account_drawdown_danger",
        severity: "danger",
        title: "Account uPnL",
        message: `Unrealized PnL ~${position.unrealizedPnlAccountPct.toFixed(1)}% of equity.`,
        source: "position",
      });
    } else if (position.unrealizedPnlAccountPct <= -2) {
      out.push({
        id: "account_drawdown_warn",
        severity: "warning",
        title: "Account uPnL",
        message: `Unrealized PnL ~${position.unrealizedPnlAccountPct.toFixed(1)}% of equity.`,
        source: "position",
      });
    }
  }

  return out;
}

export async function buildReadOnlyRiskMirrorSnapshot(
  connectionId: string,
  userId: number,
  symbol: string,
): Promise<ReadOnlyRiskMirrorSnapshot> {
  const sym = symbol.trim() || "BTC-USDT";
  const conn = getConnectionForUser(connectionId, userId);
  if (!conn) {
    return {
      timestamp: Date.now(),
      exchange: "bingx",
      mode: "read-only",
      tradingLocked: true,
      symbol: sym,
      account: {},
      position: null,
      context: {},
      warnings: [
        {
          id: "connection_not_found",
          severity: "warning",
          title: "Connection",
          message: "BingX connection not found for this user.",
          source: "security",
        },
      ],
      score: {
        status: "unknown",
        confidence: 0,
        summary: "Unable to load risk mirror — connection invalid.",
      },
    };
  }

  const bingx = await getBingXReadOnlySnapshot(connectionId, userId, sym);
  const account = {
    equityUsdt: bingx.account?.equityUsdt,
    balanceUsdt: bingx.account?.balanceUsdt,
    availableMarginUsdt: bingx.account?.availableMarginUsdt,
  };

  const rawPos = pickPosition(bingx.positions, sym);
  const position = rawPos
    ? buildPositionMetrics(rawPos, account.equityUsdt)
    : null;

  const { context, warnings: ctxWarnings } = await loadInstitutionalContext(
    position?.markPrice,
  );

  const warnings: RiskMirrorWarning[] = [...ctxWarnings];
  if (position) {
    warnings.push(...buildPositionWarnings(position));
  }

  warnings.push({
    id: "trading_locked",
    severity: "info",
    title: "Execution locked",
    message: "Live trading is disabled. This panel is read-only analysis only.",
    source: "security",
  });

  if (bingx.error) {
    warnings.push({
      id: "bingx_sync_degraded",
      severity: "warning",
      title: "BingX sync",
      message: bingx.error.message,
      source: "market_data",
    });
  }

  const score = computeScore(position, context, warnings);

  return {
    timestamp: Date.now(),
    exchange: "bingx",
    mode: "read-only",
    tradingLocked: true,
    symbol: sym,
    account,
    position,
    context,
    warnings,
    score,
  };
}
