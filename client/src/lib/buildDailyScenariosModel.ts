export type PanelScenarioKey = "BASE" | "ALT" | "VOL";

export type PanelScenarioStatus = "STANDBY" | "WATCHING" | "ARMED" | "ACTIVE" | "INVALIDATED";

type ExecutionBias = "BULLISH" | "BEARISH" | "NEUTRAL";

export interface StructuralScenario {
  probability: number;
  title: string;
  summary: string;
  regime: string;
  trigger: string;
  target: string;
  invalidation: string;
  bias: ExecutionBias;
  triggerLevel: number | null;
  targetLevel: number | null;
}

export interface MarketScenarios {
  marketRegime: string;
  baseCase: StructuralScenario;
  altCase: StructuralScenario;
  volCase: StructuralScenario;
}

export interface BuiltDailyScenario {
  key: PanelScenarioKey;
  probability: number;
  status: PanelScenarioStatus;
  name: string;
  thesis: string;
  trigger: string;
  confirmation: string;
  target: string;
  invalidation: string;
  executionBias: ExecutionBias;
  playbookMapping: string;
}

export interface DailyScenariosModel {
  scenarios: BuiltDailyScenario[];
  scenarioStatus: Record<PanelScenarioKey, PanelScenarioStatus>;
  dominantFlow: string;
  structureChange: string[];
}

function fmtK(level: number): string {
  if (!Number.isFinite(level)) return "--";
  const k = level / 1000;
  return k >= 100 ? `${Math.round(k)}k` : `${k.toFixed(1)}k`;
}

function sanitizeGammaText(s: string): string {
  // Remove explicit gamma language; regime is already implied in the wider system.
  return s
    .replace(/long\\s+gamma/gi, "")
    .replace(/short\\s+gamma/gi, "")
    .replace(/\\bgamma\\b/gi, "")
    .replace(/\\s{2,}/g, " ")
    .trim();
}

function parseTriggerLevelAndDirection(trigger: string): { level: number | null; direction: "UP" | "DOWN" | null } {
  // Expected shapes from scenarioEngine:
  // - Acceptance above 77.8k
  // - Acceptance below 74.8k
  // - Break above 79.0k
  // - Break below 72.3k
  const t = trigger || "";
  const mAbove = t.match(/(Acceptance|Break)\\s+above\\s+([\\d.]+)k/i);
  if (mAbove) {
    const level = parseFloat(mAbove[2]) * 1000;
    return { level, direction: "UP" };
  }
  const mBelow = t.match(/(Acceptance|Break)\\s+below\\s+([\\d.]+)k/i);
  if (mBelow) {
    const level = parseFloat(mBelow[2]) * 1000;
    return { level, direction: "DOWN" };
  }
  return { level: null, direction: null };
}

function parseInvalidationLevelAndDirection(invalidation: string): {
  level: number | null;
  direction: "UP" | "DOWN" | null;
} {
  const t = invalidation || "";

  // Examples:
  // - "Break above 79.0k"
  // - "Reclaim above 72.3k"
  // - "Break below 72.3k"
  // - "Loss of 77.8k"
  const mAbove = t.match(/(Break|Reclaim)\s+above\s+([\d.]+)k/i);
  if (mAbove) return { direction: "UP", level: parseFloat(mAbove[2]) * 1000 };

  const mBelow = t.match(/(Break|Reclaim)\s+below\s+([\d.]+)k/i);
  if (mBelow) return { direction: "DOWN", level: parseFloat(mBelow[2]) * 1000 };

  const mLoss = t.match(/Loss of\s+([\d.]+)k/i);
  if (mLoss) return { direction: "DOWN", level: parseFloat(mLoss[1]) * 1000 };

  return { level: null, direction: null };
}

function deriveConfirmation(trigger: string, direction: "UP" | "DOWN" | null, level: number | null): string {
  const t = trigger || "";
  if (!direction || level == null) return "Awaiting trigger confirmation";
  if (t.toLowerCase().includes("acceptance above") || t.toLowerCase().includes("acceptance below")) {
    return `Hold ${direction === "UP" ? "above" : "below"} ${fmtK(level)} (acceptance)`;
  }
  if (t.toLowerCase().includes("break above") || t.toLowerCase().includes("break below")) {
    return "Clean break + hold (confirmation)";
  }
  return "Awaiting trigger confirmation";
}

export interface DailyScenariosConfig {
  // distancia relativa al trigger: abs(price - trigger)/price
  watchingDistancePct: number; // 0.15% => 0.0015
  armedDistancePct: number; // 0.08% => 0.0008
  acceptanceEpsilonPct: number; // buffer para considerar "aceptado"
  invalidationEpsilonPct: number; // buffer para considerar "invalidado"
}

const DEFAULT_CONFIG: DailyScenariosConfig = {
  watchingDistancePct: 0.0015,
  armedDistancePct: 0.0008,
  acceptanceEpsilonPct: 0.0004,
  invalidationEpsilonPct: 0.0006,
};

function distancePct(spot: number, level: number): number {
  if (!Number.isFinite(spot) || spot <= 0) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(level) || level <= 0) return Number.POSITIVE_INFINITY;
  return Math.abs(spot - level) / spot;
}

function contextAlignment(params: {
  key: PanelScenarioKey;
  marketRegime: string | undefined;
}): { aligned: boolean; rank: number } {
  const r = (params.marketRegime || "").toUpperCase();
  const isCompression = r.includes("COMPRESSION");

  if (isCompression) {
    // As requested: BASE always coherent in compression; ALT irrelevant; VOL secondary.
    if (params.key === "BASE") return { aligned: true, rank: 3 };
    if (params.key === "VOL") return { aligned: true, rank: 2 };
    return { aligned: false, rank: 0 };
  }

  // Generic regime-driven coherence (best-effort, avoids hardcoding gamma semantics).
  const baseAligned = /MEAN|RANGE|NEUTRAL/.test(r) || r.length === 0;
  const altAligned = /PRESSURE|EXTENSION|CONTROL|BREAK/.test(r);
  const volAligned = /SQUEEZE|ACCELERATION|VOLATILITY|EXPANSION|BREAKOUT/.test(r);

  if (params.key === "BASE") return { aligned: baseAligned, rank: baseAligned ? 2 : 0 };
  if (params.key === "ALT") return { aligned: altAligned, rank: altAligned ? 2 : 0 };
  return { aligned: volAligned, rank: volAligned ? 2 : 0 };
}

function acceptedByDirection(params: {
  spot: number;
  direction: "UP" | "DOWN" | null;
  level: number | null;
  trigger: string;
  cfg: DailyScenariosConfig;
}): boolean {
  const { spot, direction, level, trigger, cfg } = params;
  if (direction == null || level == null || !Number.isFinite(level) || level <= 0) return false;
  const up = direction === "UP";

  const t = (trigger || "").toLowerCase();
  const wantsAcceptance = t.includes("acceptance");
  const wantsBreak = t.includes("break");

  if (!wantsAcceptance && !wantsBreak) return false;

  // If trigger is "Acceptance above L", consider accepted once price sustains beyond L.
  // Buffer prevents noise-based oscillation.
  if (up) {
    return spot >= level * (1 + cfg.acceptanceEpsilonPct);
  }
  return spot <= level * (1 - cfg.acceptanceEpsilonPct);
}

function invalidatedBySpot(params: {
  spot: number;
  invalidationText: string;
  cfg: DailyScenariosConfig;
}): boolean {
  const { spot, invalidationText, cfg } = params;
  const { level, direction } = parseInvalidationLevelAndDirection(invalidationText || "");
  if (direction == null || level == null || !Number.isFinite(level) || level <= 0) return false;
  if (direction === "UP") return spot >= level * (1 + cfg.invalidationEpsilonPct);
  return spot <= level * (1 - cfg.invalidationEpsilonPct);
}

export function buildDailyScenariosModel(params: {
  scenariosData: MarketScenarios | null;
  spotPrice: number | null | undefined;
  cfg?: Partial<DailyScenariosConfig>;
}): DailyScenariosModel {
  const { scenariosData, spotPrice } = params;
  const spot = spotPrice ?? null;
  const cfg: DailyScenariosConfig = { ...DEFAULT_CONFIG, ...(params.cfg || {}) };

  const emptyStatus: Record<PanelScenarioKey, PanelScenarioStatus> = {
    BASE: "STANDBY",
    ALT: "STANDBY",
    VOL: "STANDBY",
  };

  if (!scenariosData || spot == null || !Number.isFinite(spot) || spot <= 0) {
    if (!scenariosData) {
      return {
        scenarios: [],
        scenarioStatus: emptyStatus,
        dominantFlow: "Rotation framework intact; awaiting acceptance",
        structureChange: ["Structure boundaries not available yet"],
      };
    }

    // Spot missing/invalid: still decide deterministically using context coherence.
    const contextRanked: PanelScenarioKey[] = ["BASE", "ALT", "VOL"].sort((a, b) => {
      const ra = contextAlignment({ key: a, marketRegime: scenariosData.marketRegime }).rank;
      const rb = contextAlignment({ key: b, marketRegime: scenariosData.marketRegime }).rank;
      return rb - ra;
    });
    const winner = contextRanked[0] ?? "BASE";

    const built: BuiltDailyScenario[] = (["BASE", "ALT", "VOL"] as PanelScenarioKey[]).map((key) => {
      const s = key === "BASE" ? scenariosData.baseCase : key === "ALT" ? scenariosData.altCase : scenariosData.volCase;
      const { level, direction } = parseTriggerLevelAndDirection(s.trigger);
      return {
        key,
        probability: s.probability,
        status: key === winner ? "ACTIVE" : "STANDBY",
        name: sanitizeGammaText(s.title) || key,
        thesis: sanitizeGammaText(s.summary),
        trigger: sanitizeGammaText(s.trigger),
        confirmation: deriveConfirmation(s.trigger, direction, level),
        target: sanitizeGammaText(s.target),
        invalidation: sanitizeGammaText(s.invalidation),
        executionBias: s.bias,
        playbookMapping:
          key === "BASE"
            ? "FADE_EXTREMES"
            : key === "ALT"
              ? "BREAKOUT"
              : direction === "DOWN"
                ? "BREAKDOWN"
                : "ACCELERATION",
      };
    });

    const scenarioStatus: Record<PanelScenarioKey, PanelScenarioStatus> = {
      BASE: built.find((b) => b.key === "BASE")?.status ?? "STANDBY",
      ALT: built.find((b) => b.key === "ALT")?.status ?? "STANDBY",
      VOL: built.find((b) => b.key === "VOL")?.status ?? "STANDBY",
    };

    const dominantFlow =
      winner === "ALT"
        ? "Buyers gaining control above resistance"
        : winner === "VOL"
          ? "Expansion risk building through thin liquidity"
          : "Two-sided rotation inside value";

    return {
      scenarios: built,
      scenarioStatus,
      dominantFlow,
      structureChange: ["Structure boundaries not well-defined -> maintain rotational framework"],
    };
  }

  const items: Array<{ key: PanelScenarioKey; s: StructuralScenario }> = [
    { key: "BASE", s: scenariosData.baseCase },
    { key: "ALT", s: scenariosData.altCase },
    { key: "VOL", s: scenariosData.volCase },
  ];

  const scenarioStatus: Record<PanelScenarioKey, PanelScenarioStatus> = { ...emptyStatus };

  const triggerParsed = items.map(({ key, s }) => {
    const { level, direction } = parseTriggerLevelAndDirection(s.trigger);
    return { key, level, direction, trigger: s.trigger, invalidation: s.invalidation };
  });

  const builtBase: BuiltDailyScenario[] = items.map(({ key, s }) => {
    const parsed = triggerParsed.find((p) => p.key === key)!;
    const { level, direction } = parsed;

    const dist = level != null ? distancePct(spot, level) : Number.POSITIVE_INFINITY;
    const context = contextAlignment({ key, marketRegime: scenariosData.marketRegime });
    const invalidated = invalidatedBySpot({ spot, invalidationText: s.invalidation, cfg });
    const accepted = acceptedByDirection({
      spot,
      direction,
      level,
      trigger: s.trigger,
      cfg,
    });

    const isArmedByDist = dist < cfg.armedDistancePct;
    const isWatchingByDist = dist < cfg.watchingDistancePct;

    // Primary status rule set
    let status: PanelScenarioStatus = "STANDBY";
    if (invalidated) status = "INVALIDATED";
    else if (!context.aligned) status = "STANDBY";
    else if (accepted) status = "ACTIVE";
    else if (isArmedByDist) status = "ARMED";
    else if (isWatchingByDist) status = "WATCHING";

    scenarioStatus[key] = status;

    const confirmation = deriveConfirmation(s.trigger, direction, level);

    const playbookMapping =
      key === "BASE"
        ? "FADE_EXTREMES"
        : key === "ALT"
          ? "BREAKOUT"
          : direction === "DOWN"
            ? "BREAKDOWN"
            : "ACCELERATION";

    return {
      key,
      probability: s.probability,
      status,
      name: sanitizeGammaText(s.title) || key,
      thesis: sanitizeGammaText(s.summary),
      trigger: sanitizeGammaText(s.trigger),
      confirmation,
      target: sanitizeGammaText(s.target),
      invalidation: sanitizeGammaText(s.invalidation),
      executionBias: s.bias,
      playbookMapping,
    };
  });

  // Ensure we ALWAYS have a dominant ACTIVE (exactly one), chosen by:
  // 1) accepted triggers (if any), else
  // 2) most coherent context (tie-break: closest to trigger by distance).
  const scoreCandidate = (b: BuiltDailyScenario) => {
    const parsed = triggerParsed.find((p) => p.key === b.key)!;
    const context = contextAlignment({ key: b.key, marketRegime: scenariosData.marketRegime });
    const dist = parsed.level != null ? distancePct(spot, parsed.level) : Number.POSITIVE_INFINITY;
    return { key: b.key, contextRank: context.rank, dist };
  };

  const acceptedActiveCandidates = builtBase.filter((b) => b.status === "ACTIVE");
  const candidates = (acceptedActiveCandidates.length ? acceptedActiveCandidates : builtBase).map(scoreCandidate);
  candidates.sort((a, b) => {
    // Prefer acceptance closeness (smaller dist), then higher context rank.
    return (a.dist - b.dist) || (b.contextRank - a.contextRank);
  });

  const winner = candidates[0]?.key ?? "BASE";

  for (const b of builtBase) {
    if (b.status === "INVALIDATED") {
      scenarioStatus[b.key] = "INVALIDATED";
      continue;
    }

    if (b.key === winner) {
      b.status = "ACTIVE";
      scenarioStatus[b.key] = "ACTIVE";
      continue;
    }

    // Demote others to watching/armed/stby based on distance + context.
    const parsed = triggerParsed.find((p) => p.key === b.key)!;
    const dist = parsed.level != null ? distancePct(spot, parsed.level) : Number.POSITIVE_INFINITY;
    const context = contextAlignment({ key: b.key, marketRegime: scenariosData.marketRegime });
    if (!context.aligned) b.status = "STANDBY";
    else if (dist < cfg.armedDistancePct) b.status = "ARMED";
    else if (dist < cfg.watchingDistancePct) b.status = "WATCHING";
    else b.status = "STANDBY";
    scenarioStatus[b.key] = b.status;
  }

  const finalActive = winner;

  const dominantFlow = (() => {
    // Derived from ACTIVE key only.
    if (finalActive === "ALT") return "Buyers gaining control above resistance";
    if (finalActive === "VOL") return "Expansion risk building through thin liquidity";
    return "Two-sided rotation inside value";
  })();

  // Day structure change (acceptance-based, based on ACTIVE scenario trigger direction).
  const activeScenario = builtBase.find((b) => b.key === finalActive)!;
  const parsedActiveTrigger = parseTriggerLevelAndDirection(activeScenario.trigger);
  const activeLevel = parsedActiveTrigger.level;
  const activeDir = parsedActiveTrigger.direction;

  const upperLevels = builtBase
    .map((b) => parseTriggerLevelAndDirection(b.trigger))
    .map((p) => (p.direction === "UP" ? p.level : null))
    .filter((x): x is number => x != null);
  const lowerLevels = builtBase
    .map((b) => parseTriggerLevelAndDirection(b.trigger))
    .map((p) => (p.direction === "DOWN" ? p.level : null))
    .filter((x): x is number => x != null);

  const upper = upperLevels.length ? Math.min(...upperLevels) : null; // closest UP boundary
  const lower = lowerLevels.length ? Math.max(...lowerLevels) : null; // closest DOWN boundary

  const structureChange = (() => {
    if (activeLevel != null && activeDir === "UP" && acceptedByDirection({
      spot,
      direction: activeDir,
      level: activeLevel,
      trigger: activeScenario.trigger,
      cfg,
    })) {
      return [`Above ${fmtK(activeLevel)} accepted -> shift to upside continuation`];
    }
    if (activeLevel != null && activeDir === "DOWN" && acceptedByDirection({
      spot,
      direction: activeDir,
      level: activeLevel,
      trigger: activeScenario.trigger,
      cfg,
    })) {
      return [`Below ${fmtK(activeLevel)} accepted -> shift to downside expansion`];
    }
    if (upper != null && lower != null && lower < upper) {
      return [`Inside ${fmtK(lower)}–${fmtK(upper)} rotation range -> maintain rotational framework`];
    }
    return ["Structure boundaries not well-defined -> maintain rotational framework"];
  })();

  return {
    scenarios: builtBase,
    scenarioStatus,
    dominantFlow,
    structureChange,
  };
}

