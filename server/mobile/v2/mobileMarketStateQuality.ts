import type {
  ContextTag,
  DataStatus,
  DistanceMetrics,
  DominantExpiryBlock,
  SpotPosition,
  ValueWithStatus,
} from "./mobileMarketStateV2.types";

export const TICKER_STALE_MS = 10_000;
export const OPTIONS_STALE_MS = 60_000;
export const SCENARIOS_STALE_MS = 300_000;

export function valueAvailable<T>(value: T | null | undefined): ValueWithStatus<T> {
  if (value === null || value === undefined) {
    return { value: null, status: "unavailable" };
  }
  return { value, status: "available" };
}

export function valueNotApplicable<T>(): ValueWithStatus<T> {
  return { value: null, status: "not_applicable" };
}

export function normalizeProbability(
  raw: number | null | undefined,
): ValueWithStatus<number> {
  if (raw == null || !Number.isFinite(raw)) {
    return { value: null, status: "unavailable" };
  }
  if (raw < 0) return { value: null, status: "calculation_error" };
  if (raw > 1) {
    const normalized = raw / 100;
    if (normalized > 1) return { value: null, status: "calculation_error" };
    return { value: normalized, status: "available" };
  }
  return { value: raw, status: "available" };
}

export function normalizeConfidence(
  raw: number | null | undefined,
): ValueWithStatus<number> {
  return normalizeProbability(raw);
}

export function computeDistance(
  level: number | null | undefined,
  spot: number | null | undefined,
): DistanceMetrics {
  if (
    level == null ||
    spot == null ||
    !Number.isFinite(level) ||
    !Number.isFinite(spot) ||
    spot <= 0
  ) {
    return {
      signedDistanceUsd: null,
      distanceUsd: null,
      signedDistancePct: null,
      distancePct: null,
      position: null,
      status: "unavailable",
    };
  }

  const signedDistanceUsd = level - spot;
  const distanceUsd = Math.abs(signedDistanceUsd);
  const signedDistancePct = (signedDistanceUsd / spot) * 100;
  const distancePct = Math.abs(signedDistancePct);
  let position: SpotPosition = "at_spot";
  if (distancePct < 0.01) position = "at_spot";
  else if (signedDistanceUsd > 0) position = "above_spot";
  else position = "below_spot";

  return {
    signedDistanceUsd,
    distanceUsd,
    signedDistancePct,
    distancePct,
    position,
    status: "available",
  };
}

export function normalizeRegimeCode(
  raw: string | null | undefined,
): ValueWithStatus<string> {
  if (!raw || typeof raw !== "string") {
    return { value: null, status: "unavailable" };
  }
  const normalized = raw.trim().toUpperCase().replace(/\s+/g, "_");
  return { value: normalized, status: "available" };
}

export function regimeLabelFromCode(code: string | null): string | null {
  if (!code) return null;
  switch (code) {
    case "LONG_GAMMA":
      return "Long gamma";
    case "SHORT_GAMMA":
      return "Short gamma";
    case "TRANSITION":
      return "Transition";
    case "NEUTRAL":
      return "Neutral";
    default:
      return code.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  }
}

export function normalizedGexFromTotal(
  totalGex: number | null | undefined,
): ValueWithStatus<number> {
  if (totalGex == null || !Number.isFinite(totalGex)) {
    return { value: null, status: "unavailable" };
  }
  return { value: Math.tanh(totalGex / 10_000_000), status: "available" };
}

export function tickerFreshness(
  tickerStatus: "fresh" | "stale" | "unavailable",
): DataStatus {
  if (tickerStatus === "fresh") return "available";
  if (tickerStatus === "stale") return "stale";
  return "unavailable";
}

export function optionsFreshness(
  optionsLastUpdated: number | undefined,
  now = Date.now(),
): DataStatus {
  if (optionsLastUpdated == null || !Number.isFinite(optionsLastUpdated)) {
    return "unavailable";
  }
  const age = now - optionsLastUpdated;
  return age <= OPTIONS_STALE_MS ? "available" : "stale";
}

export function scenariosFreshness(
  scenarios: unknown[] | undefined,
  latestTimestampMs: number | null,
  now = Date.now(),
): DataStatus {
  if (!scenarios || scenarios.length === 0) return "unavailable";
  if (latestTimestampMs == null) return "available";
  return now - latestTimestampMs <= SCENARIOS_STALE_MS ? "available" : "stale";
}

export function driverCodeFromLabel(label: string): string {
  const slug = label
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "UNKNOWN_DRIVER";
}

export function inferDriverImpact(
  code: string,
  context: ContextTag,
): "positive" | "negative" | "neutral" | "mixed" {
  if (/BULLISH|LONG|SQUEEZE_UP|BUYING/i.test(code)) return "positive";
  if (/BEARISH|SHORT|CASCADE_DOWN|SELLING/i.test(code)) return "negative";
  if (/FRAGILE|MIXED|TRANSITION|CHOP/i.test(code)) return "mixed";
  return context === "shared" ? "neutral" : "neutral";
}

export function biasDirectionFromType(
  biasType: string | null | undefined,
): ValueWithStatus<string> {
  if (!biasType) return { value: null, status: "unavailable" };
  if (biasType.startsWith("BULLISH")) return { value: "bullish", status: "available" };
  if (biasType.startsWith("BEARISH")) return { value: "bearish", status: "available" };
  if (biasType === "SQUEEZE_SETUP") return { value: "mixed", status: "available" };
  if (biasType === "FRAGILE_TRANSITION" || biasType === "NEUTRAL_CHOP") {
    return { value: "neutral", status: "available" };
  }
  return { value: "neutral", status: "available" };
}

export function scenarioTypeFromStorage(
  type: string | null | undefined,
): "base" | "alternative" | "tail" {
  const t = (type ?? "").toUpperCase();
  if (t === "ALT") return "alternative";
  if (t === "VOL") return "tail";
  return "base";
}

export type ScenarioHorizonClass = "intraday" | "structural" | "tail" | "unclassified";

/** Classify storage scenario.type — uses type field only, never thesis text. */
export function classifyStorageScenarioType(type: string | null | undefined): ScenarioHorizonClass {
  const t = (type ?? "").toUpperCase();
  if (t === "BASE") return "intraday";
  if (t === "ALT") return "structural";
  if (t === "VOL") return "tail";
  return "unclassified";
}

export function scenarioHorizonFromClassification(
  classification: ScenarioHorizonClass,
  context: ContextTag,
): { code: string | null; label: string | null; status: DataStatus } {
  if (classification === "unclassified") {
    return { code: null, label: null, status: "unavailable" };
  }
  if (context === "micro") {
    if (classification === "intraday") {
      return { code: "intraday", label: "Minutes to hours", status: "available" };
    }
    return { code: null, label: null, status: "unavailable" };
  }
  if (classification === "intraday") {
    return { code: null, label: null, status: "unavailable" };
  }
  if (classification === "structural") {
    return { code: "structural", label: "Session to days", status: "available" };
  }
  return { code: "tail", label: "Tail event", status: "available" };
}

/** @deprecated Use classifyStorageScenarioType + scenarioHorizonFromClassification */
export function scenarioHorizonFromType(
  type: string | null | undefined,
  context: ContextTag,
): { code: string | null; label: string | null; status: DataStatus } {
  return scenarioHorizonFromClassification(classifyStorageScenarioType(type), context);
}

export function latestScenarioTimestampMs(
  scenarios: Array<{ timestamp?: Date | string | number | null }> | undefined,
): number | null {
  if (!scenarios?.length) return null;
  let max = 0;
  for (const s of scenarios) {
    const raw = s.timestamp;
    const ms =
      raw instanceof Date
        ? raw.getTime()
        : typeof raw === "number"
          ? raw
          : typeof raw === "string"
            ? Date.parse(raw)
            : NaN;
    if (Number.isFinite(ms) && ms > max) max = ms;
  }
  return max > 0 ? max : null;
}

export function sumScenarioProbabilities(
  scenarios: Array<{ probability?: number | null }>,
): number | null {
  if (!scenarios.length) return null;
  let sum = 0;
  let any = false;
  for (const s of scenarios) {
    const p = normalizeProbability(s.probability ?? null);
    if (p.status === "available" && p.value != null) {
      sum += p.value;
      any = true;
    }
  }
  return any ? sum : null;
}

const MONTH_MAP: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

function notApplicableExpiry(): DominantExpiryBlock {
  return {
    date: null,
    instrumentCode: null,
    daysToExpiry: null,
    status: "not_applicable",
  };
}

function unavailableExpiry(instrumentCode: string | null = null): DominantExpiryBlock {
  return {
    date: null,
    instrumentCode,
    daysToExpiry: null,
    status: "unavailable",
  };
}

/** Parse Deribit instrument code (e.g. 26JUN26) or ISO date into structured expiry. */
export function parseDominantExpiry(
  raw: string | null | undefined,
  applicable: boolean,
  now: Date = new Date(),
): DominantExpiryBlock {
  if (!applicable) return notApplicableExpiry();
  if (!raw || typeof raw !== "string" || !raw.trim()) return unavailableExpiry();

  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const anchor = new Date(`${trimmed}T12:00:00.000Z`);
    if (Number.isNaN(anchor.getTime())) return unavailableExpiry(trimmed);
    const daysToExpiry = Math.ceil((anchor.getTime() - now.getTime()) / 86_400_000);
    return {
      date: trimmed,
      instrumentCode: trimmed,
      daysToExpiry: daysToExpiry >= 0 ? daysToExpiry : null,
      status: "available",
    };
  }

  const match = trimmed.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/i);
  if (!match) return unavailableExpiry(trimmed);

  const day = Number(match[1]);
  const month = MONTH_MAP[match[2].toUpperCase()];
  const year = 2000 + Number(match[3]);
  if (month == null || !Number.isFinite(day) || !Number.isFinite(year)) {
    return unavailableExpiry(trimmed.toUpperCase());
  }

  const anchor = new Date(Date.UTC(year, month, day, 12, 0, 0, 0));
  if (Number.isNaN(anchor.getTime())) return unavailableExpiry(trimmed.toUpperCase());

  const date = anchor.toISOString().slice(0, 10);
  const daysToExpiry = Math.ceil((anchor.getTime() - now.getTime()) / 86_400_000);
  return {
    date,
    instrumentCode: trimmed.toUpperCase(),
    daysToExpiry: daysToExpiry >= 0 ? daysToExpiry : null,
    status: "available",
  };
}
