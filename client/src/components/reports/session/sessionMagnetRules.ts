import type { LevelContext, MagnetLevelType, SessionTerminalInput } from "./sessionReportTypes";
import {
  buildLevelContext,
  distPctAbs,
  FAR_MAGNET_INTRADAY_MAX_PCT,
  isFarFromSpot,
  num,
  type MagnetResolve,
} from "./sessionReportLevelUtils";

export { FAR_MAGNET_INTRADAY_MAX_PCT } from "./sessionReportLevelUtils";

export const FAR_MAGNET_WARNING =
  "Not an intraday target under normal conditions.";

export type MacroMagnetLabel = "Structural Magnet" | "Macro Gravity Level" | "Far Magnet";

export type OperationalLevelPlan = {
  /** Resolved magnet from terminal (may be far). */
  structuralMagnetPrice: number | null;
  structuralMagnetContext: LevelContext;
  magnetIsFarMacro: boolean;
  /** Nearest level within 8% for intraday ops, if any. */
  intradayMagnetPrice: number | null;
  /** Level driving intraday location, edge, bias, behavior. */
  operationalFocusContext: LevelContext;
  operationalFocusTitle: string;
};

function macroLabelForType(baseType: MagnetLevelType): MacroMagnetLabel {
  if (baseType === "Gravity Magnet") return "Macro Gravity Level";
  if (baseType === "Gamma Magnet") return "Structural Magnet";
  return "Far Magnet";
}

export function buildMagnetLevelContext(
  price: number | null,
  baseType: MagnetLevelType,
  spot: number | null,
): LevelContext {
  if (price == null || spot == null) {
    return buildLevelContext(price, baseType, spot);
  }

  const distancePct = ((price - spot) / spot) * 100;
  const far = isFarFromSpot(spot, price);

  if (far) {
    return {
      price,
      type: macroLabelForType(baseType),
      distancePct,
      distanceLabel: `${distancePct >= 0 ? "+" : ""}${distancePct.toFixed(2)}%`,
      relation: price > spot ? "Above Spot" : "Below Spot",
      role: "macro",
      farMacroStatus: "Far macro level",
      warning: FAR_MAGNET_WARNING,
      isIntradayTarget: false,
    };
  }

  return {
    ...buildLevelContext(price, baseType, spot),
    role: "intraday",
    isIntradayTarget: true,
  };
}

function collectIntradayMagnetCandidates(
  terminal: SessionTerminalInput,
  spot: number,
): { price: number; type: MagnetLevelType }[] {
  const out: { price: number; type: MagnetLevelType }[] = [];

  const magnets = terminal.levels?.gammaMagnets;
  if (Array.isArray(magnets)) {
    for (const m of magnets) {
      if (Number.isFinite(m) && distPctAbs(spot, m) <= FAR_MAGNET_INTRADAY_MAX_PCT) {
        out.push({ price: m, type: "Gamma Magnet" });
      }
    }
  }

  const call = num(terminal.positioning?.callWall);
  const put = num(terminal.positioning?.putWall);
  if (call != null && distPctAbs(spot, call) <= FAR_MAGNET_INTRADAY_MAX_PCT) {
    out.push({ price: call, type: "Call Wall" });
  }
  if (put != null && distPctAbs(spot, put) <= FAR_MAGNET_INTRADAY_MAX_PCT) {
    out.push({ price: put, type: "Put Wall" });
  }

  return out;
}

export function findNearestIntradayMagnet(
  terminal: SessionTerminalInput,
  spot: number,
): MagnetResolve | null {
  const candidates = collectIntradayMagnetCandidates(terminal, spot);
  if (!candidates.length) return null;

  let best = candidates[0]!;
  let bestD = Math.abs(best.price - spot);
  for (const c of candidates) {
    const d = Math.abs(c.price - spot);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return { price: best.price, type: best.type };
}

export function planOperationalLevels(
  terminal: SessionTerminalInput,
  spot: number | null,
  magnetResolve: MagnetResolve,
  localFlip: number | null,
): OperationalLevelPlan {
  const structuralMagnetContext = buildMagnetLevelContext(
    magnetResolve.price,
    magnetResolve.type,
    spot,
  );
  const magnetIsFarMacro =
    spot != null &&
    magnetResolve.price != null &&
    isFarFromSpot(spot, magnetResolve.price);

  const intradayFromList =
    spot != null ? findNearestIntradayMagnet(terminal, spot) : null;
  const intradayMagnetPrice =
    magnetIsFarMacro
      ? intradayFromList?.price ?? null
      : magnetResolve.price != null &&
          spot != null &&
          !isFarFromSpot(spot, magnetResolve.price)
        ? magnetResolve.price
        : intradayFromList?.price ?? null;

  if (magnetIsFarMacro) {
    const operationalFocusContext = buildLevelContext(localFlip, "Local Flip", spot);
    return {
      structuralMagnetPrice: magnetResolve.price,
      structuralMagnetContext,
      magnetIsFarMacro: true,
      intradayMagnetPrice,
      operationalFocusContext,
      operationalFocusTitle: "Intraday Focus · Local Flip",
    };
  }

  const opCtx =
    intradayMagnetPrice != null
      ? buildMagnetLevelContext(
          intradayMagnetPrice,
          magnetResolve.type,
          spot,
        )
      : buildLevelContext(localFlip, "Local Flip", spot);

  return {
    structuralMagnetPrice: magnetResolve.price,
    structuralMagnetContext,
    magnetIsFarMacro: false,
    intradayMagnetPrice,
    operationalFocusContext: opCtx,
    operationalFocusTitle:
      intradayMagnetPrice != null
        ? "Intraday Focus · Primary Magnet"
        : "Intraday Focus · Local Flip",
  };
}

/** Price for intraday proximity checks — never the far structural magnet. */
export function intradayMagnetForOps(plan: OperationalLevelPlan): number | null {
  if (plan.magnetIsFarMacro) return plan.intradayMagnetPrice;
  return plan.intradayMagnetPrice ?? plan.structuralMagnetPrice;
}
