import type { DurableBingXBboEvent } from "./bingxBboHistory";
import { validateDurableBingXBboEvent } from "./bingxBboHistory";

export type DurableExecutionObservation = Readonly<{
  executionId: string;
  symbol: string;
  observedAt: Date;
  side?: string;
  quantity?: string;
  price?: string;
  classification: "GT_LINKED" | "BROKER_OBSERVED_ONLY";
}>;

type CommonResult = Readonly<{ executionId: string; executionKnowledgeAt: Date | null; brokerClassification: DurableExecutionObservation["classification"] | null }>;
export type BingXObservationContextResult =
  | (CommonResult & Readonly<{ quality: "OBSERVED_AT_OR_BEFORE"; bboEventId: string; bboObservedAt: Date; marketSource: "BINGX_BOOK_TICKER"; marketSourceTimestampMs: number; bestBid: string; bestAsk: string; bestBidQuantity: string; bestAskQuantity: string; providerUpdateId: string | null; observationAgeMs: number }>)
  | (CommonResult & Readonly<{ quality: "UNAVAILABLE" | "CONFLICT"; bboEventId?: undefined; bboObservedAt?: undefined; marketSource?: undefined; marketSourceTimestampMs?: undefined; bestBid?: undefined; bestAsk?: undefined; bestBidQuantity?: undefined; bestAskQuantity?: undefined; providerUpdateId?: undefined; observationAgeMs?: undefined }>);

const same = (a: DurableExecutionObservation, b: DurableExecutionObservation): boolean => a.symbol === b.symbol && a.side === b.side && a.quantity === b.quantity && a.price === b.price;
const invalidObservation = (o: DurableExecutionObservation): boolean => !o.executionId || o.symbol !== "BTC-USDT" || !(o.observedAt instanceof Date) || Number.isNaN(o.observedAt.getTime());

export function resolveBingXObservedAtOrBefore(input: Readonly<{ executionId: string; observations: readonly DurableExecutionObservation[]; bboEvents: readonly DurableBingXBboEvent[] }>): BingXObservationContextResult {
  const observations = input.observations.filter(o => o.executionId === input.executionId);
  const classification = observations.some(o => o.classification === "BROKER_OBSERVED_ONLY") ? "BROKER_OBSERVED_ONLY" : observations[0]?.classification ?? null;
  const base: CommonResult = { executionId: input.executionId, executionKnowledgeAt: null, brokerClassification: classification };
  if (!input.executionId || observations.length === 0 || observations.some(invalidObservation) || observations.some(o => !same(o, observations[0]!))) return { ...base, quality: observations.length > 0 && observations.some(o => !same(o, observations[0]!)) ? "CONFLICT" : "UNAVAILABLE" };
  const executionKnowledgeAt = new Date(Math.min(...observations.map(o => o.observedAt.getTime())));
  const invalidBbo = input.bboEvents.some(event => !validateDurableBingXBboEvent(event).ok);
  if (invalidBbo) return { ...base, executionKnowledgeAt, quality: "CONFLICT" };
  const eligible = input.bboEvents.filter(event => event.observedAt.getTime() <= executionKnowledgeAt.getTime());
  eligible.sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime() || b.marketSourceTimestampMs - a.marketSourceTimestampMs || b.id.localeCompare(a.id));
  const selected = eligible[0];
  if (!selected) return { ...base, executionKnowledgeAt, quality: "UNAVAILABLE" };
  const observationAgeMs = executionKnowledgeAt.getTime() - selected.observedAt.getTime();
  return { ...base, executionKnowledgeAt, quality: "OBSERVED_AT_OR_BEFORE", bboEventId: selected.id, bboObservedAt: selected.observedAt, marketSource: "BINGX_BOOK_TICKER", marketSourceTimestampMs: selected.marketSourceTimestampMs, bestBid: selected.bestBid, bestAsk: selected.bestAsk, bestBidQuantity: selected.bestBidQuantity, bestAskQuantity: selected.bestAskQuantity, providerUpdateId: selected.providerSequence, observationAgeMs };
}
