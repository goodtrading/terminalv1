import type { TerminalState } from "../../terminal-state";
import type { DataStatus, ScenarioBlock } from "./mobileMarketStateV2.types";
import {
  classifyStorageScenarioType,
  normalizeProbability,
  scenarioHorizonFromClassification,
  scenarioTypeFromStorage,
  valueAvailable,
} from "./mobileMarketStateQuality";

export function scenarioAppliesToContext(
  storageType: string | undefined,
  context: "micro" | "macro",
): boolean {
  const classification = classifyStorageScenarioType(storageType);
  if (classification === "intraday") return context === "micro";
  if (classification === "structural" || classification === "tail") return context === "macro";
  return false;
}

function mapScenario(
  s: NonNullable<TerminalState["scenarios"]>[number],
  context: "micro" | "macro",
): ScenarioBlock {
  const classification = classifyStorageScenarioType(s.type);
  const invalidationRaw = s.invalidation?.trim();
  const invalidations =
    invalidationRaw && invalidationRaw.length > 0 ? [invalidationRaw] : [];
  const horizon = scenarioHorizonFromClassification(classification, context);
  const probability = normalizeProbability(s.probability);
  const probabilityRaw =
    s.probability != null && Number.isFinite(s.probability)
      ? valueAvailable(s.probability)
      : { value: null, status: "unavailable" as const };

  return {
    id: s.id,
    type: scenarioTypeFromStorage(s.type),
    probability,
    probabilityRaw,
    direction: { value: null, status: "not_applicable" },
    title: s.thesis ? valueAvailable(s.thesis.slice(0, 80)) : { value: null, status: "unavailable" },
    thesis: s.thesis ? valueAvailable(s.thesis) : { value: null, status: "unavailable" },
    targets: {
      items: s.levels ?? [],
      status: (s.levels?.length ?? 0) > 0 ? "available" : "unavailable",
    },
    relevantLevels: {
      items: s.levels ?? [],
      status: (s.levels?.length ?? 0) > 0 ? "available" : "unavailable",
    },
    confirmations: {
      items: s.confirmation ?? [],
      status: (s.confirmation?.length ?? 0) > 0 ? "available" : "unavailable",
    },
    invalidations: {
      items: invalidations,
      status: invalidations.length ? "available" : "unavailable",
    },
    horizon,
    classification,
    status: horizon.status === "unavailable" ? "unavailable" : "available",
  };
}

export function buildContextScenarios(
  ts: TerminalState,
  context: "micro" | "macro",
  scenarioFreshness: DataStatus,
): { items: ScenarioBlock[]; status: DataStatus } {
  const raw = ts.scenarios ?? [];
  if (!raw.length) return { items: [], status: "unavailable" };

  const items = raw
    .filter((s) => scenarioAppliesToContext(s.type, context))
    .map((s) => mapScenario(s, context));

  if (!items.length) {
    return { items: [], status: scenarioFreshness === "stale" ? "stale" : "unavailable" };
  }

  return { items, status: scenarioFreshness };
}

export function countUnclassifiedScenarios(ts: TerminalState): number {
  return (ts.scenarios ?? []).filter(
    (s) => classifyStorageScenarioType(s.type) === "unclassified",
  ).length;
}
