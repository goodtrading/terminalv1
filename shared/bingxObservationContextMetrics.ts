import type { BingXObservationContextResult } from "../server/services/exchanges/bingx/bingxExecutionObservationContext";

type Decimal = Readonly<{ units: any; scale: number }>;

const bigInt = (value: string | number): any => (globalThis as any).BigInt(value);
type MetricCommon = Readonly<{ executionId: string; quality: BingXObservationContextResult["quality"]; executionKnowledgeAt: Date | null }>;
export type BingXObservationContextMetrics =
  | (MetricCommon & Readonly<{ status: "AVAILABLE"; bboEventId: string; bboObservedAt: Date; marketSource: "BINGX_BOOK_TICKER"; marketSourceTimestampMs: number; providerUpdateId: string | null; bestBid: string; bestAsk: string; observedContextSpread: string; observedContextMid: string; observationAgeMs: number }>)
  | (MetricCommon & Readonly<{ status: "UNAVAILABLE" | "CONFLICT"; reason: string }>);

const DECIMAL = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
function parsePositive(value: unknown): Decimal | null {
  if (typeof value !== "string" || !DECIMAL.test(value) || /^0(?:\.0+)?$/.test(value)) return null;
  const [, fraction = ""] = value.split(".");
  return { units: bigInt(value.replace(".", "")), scale: fraction.length };
}
function align(a: Decimal, b: Decimal): [any, any, number] {
  const scale = Math.max(a.scale, b.scale);
  return [a.units * bigInt(10) ** bigInt(scale - a.scale), b.units * bigInt(10) ** bigInt(scale - b.scale), scale];
}
function format(value: Decimal): string {
  const negative = value.units < bigInt(0);
  const units = (negative ? -value.units : value.units).toString().padStart(value.scale + 1, "0");
  const whole = value.scale === 0 ? units : units.slice(0, -value.scale);
  const fraction = value.scale === 0 ? "" : units.slice(-value.scale).replace(/0+$/, "");
  const result = fraction ? `${whole}.${fraction}` : whole;
  return negative && result !== "0" ? `-${result}` : result;
}
function midpoint(sum: Decimal): string {
  if (sum.units % bigInt(2) === bigInt(0)) return format({ units: sum.units / bigInt(2), scale: sum.scale });
  return format({ units: sum.units * bigInt(10) / bigInt(2), scale: sum.scale + 1 });
}
function cloneDate(value: Date | null): Date | null { return value === null ? null : new Date(value.getTime()); }

export function deriveBingXObservationContextMetrics(input: BingXObservationContextResult): BingXObservationContextMetrics {
  if (input.quality === "UNAVAILABLE") return { status: "UNAVAILABLE", quality: input.quality, executionId: input.executionId, executionKnowledgeAt: cloneDate(input.executionKnowledgeAt), reason: "OBSERVATION_CONTEXT_UNAVAILABLE" };
  if (input.quality === "CONFLICT") return { status: "CONFLICT", quality: input.quality, executionId: input.executionId, executionKnowledgeAt: cloneDate(input.executionKnowledgeAt), reason: "OBSERVATION_CONTEXT_CONFLICT" };
  const bid = parsePositive(input.bestBid);
  const ask = parsePositive(input.bestAsk);
  if (bid === null || ask === null) return { status: "CONFLICT", quality: input.quality, executionId: input.executionId, executionKnowledgeAt: cloneDate(input.executionKnowledgeAt), reason: "INVALID_OBSERVED_BBO_DECIMAL" };
  const [bidUnits, askUnits, scale] = align(bid, ask);
  if (bidUnits > askUnits) return { status: "CONFLICT", quality: input.quality, executionId: input.executionId, executionKnowledgeAt: cloneDate(input.executionKnowledgeAt), reason: "CROSSED_OBSERVED_BBO" };
  const age = input.observationAgeMs;
  if (!(input.executionKnowledgeAt instanceof Date) || !(input.bboObservedAt instanceof Date) || !Number.isFinite(input.executionKnowledgeAt.getTime()) || !Number.isFinite(input.bboObservedAt.getTime()) || typeof age !== "number" || !Number.isSafeInteger(age) || age < 0 || input.executionKnowledgeAt.getTime() < input.bboObservedAt.getTime()) return { status: "CONFLICT", quality: input.quality, executionId: input.executionId, executionKnowledgeAt: cloneDate(input.executionKnowledgeAt), reason: "INVALID_OBSERVATION_AGE" };
  const computedAge = input.executionKnowledgeAt.getTime() - input.bboObservedAt.getTime();
  if (computedAge !== age) return { status: "CONFLICT", quality: input.quality, executionId: input.executionId, executionKnowledgeAt: cloneDate(input.executionKnowledgeAt), reason: "INCONSISTENT_OBSERVATION_AGE" };
  return { status: "AVAILABLE", quality: input.quality, executionId: input.executionId, executionKnowledgeAt: cloneDate(input.executionKnowledgeAt)!, bboEventId: input.bboEventId, bboObservedAt: cloneDate(input.bboObservedAt)!, marketSource: input.marketSource, marketSourceTimestampMs: input.marketSourceTimestampMs, providerUpdateId: input.providerUpdateId, bestBid: input.bestBid, bestAsk: input.bestAsk, observedContextSpread: format({ units: askUnits - bidUnits, scale }), observedContextMid: midpoint({ units: bidUnits + askUnits, scale }), observationAgeMs: age };
}
