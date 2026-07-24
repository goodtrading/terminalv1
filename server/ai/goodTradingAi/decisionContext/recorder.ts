/**
 * AI-8.1 / AI-8.1.1 — DecisionContextRecorder
 * Hooks BingX POSITION_* reconciliation events → TradeDecision + Timeline + Journal.
 * Record-only. Flags always false. No Mentor/KD/KE/KP/OpenAI/Brain.
 * Durable via DecisionContextRepository (memory|postgres).
 */
import type {
  BingxAccountSnapshot,
  BingxTradingActionEvent,
} from "@shared/goodTradingAiBingxAccount";
import { buildTraderActionContext } from "../../../integrations/bingx/account/aiBoundary";
import type {
  DecisionJournal,
  DecisionTimelineEvent,
  TradeDecision,
} from "@shared/goodTradingAiDecisionContext";
import { isPositionEventForDecision } from "@shared/goodTradingAiDecisionContext";
import {
  canCaptureDecisionContext,
  isDecisionContextRecorderEnabled,
  isUnsafeNonDurableDecisionContextStore,
  UNSAFE_NON_DURABLE_DECISION_CONTEXT_STORE,
} from "./flags";
import { freezeDecisionContext, newStableDecisionId } from "./freezeContext";
import { getDecisionContextRepository } from "./repositoryFactory";
import { classifyPositionTimelineEvent } from "./journalSemantics";
import type { DecisionPositionSide } from "./interfaces";

function isCloseType(
  t: ReturnType<typeof classifyPositionTimelineEvent>["timelineType"],
): boolean {
  return t === "EXIT" || t === "STOP_HIT" || t === "TP_HIT" || t === "MANUAL_CLOSE";
}

function inferPositionSide(
  event: BingxTradingActionEvent,
  snapshot: BingxAccountSnapshot,
): DecisionPositionSide {
  const explicit = (event as BingxTradingActionEvent & { positionSide?: string })
    .positionSide;
  if (explicit === "long" || explicit === "short") return explicit;
  const sym = (event.symbol ?? "").toUpperCase();
  const h = event.summary.toUpperCase();
  if (/\bLONG\b/.test(h)) return "long";
  if (/\bSHORT\b/.test(h)) return "short";
  const pos = snapshot.positions.find(
    (p) => p.symbol.toUpperCase() === sym && p.side !== "flat" && p.quantity > 0,
  );
  if (pos?.side === "long" || pos?.side === "short") return pos.side;
  return "unknown";
}

function observedPnlFromSnapshot(
  snapshot: BingxAccountSnapshot,
  symbol: string,
): number | null {
  const pos = snapshot.positions.find(
    (p) => p.symbol.toUpperCase() === symbol.toUpperCase(),
  );
  if (pos?.realizedPnl != null && Number.isFinite(pos.realizedPnl)) {
    return pos.realizedPnl;
  }
  const fills = snapshot.recentFills.filter(
    (f) => f.symbol.toUpperCase() === symbol.toUpperCase(),
  );
  if (!fills.length) return null;
  let sum = 0;
  let any = false;
  for (const f of fills) {
    if (f.realizedPnl != null && Number.isFinite(f.realizedPnl)) {
      sum += f.realizedPnl;
      any = true;
    }
  }
  return any ? sum : null;
}

function initialJournal(
  decisionId: string,
  openedAt: string,
  hypothesis: string | null,
  confirmations: string[],
  invalidations: string[],
): DecisionJournal {
  return {
    decisionId,
    initialHypothesis: hypothesis,
    confirmationsPresent: [...confirmations].slice(0, 8),
    invalidationsPresent: [...invalidations].slice(0, 8),
    changesDuringTrade: [],
    howItEnded: null,
    durationMs: null,
    observedPnl: null,
    openedAt,
    closedAt: null,
    mentorEligible: false,
    brainMutate: false,
    learning: false,
    autoApply: false,
  };
}

function makeTimelineEvent(args: {
  decisionId: string;
  event: BingxTradingActionEvent;
  type: ReturnType<typeof classifyPositionTimelineEvent>["timelineType"];
  contextId?: string;
}): DecisionTimelineEvent {
  return {
    eventId: `dte_${args.event.eventId}`,
    decisionId: args.decisionId,
    type: args.type,
    at: args.event.capturedAt,
    symbol: args.event.symbol ?? "UNKNOWN",
    traderActionEventId: args.event.eventId,
    summary: args.event.summary.slice(0, 280),
    contextId: args.contextId,
    accountMode: args.event.accountMode,
    mentorEligible: false,
    brainMutate: false,
    learning: false,
    autoApply: false,
  };
}

/**
 * Record position trading-action events from a BingX refresh/reconcile cycle.
 * Idempotent per traderActionEventId. No-ops when disabled or unsafe memory in prod.
 */
export async function recordFromBingxReconciliation(args: {
  userId: number;
  snapshot: BingxAccountSnapshot;
}): Promise<TradeDecision[]> {
  if (!isDecisionContextRecorderEnabled()) return [];
  if (isUnsafeNonDurableDecisionContextStore()) {
    // Do not start real capture — no silent memory fallback in production.
    return [];
  }
  if (!canCaptureDecisionContext()) return [];

  const events = (args.snapshot.reconciliation?.events ?? []).filter((e) =>
    isPositionEventForDecision(e.type),
  );
  if (!events.length) return [];

  const tac = buildTraderActionContext(args.snapshot);
  const touched: TradeDecision[] = [];

  for (const event of events) {
    const recorded = await recordSinglePositionEvent({
      userId: args.userId,
      event,
      snapshot: args.snapshot,
      traderActionContext: tac,
    });
    if (recorded) touched.push(recorded);
  }
  return touched;
}

export async function recordSinglePositionEvent(args: {
  userId: number;
  event: BingxTradingActionEvent;
  snapshot: BingxAccountSnapshot;
  traderActionContext?: ReturnType<typeof buildTraderActionContext> | null;
}): Promise<TradeDecision | null> {
  if (!isDecisionContextRecorderEnabled()) return null;
  if (isUnsafeNonDurableDecisionContextStore()) {
    throw new Error(UNSAFE_NON_DURABLE_DECISION_CONTEXT_STORE);
  }
  if (!canCaptureDecisionContext()) return null;
  if (!isPositionEventForDecision(args.event.type)) return null;

  const store = getDecisionContextRepository();
  const prior = await store.findByActionEvent(args.event.eventId);
  if (prior) return prior;

  const symbol = args.event.symbol ?? "UNKNOWN";
  const accountId = args.event.accountId;
  const positionSide = inferPositionSide(args.event, args.snapshot);
  const classified = classifyPositionTimelineEvent(args.event.type, args.event.summary);
  const timelineType = classified.timelineType;

  let active = await store.getActive({
    userId: args.userId,
    accountId,
    symbol,
    positionSide,
    accountMode: args.event.accountMode,
  });

  // OPEN always starts a new TradeDecision (close prior if still active).
  if (timelineType === "OPEN" && active && active.status !== "CLOSED") {
    const closedAt = args.event.capturedAt;
    const openedMs = Date.parse(active.journal.openedAt);
    const closedMs = Date.parse(closedAt);
    const durationMs =
      Number.isFinite(openedMs) && Number.isFinite(closedMs)
        ? Math.max(0, closedMs - openedMs)
        : null;
    await store.updateLifecycle({
      ...active,
      status: "CLOSED",
      updatedAt: closedAt,
      closedAt,
      journal: {
        ...active.journal,
        howItEnded: "Superseded by new POSITION_OPENED",
        closedAt,
        durationMs,
        changesDuringTrade: [
          ...active.journal.changesDuringTrade,
          `Superseded at ${closedAt} by new open`,
        ].slice(-64),
      },
      timeline: active.timeline,
    });
    active = null;
  }

  if (!active) {
    const decisionId = newStableDecisionId();
    const context = freezeDecisionContext({
      decisionId,
      event: args.event,
      accountMode: args.event.accountMode,
      traderActionContext: args.traderActionContext,
    });
    const tl = makeTimelineEvent({
      decisionId,
      event: args.event,
      type: timelineType,
      contextId: decisionId,
    });
    const status = isCloseType(timelineType) ? "CLOSED" : "OPEN";
    const closedAt = status === "CLOSED" ? args.event.capturedAt : null;
    const pnl =
      status === "CLOSED"
        ? observedPnlFromSnapshot(args.snapshot, symbol)
        : null;
    const journal = initialJournal(
      decisionId,
      args.event.capturedAt,
      context.decisionState.hypothesis,
      context.decisionState.confirmations,
      context.decisionState.invalidations,
    );
    if (status === "CLOSED") {
      journal.howItEnded =
        classified.howItEnded ||
        `${timelineType}: ${args.event.summary}`.slice(0, 280);
      journal.closedAt = closedAt;
      journal.durationMs = 0;
      journal.observedPnl = pnl;
    } else if (timelineType !== "OPEN") {
      journal.changesDuringTrade = [
        `${timelineType} at open capture: ${args.event.summary}`.slice(0, 280),
      ];
    }

    const decision = {
      decisionId,
      userId: args.userId,
      accountId,
      symbol,
      positionSide,
      accountMode: args.event.accountMode,
      status: status === "CLOSED" ? ("CLOSED" as const) : ("OPEN" as const),
      createdAt: args.event.capturedAt,
      updatedAt: args.event.capturedAt,
      closedAt,
      context,
      timeline: [tl],
      journal,
      mentorEligible: false as const,
      brainMutate: false as const,
      learning: false as const,
      autoApply: false as const,
    } as TradeDecision & { positionSide: DecisionPositionSide };

    return store.create(decision);
  }

  const tl = makeTimelineEvent({
    decisionId: active.decisionId,
    event: args.event,
    type: timelineType,
  });
  const changes = [
    ...active.journal.changesDuringTrade,
    `${timelineType}: ${args.event.summary}`.slice(0, 280),
  ].slice(-64);

  let status = active.status === "OPEN" ? "ACTIVE" : active.status;
  let closedAt = active.closedAt;
  let howItEnded = active.journal.howItEnded;
  let durationMs = active.journal.durationMs;
  let observedPnl = active.journal.observedPnl;

  if (isCloseType(timelineType)) {
    status = "CLOSED";
    closedAt = args.event.capturedAt;
    howItEnded =
      classified.howItEnded ||
      `${timelineType}: ${args.event.summary}`.slice(0, 280);
    const openedMs = Date.parse(active.journal.openedAt);
    const closedMs = Date.parse(closedAt);
    durationMs =
      Number.isFinite(openedMs) && Number.isFinite(closedMs)
        ? Math.max(0, closedMs - openedMs)
        : null;
    observedPnl = observedPnlFromSnapshot(args.snapshot, symbol);
  }

  return store.updateLifecycle({
    ...active,
    status,
    updatedAt: args.event.capturedAt,
    closedAt,
    timeline: [...active.timeline, tl].slice(-200),
    journal: {
      ...active.journal,
      changesDuringTrade: changes,
      howItEnded,
      durationMs,
      observedPnl,
      closedAt,
    },
  });
}

export async function getTradeDecision(
  decisionId: string,
): Promise<TradeDecision | null> {
  return getDecisionContextRepository().get(decisionId);
}

export async function listTradeDecisionsForUser(
  userId: number,
  limit = 50,
): Promise<TradeDecision[]> {
  return getDecisionContextRepository().listForUser(userId, limit);
}

export async function listTradeDecisionsForAccount(
  userId: number,
  accountId: string,
  limit = 50,
): Promise<TradeDecision[]> {
  return getDecisionContextRepository().listForAccount(userId, accountId, limit);
}
