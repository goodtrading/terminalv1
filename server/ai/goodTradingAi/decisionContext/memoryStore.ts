/**
 * AI-8.1 / AI-8.1.1 — Append-only bounded in-memory store for TradeDecisions.
 * No secrets. No raw BingX dumps. Freeze: context object never overwritten.
 * Active key includes positionSide + accountMode (LONG ≠ SHORT hedge).
 */
import type { TradeDecision } from "@shared/goodTradingAiDecisionContext";
import type { BingxAccountMode } from "@shared/goodTradingAiBingxAccount";
import {
  DECISION_CONTEXT_STORE_CAP,
  DECISION_CONTEXT_TIMELINE_CAP,
} from "./flags";
import type { ActiveDecisionKey, DecisionPositionSide } from "./interfaces";

function positionSideOf(d: TradeDecision): DecisionPositionSide {
  const raw = (d as TradeDecision & { positionSide?: string }).positionSide;
  if (raw === "long" || raw === "short") return raw;
  return "unknown";
}

class DecisionContextMemory {
  private byId = new Map<string, TradeDecision>();
  private order: string[] = [];
  /** userId:accountId:symbol:positionSide:accountMode → active decisionId */
  private active = new Map<string, string>();
  /** traderActionEventId → decisionId (idempotency) */
  private byActionEvent = new Map<string, string>();

  activeKey(key: ActiveDecisionKey): string {
    return `${key.userId}:${key.accountId}:${key.symbol.toUpperCase()}:${key.positionSide}:${key.accountMode}`;
  }

  private keyFromDecision(d: TradeDecision): string {
    return this.activeKey({
      userId: d.userId,
      accountId: d.accountId,
      symbol: d.symbol,
      positionSide: positionSideOf(d),
      accountMode: d.accountMode,
    });
  }

  get(decisionId: string): TradeDecision | null {
    const d = this.byId.get(decisionId);
    return d ? structuredClone(d) : null;
  }

  /** @deprecated prefer getActiveByKey — kept for transitional callers */
  getActive(
    userId: number,
    accountId: string,
    symbol: string,
    positionSide: DecisionPositionSide = "unknown",
    accountMode: BingxAccountMode = "REAL_BINGX_READ_ONLY",
  ): TradeDecision | null {
    return this.getActiveByKey({
      userId,
      accountId,
      symbol,
      positionSide,
      accountMode,
    });
  }

  getActiveByKey(key: ActiveDecisionKey): TradeDecision | null {
    const id = this.active.get(this.activeKey(key));
    return id ? this.get(id) : null;
  }

  findByActionEvent(traderActionEventId: string): TradeDecision | null {
    const id = this.byActionEvent.get(traderActionEventId);
    return id ? this.get(id) : null;
  }

  claimActionEvent(traderActionEventId: string, decisionId: string): void {
    if (!this.byActionEvent.has(traderActionEventId)) {
      this.byActionEvent.set(traderActionEventId, decisionId);
    }
  }

  listForUser(userId: number, limit = 50): TradeDecision[] {
    const n = Math.max(1, Math.min(DECISION_CONTEXT_STORE_CAP, limit));
    const out: TradeDecision[] = [];
    for (let i = this.order.length - 1; i >= 0 && out.length < n; i--) {
      const d = this.byId.get(this.order[i]!);
      if (d && d.userId === userId) out.push(structuredClone(d));
    }
    return out;
  }

  listForAccount(
    userId: number,
    accountId: string,
    limit = 50,
  ): TradeDecision[] {
    return this.listForUser(userId, DECISION_CONTEXT_STORE_CAP)
      .filter((d) => d.accountId === accountId)
      .slice(0, Math.max(1, Math.min(DECISION_CONTEXT_STORE_CAP, limit)));
  }

  create(decision: TradeDecision): TradeDecision {
    if (this.byId.has(decision.decisionId)) {
      throw new Error("DECISION_APPEND_ONLY_REFUSES_OVERWRITE");
    }
    if (decision.timeline.length > DECISION_CONTEXT_TIMELINE_CAP) {
      throw new Error("DECISION_TIMELINE_CAP_EXCEEDED");
    }
    const frozen = deepFreezeClone(decision);
    this.byId.set(decision.decisionId, frozen);
    this.order.push(decision.decisionId);
    this.byActionEvent.set(
      decision.context.traderActionEventId,
      decision.decisionId,
    );
    if (decision.status !== "CLOSED") {
      this.active.set(this.keyFromDecision(decision), decision.decisionId);
    }
    this.trim();
    return structuredClone(frozen);
  }

  updateLifecycle(next: TradeDecision): TradeDecision {
    const prev = this.byId.get(next.decisionId);
    if (!prev) throw new Error("DECISION_NOT_FOUND");
    assertContextFrozen(prev, next);
    if (next.timeline.length > DECISION_CONTEXT_TIMELINE_CAP) {
      throw new Error("DECISION_TIMELINE_CAP_EXCEEDED");
    }
    for (const ev of next.timeline) {
      this.byActionEvent.set(ev.traderActionEventId, next.decisionId);
    }
    const frozen = deepFreezeClone(next);
    this.byId.set(next.decisionId, frozen);
    const key = this.keyFromDecision(next);
    if (next.status === "CLOSED") {
      if (this.active.get(key) === next.decisionId) this.active.delete(key);
    } else {
      this.active.set(key, next.decisionId);
    }
    return structuredClone(frozen);
  }

  private trim(): void {
    while (this.order.length > DECISION_CONTEXT_STORE_CAP) {
      const oldest = this.order.shift();
      if (!oldest) break;
      const d = this.byId.get(oldest);
      if (!d) continue;
      this.byId.delete(oldest);
      for (const [k, v] of Array.from(this.active.entries())) {
        if (v === oldest) this.active.delete(k);
      }
      for (const [k, v] of Array.from(this.byActionEvent.entries())) {
        if (v === oldest) this.byActionEvent.delete(k);
      }
      void d;
    }
  }
}

function deepFreezeClone(decision: TradeDecision): TradeDecision {
  const clone = structuredClone(decision);
  Object.freeze(clone.context);
  Object.freeze(clone.context.decisionState);
  Object.freeze(clone.context.decisionState.confirmations);
  Object.freeze(clone.context.decisionState.invalidations);
  Object.freeze(clone.context.market);
  Object.freeze(clone);
  return clone;
}

function assertContextFrozen(prev: TradeDecision, next: TradeDecision): void {
  const a = JSON.stringify(prev.context);
  const b = JSON.stringify(next.context);
  if (a !== b) {
    throw new Error("DECISION_CONTEXT_IMMUTABLE_VIOLATION");
  }
}

let singleton: DecisionContextMemory | null = null;

export function getDecisionContextMemory(): DecisionContextMemory {
  if (!singleton) singleton = new DecisionContextMemory();
  return singleton;
}

export function resetDecisionContextMemoryForTests(): void {
  singleton = new DecisionContextMemory();
}
