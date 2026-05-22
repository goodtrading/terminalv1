import type { ExecutionContextSnapshot } from "./executionContextTypes";
import type {
  ExecutionPlaybookId,
  ExecutionPlaybookMatch,
  PlaybookMatchResult,
} from "./playbookMatchTypes";

const PLAYBOOK_NAMES: Record<ExecutionPlaybookId, string> = {
  sweep_absorption: "Sweep + Absorption",
  gamma_magnet_continuation: "Gamma Magnet Continuation",
  flip_rejection: "Flip Rejection",
  liquidity_vacuum: "Liquidity Vacuum",
  failed_auction: "Failed Auction",
  absorption_scalp: "Absorption Scalp",
  no_match: "No Playbook Match",
};

type MatchParams = {
  side: "long" | "short";
  entryPrice?: number;
  context: ExecutionContextSnapshot;
  source: "paper" | "bingx";
};

function refPrice(p: MatchParams): number | undefined {
  const e = p.entryPrice;
  if (e != null && Number.isFinite(e) && e > 0) return e;
  const m = p.context.market.markPrice ?? p.context.market.spotPrice;
  return m != null && m > 0 ? m : undefined;
}

function rmOk(ctx: ExecutionContextSnapshot): boolean {
  const s = ctx.risk.riskMirrorStatus;
  return s === "aligned" || s === "neutral";
}

function clampConf(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function buildMatch(
  id: ExecutionPlaybookId,
  confidence: number,
  status: ExecutionPlaybookMatch["status"],
  directionBias: ExecutionPlaybookMatch["directionBias"],
  reasons: string[],
  warnings: string[],
  invalidations: string[],
  tags: string[],
): ExecutionPlaybookMatch {
  return {
    id,
    name: PLAYBOOK_NAMES[id],
    confidence: clampConf(confidence),
    status,
    directionBias,
    reasons: reasons.slice(0, 6),
    warnings: warnings.slice(0, 5),
    invalidations: invalidations.slice(0, 4),
    tags,
  };
}

function scoreSweepAbsorption(p: MatchParams): ExecutionPlaybookMatch | null {
  const { side, context: ctx } = p;
  const price = refPrice(p);
  if (price == null) return null;

  const sup = ctx.liquidity.nearestSupport;
  const res = ctx.liquidity.nearestResistance;
  const lm = ctx.liquidity.nearestMagnet;
  const reasons: string[] = [];
  const warnings: string[] = ["Absorption confirmation unavailable."];
  const invalidations: string[] = [];
  let score = 0;

  if (side === "long") {
    if (sup && sup.distancePct <= 1.8) {
      score += 28;
      reasons.push("Entry near nearest support.");
    }
    if (lm?.side === "bid" && lm.distancePct <= 1.5) {
      score += 22;
      reasons.push("Bid-side liquidity magnet nearby.");
    }
    if ((ctx.diagnostics?.positives ?? []).some((x) => x.toLowerCase().includes("support"))) {
      score += 10;
    }
  } else {
    if (res && res.distancePct <= 1.8) {
      score += 28;
      reasons.push("Entry near nearest resistance.");
    }
    if (lm?.side === "ask" && lm.distancePct <= 1.5) {
      score += 22;
      reasons.push("Ask-side liquidity magnet nearby.");
    }
  }

  if (rmOk(ctx)) {
    score += 12;
    reasons.push("Risk Mirror aligned or neutral.");
  } else if (ctx.risk.riskMirrorStatus === "conflicted") {
    score -= 15;
    invalidations.push("Risk Mirror conflicted.");
  }

  if (ctx.risk.stopLossDetected) {
    score += 14;
    reasons.push("Stop-loss detected.");
  } else {
    score -= 12;
    invalidations.push("No stop-loss on entry.");
  }

  if (ctx.market.marketDataHealth === "healthy") score += 6;

  if (score < 25) return null;

  const status: ExecutionPlaybookMatch["status"] =
    score >= 70 ? "matched" : "partial";
  const tags =
    status === "matched" && ctx.risk.stopLossDetected
      ? ["structural", "level_reaction"]
      : ["partial_structure"];

  return buildMatch(
    "sweep_absorption",
    score,
    status,
    side,
    reasons,
    warnings,
    invalidations,
    tags,
  );
}

function scoreGammaMagnetContinuation(p: MatchParams): ExecutionPlaybookMatch | null {
  const { side, context: ctx } = p;
  const price = refPrice(p);
  const gm = ctx.gamma.nearestMagnet;
  if (price == null || !gm) return null;

  const reasons: string[] = [];
  const warnings: string[] = [];
  const invalidations: string[] = [];
  let score = 0;

  const magnetAbove = gm.price > price;
  const magnetBelow = gm.price < price;

  if (side === "long" && magnetAbove && gm.distancePct <= 2.5) {
    score += 35;
    reasons.push("Upside gamma magnet above entry.");
  } else if (side === "short" && magnetBelow && gm.distancePct <= 2.5) {
    score += 35;
    reasons.push("Downside gamma magnet below entry.");
  } else {
    return null;
  }

  if (gm.distancePct <= 0.5) {
    invalidations.push("Magnet already reached.");
    score -= 20;
  }

  const res = ctx.liquidity.nearestResistance;
  const sup = ctx.liquidity.nearestSupport;
  if (side === "long" && res && res.distancePct <= 1) {
    warnings.push("Opposing resistance nearby.");
    score -= 12;
  }
  if (side === "short" && sup && sup.distancePct <= 1) {
    warnings.push("Opposing support nearby.");
    score -= 12;
  }

  if (rmOk(ctx)) {
    score += 14;
    reasons.push("Risk Mirror neutral or aligned.");
  }
  if (ctx.risk.stopLossDetected) {
    score += 12;
    reasons.push("SL detected.");
  } else {
    score -= 10;
  }

  if (ctx.gamma.regime === "short_gamma" && side === "long") {
    score += 8;
    reasons.push("Short gamma favors upside expansion.");
  }
  if (ctx.gamma.regime === "short_gamma" && side === "short") {
    score += 8;
    reasons.push("Short gamma favors downside expansion.");
  }
  if (!ctx.gamma.regime || ctx.gamma.regime === "unknown") {
    warnings.push("Gamma context unavailable.");
    score -= 8;
  }

  if (ctx.market.marketDataHealth !== "healthy") {
    score -= 10;
  } else {
    score += 5;
  }

  if (score < 30) return null;

  const status = score >= 68 ? "matched" : "partial";
  return buildMatch(
    "gamma_magnet_continuation",
    score,
    status,
    side,
    reasons,
    warnings,
    invalidations,
    status === "matched" ? ["structural", "gamma"] : ["partial_gamma"],
  );
}

function scoreFlipRejection(p: MatchParams): ExecutionPlaybookMatch | null {
  const { side, context: ctx } = p;
  const price = refPrice(p);
  const flip = ctx.gamma.flip;
  if (price == null || flip == null || flip <= 0) return null;

  const distPct = (Math.abs(price - flip) / flip) * 100;
  if (distPct > 1.8) return null;

  const reasons: string[] = [`Entry within ${distPct.toFixed(2)}% of gamma flip.`];
  const warnings: string[] = [];
  const invalidations: string[] = [];
  let score = 40;

  if (distPct > 1.2) {
    warnings.push("Entry somewhat far from flip.");
    score -= 10;
  }

  const tz = ctx.gamma.transitionZone;
  if (tz?.lower != null && tz?.upper != null) {
    const width = ((tz.upper - tz.lower) / flip) * 100;
    if (width > 3) {
      warnings.push("Transition zone is wide.");
      score -= 8;
    }
  }

  if (side === "long" && price >= flip * 0.998) {
    score += 18;
    reasons.push("Long holding above gamma flip.");
    if (ctx.liquidity.nearestSupport && ctx.liquidity.nearestSupport.distancePct <= 1.5) {
      score += 10;
      reasons.push("Support near flip zone.");
    }
  }
  if (side === "short" && price <= flip * 1.002) {
    score += 18;
    reasons.push("Short rejecting from below gamma flip.");
    if (ctx.liquidity.nearestResistance && ctx.liquidity.nearestResistance.distancePct <= 1.5) {
      score += 10;
      reasons.push("Resistance near flip zone.");
    }
  }

  if (rmOk(ctx)) score += 12;

  const slPrice = ctx.risk.stopLossPrice;
  if (ctx.risk.stopLossDetected && slPrice != null && slPrice > 0) {
    score += 14;
    if (side === "long" && slPrice < flip) {
      reasons.push("Stop loss placed below gamma flip.");
    } else if (side === "short" && slPrice > flip) {
      reasons.push("Stop loss placed above gamma flip.");
    } else {
      reasons.push("Stop-loss detected for flip rejection setup.");
    }
  } else {
    invalidations.push("No SL for flip rejection setup.");
  }

  if (score < 35) return null;
  const status = score >= 65 ? "matched" : "partial";
  return buildMatch(
    "flip_rejection",
    score,
    status,
    side,
    reasons,
    warnings,
    invalidations,
    ["structural", "flip"],
  );
}

function scoreLiquidityVacuum(p: MatchParams): ExecutionPlaybookMatch | null {
  const { side, context: ctx } = p;
  const lm = ctx.liquidity.nearestMagnet;
  const warnings: string[] = ["Vacuum engine unavailable — using liquidity proxy."];
  const reasons: string[] = [];
  const invalidations: string[] = [];
  let score = 0;

  if (lm && lm.distancePct >= 1.2) {
    score += 25;
    reasons.push(`Nearest liquidity magnet ${lm.distancePct.toFixed(2)}% away.`);
  } else if (!lm && !ctx.liquidity.nearestSupport && !ctx.liquidity.nearestResistance) {
    score += 18;
    reasons.push("Sparse nearby liquidity levels.");
  } else {
    return null;
  }

  const price = refPrice(p);
  if (price != null && lm) {
    const towardVacuum =
      (side === "long" && lm.price > price) || (side === "short" && lm.price < price);
    if (towardVacuum) {
      score += 20;
      reasons.push("Trade direction points into thinner liquidity zone.");
    }
  }

  if (rmOk(ctx)) score += 14;
  if (ctx.market.marketDataHealth === "healthy") score += 8;
  if (ctx.risk.stopLossDetected) score += 10;

  if (ctx.risk.riskMirrorStatus === "danger") {
    invalidations.push("Risk Mirror danger — vacuum chase risky.");
    score -= 25;
  }

  if (score < 32) return null;
  const status = score >= 62 ? "matched" : "partial";
  return buildMatch(
    "liquidity_vacuum",
    score,
    status,
    side,
    reasons,
    warnings,
    invalidations,
    ["structural", "liquidity"],
  );
}

function scoreFailedAuction(p: MatchParams): ExecutionPlaybookMatch | null {
  const { side, context: ctx } = p;
  const price = refPrice(p);
  if (price == null) return null;

  const res = ctx.liquidity.nearestResistance;
  const sup = ctx.liquidity.nearestSupport;
  const reasons: string[] = [];
  const warnings: string[] = [];
  const invalidations: string[] = [];
  let score = 0;

  const hasResistanceWarn = (ctx.diagnostics?.warnings ?? []).some((w) =>
    w.toLowerCase().includes("resistance"),
  );
  const hasSupportWarn = (ctx.diagnostics?.warnings ?? []).some((w) =>
    w.toLowerCase().includes("support"),
  );

  if (side === "short" && res && res.distancePct <= 1.2) {
    score += 32;
    reasons.push("Short near resistance after failed upside auction.");
    if (hasResistanceWarn) score += 12;
  } else if (side === "long" && sup && sup.distancePct <= 1.2) {
    score += 32;
    reasons.push("Long near support after failed downside auction.");
    if (hasSupportWarn) score += 12;
  } else {
    return null;
  }

  if (ctx.risk.riskMirrorStatus === "conflicted") {
    score += 10;
    reasons.push("Risk Mirror conflicted — reversal context.");
  }

  if (ctx.risk.stopLossDetected) score += 10;
  warnings.push("Footprint auction data unavailable — heuristic only.");

  if (score < 38) return null;
  const status = score >= 60 ? "matched" : "partial";
  return buildMatch(
    "failed_auction",
    score,
    status,
    side,
    reasons,
    warnings,
    invalidations,
    ["reversal", "partial_structure"],
  );
}

function scoreAbsorptionScalp(p: MatchParams): ExecutionPlaybookMatch | null {
  const { side, context: ctx } = p;
  const sup = ctx.liquidity.nearestSupport;
  const res = ctx.liquidity.nearestResistance;
  const reasons: string[] = [];
  const warnings: string[] = ["Absorption data unavailable — scalp heuristic."];
  const invalidations: string[] = [];
  let score = 0;

  const nearLevel =
    (side === "long" && sup && sup.distancePct <= 0.9) ||
    (side === "short" && res && res.distancePct <= 0.9);

  if (!nearLevel) return null;

  score += 30;
  reasons.push("Entry very close to key level — scalp geometry.");

  const lossPct = ctx.risk.estimatedLossAccountPct;
  if (lossPct != null && lossPct <= 1) {
    score += 22;
    reasons.push("Estimated risk below 1% of account.");
  } else if (lossPct != null && lossPct > 2) {
    return null;
  }

  if (ctx.risk.stopLossDetected) {
    score += 16;
    reasons.push("Tight stop-loss defined.");
  } else {
    score -= 15;
  }

  if (ctx.risk.takeProfitDetected) {
    score += 10;
    reasons.push("Take-profit defined for scalp.");
  }

  if (rmOk(ctx)) score += 10;

  if (score < 40) return null;
  const status = score >= 65 ? "matched" : "partial";
  const tags = status === "matched" ? ["scalp", "structural"] : ["scalp", "impulsive"];
  return buildMatch(
    "absorption_scalp",
    score,
    status,
    side,
    reasons,
    warnings,
    invalidations,
    tags,
  );
}

export function createNoPlaybookMatch(
  warnings: string[] = [],
): PlaybookMatchResult {
  const primary = buildMatch(
    "no_match",
    0,
    "no_match",
    "unknown",
    [],
    [
      "Trade does not match current institutional playbooks.",
      "Context may be incomplete.",
      ...warnings,
    ],
    [],
    ["impulsive"],
  );
  return {
    primary,
    candidates: [primary],
    summary: "No clear institutional playbook detected.",
  };
}

function diagnosticsWarnings(ctx: ExecutionContextSnapshot): string[] {
  return ctx.diagnostics?.warnings ?? [];
}

export function matchExecutionPlaybook(params: {
  side?: "long" | "short";
  entryPrice?: number;
  context?: ExecutionContextSnapshot;
  source: "paper" | "bingx";
}): PlaybookMatchResult {
  try {
    return matchExecutionPlaybookInner(params);
  } catch (err) {
    console.warn(
      "[playbook-match] error",
      err instanceof Error ? err.message : err,
    );
    return createNoPlaybookMatch(["Playbook unavailable — error during match"]);
  }
}

function matchExecutionPlaybookInner(params: {
  side?: "long" | "short";
  entryPrice?: number;
  context?: ExecutionContextSnapshot;
  source: "paper" | "bingx";
}): PlaybookMatchResult {
  if (!params.context) {
    return createNoPlaybookMatch(["Playbook unavailable — missing context."]);
  }

  const side = params.side ?? "long";
  const p: MatchParams = {
    side,
    entryPrice: params.entryPrice,
    context: params.context,
    source: params.source,
  };

  const evaluators = [
    scoreSweepAbsorption,
    scoreGammaMagnetContinuation,
    scoreFlipRejection,
    scoreLiquidityVacuum,
    scoreFailedAuction,
    scoreAbsorptionScalp,
  ];

  const candidates = evaluators
    .map((fn) => {
      try {
        return fn(p);
      } catch {
        return null;
      }
    })
    .filter((c): c is ExecutionPlaybookMatch => c != null)
    .sort((a, b) => b.confidence - a.confidence);

  const best = candidates[0];
  if (!best || best.confidence < 40) {
    return createNoPlaybookMatch(
      diagnosticsWarnings(params.context).includes("Gamma context unavailable.")
        ? ["Context partially unavailable."]
        : [],
    );
  }

  const primary = { ...best };
  if (primary.confidence >= 70 && primary.status === "matched") {
    if (!primary.tags.includes("structural")) primary.tags.push("structural");
  } else if (
    !primary.tags.includes("impulsive") &&
    !primary.tags.includes("structural")
  ) {
    primary.tags.push("impulsive");
  }

  const tone =
    primary.tags.includes("structural") ? "structural" : "mixed/impulsive";
  const summary = `${primary.name} · ${primary.confidence}% · ${tone} setup.`;

  return {
    primary,
    candidates: candidates.slice(0, 5),
    summary,
  };
}
