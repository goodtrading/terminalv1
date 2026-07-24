/**
 * AI-8.1 — Freeze DecisionContext at the instant of a trading-action event.
 * Never recalculates later. MS/DG missing → null refs + UNCERTAIN/DEGRADED/MISSING.
 */
import { randomUUID, createHash } from "crypto";
import type {
  BingxTradingActionEvent,
  BingxAccountMode,
  TraderActionContext,
} from "@shared/goodTradingAiBingxAccount";
import type {
  DecisionContext,
  DecisionContextFreshness,
  DecisionMarketSummaries,
  DecisionStateSummary,
} from "@shared/goodTradingAiDecisionContext";
import { DECISION_CONTEXT_SCHEMA_VERSION } from "@shared/goodTradingAiDecisionContext";
import {
  lookupDecisionGraphRefEligible,
  lookupMarketRefEligible,
} from "./contextRefRegistry";

const EMPTY_MARKET: DecisionMarketSummaries = {
  gammaRegime: null,
  dealerRegime: null,
  liquidityRegime: null,
  absorption: null,
  spoof: null,
  oi: null,
  cvd: null,
  footprint: null,
};

export function traderActionContextIdFrom(
  accountId: string,
  capturedAt: string,
): string {
  return (
    "tac_" +
    createHash("sha256")
      .update(`${accountId}|${capturedAt}`)
      .digest("hex")
      .slice(0, 24)
  );
}

export function freezeDecisionContext(args: {
  decisionId: string;
  event: BingxTradingActionEvent;
  accountMode: BingxAccountMode;
  traderActionContext?: TraderActionContext | null;
  /** Optional override for tests — when omitted, registry lookup is used. */
  marketSnapshotId?: string | null;
  decisionGraphId?: string | null;
  decisionState?: DecisionStateSummary | null;
  market?: DecisionMarketSummaries | null;
  dataFreshness?: DecisionContextFreshness | null;
}): DecisionContext {
  const symbol = args.event.symbol ?? "UNKNOWN";
  const nowMs = Date.parse(args.event.capturedAt);
  const marketLookup = lookupMarketRefEligible(
    symbol,
    Number.isFinite(nowMs) ? nowMs : Date.now(),
  );
  const graphLookup = lookupDecisionGraphRefEligible(
    symbol,
    Number.isFinite(nowMs) ? nowMs : Date.now(),
  );
  const marketRef = marketLookup.ref;
  const graphRef = graphLookup.ref;

  const marketSnapshotId =
    args.marketSnapshotId !== undefined
      ? args.marketSnapshotId
      : marketRef?.marketSnapshotId ?? null;
  const decisionGraphId =
    args.decisionGraphId !== undefined
      ? args.decisionGraphId
      : graphRef?.decisionGraphId ?? null;

  let dataFreshness: DecisionContextFreshness =
    args.dataFreshness ??
    args.decisionState?.dataFreshness ??
    graphRef?.decisionState.dataFreshness ??
    marketRef?.freshness ??
    "MISSING";

  if (!marketSnapshotId && !decisionGraphId) {
    if (dataFreshness === "FRESH") dataFreshness = "UNCERTAIN";
    if (!args.decisionState && !graphRef) dataFreshness = "MISSING";
  } else if (!marketSnapshotId || !decisionGraphId) {
    if (dataFreshness === "FRESH") dataFreshness = "DEGRADED";
  }
  // reasonCodes available for diagnostics but never invent refs
  void marketLookup.reasonCode;
  void graphLookup.reasonCode;

  const fromGraph = graphRef?.decisionState;
  const decisionState: DecisionStateSummary = {
    hypothesis: args.decisionState?.hypothesis ?? fromGraph?.hypothesis ?? null,
    confirmations: [
      ...(args.decisionState?.confirmations ?? fromGraph?.confirmations ?? []),
    ].slice(0, 8),
    invalidations: [
      ...(args.decisionState?.invalidations ?? fromGraph?.invalidations ?? []),
    ].slice(0, 8),
    confidence:
      args.decisionState?.confidence ??
      fromGraph?.confidence ??
      marketRef?.confidence ??
      null,
    evidenceQuality:
      args.decisionState?.evidenceQuality ?? fromGraph?.evidenceQuality ?? null,
    dataFreshness,
  };

  const market: DecisionMarketSummaries =
    args.market ?? marketRef?.market ?? { ...EMPTY_MARKET };

  const tacId = args.traderActionContext
    ? traderActionContextIdFrom(
        args.event.accountId,
        args.traderActionContext.lastConfirmedActionAt ??
          args.event.capturedAt,
      )
    : traderActionContextIdFrom(args.event.accountId, args.event.capturedAt);

  const ctx: DecisionContext = {
    schemaVersion: DECISION_CONTEXT_SCHEMA_VERSION,
    decisionId: args.decisionId,
    createdAt: args.event.capturedAt,
    symbol,
    accountMode: args.accountMode,
    traderActionEventId: args.event.eventId,
    marketSnapshotId,
    decisionGraphId,
    traderActionContextId: tacId,
    decisionState: {
      hypothesis: decisionState.hypothesis,
      confirmations: [...decisionState.confirmations].slice(0, 8),
      invalidations: [...decisionState.invalidations].slice(0, 8),
      confidence: decisionState.confidence,
      evidenceQuality: decisionState.evidenceQuality,
      dataFreshness,
    },
    market: { ...market },
    mentorEligible: false,
    brainMutate: false,
    learning: false,
    autoApply: false,
  };

  return Object.freeze({
    ...ctx,
    decisionState: Object.freeze({
      ...ctx.decisionState,
      confirmations: Object.freeze([...ctx.decisionState.confirmations]),
      invalidations: Object.freeze([...ctx.decisionState.invalidations]),
    }),
    market: Object.freeze({ ...ctx.market }),
  }) as DecisionContext;
}

export function newStableDecisionId(): string {
  return randomUUID();
}
