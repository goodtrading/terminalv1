import type { OrderDecisionEvidence } from "./orderDecisionEvidence";

export type OrderDecisionMarketContextReason =
  | "MARKET_EVIDENCE_UNAVAILABLE"
  | "MISSING_BID"
  | "MISSING_ASK"
  | "MISSING_MARKET_SOURCE_TIMESTAMP"
  | "INVALID_BID"
  | "INVALID_ASK"
  | "CROSSED_BBO"
  | "SOURCE_TIMESTAMP_AFTER_DECISION";

type Common = Readonly<{
  decisionAt: Date | null;
  marketSource: string | null;
  marketSourceTimestamp: Date | null;
  bestBid: string | null;
  bestAsk: string | null;
  spread: string | null;
  mid: string | null;
  decisionMarketAgeMs: number | null;
  reasons: readonly OrderDecisionMarketContextReason[];
}>;

export type OrderDecisionMarketContext =
  | (Common & Readonly<{ status: "AVAILABLE" }>)
  | (Common & Readonly<{ status: "UNAVAILABLE" | "CONFLICT" }>);

export type OrderDecisionMarketContextInput = OrderDecisionEvidence | null | undefined;

type Decimal = { units: any; scale: number };
const bigInt = (value: string | number): any => (globalThis as any).BigInt(value);
const pow10 = (scale: number): any => bigInt(10) ** bigInt(scale);
function parseDecimal(value: unknown): Decimal | null {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) || /^0(?:\.0+)?$/.test(value)) return null;
  const [, fraction = ""] = value.split(".");
  return { units: bigInt(value.replace(".", "")), scale: fraction.length };
}
function align(a: Decimal, b: Decimal): [any, any, number] {
  const scale = Math.max(a.scale, b.scale);
  return [a.units * pow10(scale - a.scale), b.units * pow10(scale - b.scale), scale];
}
function format(value: Decimal): string {
  const raw = value.units.toString().padStart(value.scale + 1, "0");
  const whole = value.scale ? raw.slice(0, -value.scale) : raw;
  const fraction = value.scale ? raw.slice(-value.scale).replace(/0+$/, "") : "";
  return fraction ? `${whole}.${fraction}` : whole;
}
function divideByTwo(value: Decimal): string {
  return format({ units: value.units * pow10(18) / bigInt(2), scale: value.scale + 18 });
}
function cloneDate(value: Date | null): Date | null { return value === null ? null : new Date(value.getTime()); }
function validDate(value: Date | null | undefined): value is Date { return value instanceof Date && Number.isFinite(value.getTime()) && value.getTime() >= 0; }

export function deriveOrderDecisionMarketContext(input: OrderDecisionMarketContextInput): OrderDecisionMarketContext {
  const reasons: OrderDecisionMarketContextReason[] = [];
  if (input == null || input.marketEvidenceQuality === "UNAVAILABLE") {
    reasons.push("MARKET_EVIDENCE_UNAVAILABLE");
    return { status: "UNAVAILABLE", decisionAt: validDate(input?.decisionAt) ? cloneDate(input!.decisionAt) : null, marketSource: input?.marketSource ?? null, marketSourceTimestamp: null, bestBid: null, bestAsk: null, spread: null, mid: null, decisionMarketAgeMs: null, reasons };
  }
  const decisionAt = validDate(input.decisionAt) ? cloneDate(input.decisionAt)! : null;
  const sourceTimestamp = validDate(input.marketSourceTimestamp) ? cloneDate(input.marketSourceTimestamp)! : null;
  const bid = parseDecimal(input.bestBid); const ask = parseDecimal(input.bestAsk);
  if (bid === null) reasons.push(input.bestBid == null ? "MISSING_BID" : "INVALID_BID");
  if (ask === null) reasons.push(input.bestAsk == null ? "MISSING_ASK" : "INVALID_ASK");
  if (sourceTimestamp === null) reasons.push("MISSING_MARKET_SOURCE_TIMESTAMP");
  if (reasons.length > 0) return { status: "UNAVAILABLE", decisionAt, marketSource: input.marketSource, marketSourceTimestamp: sourceTimestamp, bestBid: null, bestAsk: null, spread: null, mid: null, decisionMarketAgeMs: null, reasons };
  const [bidUnits, askUnits, scale] = align(bid!, ask!);
  if (bidUnits > askUnits) {
    reasons.push("CROSSED_BBO");
    return { status: "CONFLICT", decisionAt, marketSource: input.marketSource, marketSourceTimestamp: sourceTimestamp, bestBid: input.bestBid, bestAsk: input.bestAsk, spread: null, mid: null, decisionMarketAgeMs: null, reasons };
  }
  const sum: Decimal = { units: bidUnits + askUnits, scale };
  const spread: Decimal = { units: askUnits - bidUnits, scale };
  let age: number | null = null;
  if (sourceTimestamp!.getTime() <= decisionAt!.getTime()) age = decisionAt!.getTime() - sourceTimestamp!.getTime();
  else reasons.push("SOURCE_TIMESTAMP_AFTER_DECISION");
  return { status: "AVAILABLE", decisionAt, marketSource: input.marketSource, marketSourceTimestamp: sourceTimestamp, bestBid: input.bestBid, bestAsk: input.bestAsk, spread: format(spread), mid: divideByTwo(sum), decisionMarketAgeMs: age, reasons };
}
