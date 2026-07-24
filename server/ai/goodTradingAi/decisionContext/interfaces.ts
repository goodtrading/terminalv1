/**
 * AI-8.1.1 — Decision Context repository contract.
 * Append-only timeline; frozen DecisionContext; idempotent by traderActionEventId.
 */
import type { TradeDecision } from "@shared/goodTradingAiDecisionContext";
import type { BingxAccountMode } from "@shared/goodTradingAiBingxAccount";

export type DecisionPositionSide = "long" | "short" | "unknown";

export type ActiveDecisionKey = {
  userId: number;
  accountId: string;
  symbol: string;
  positionSide: DecisionPositionSide;
  accountMode: BingxAccountMode;
};

export interface DecisionContextRepository {
  get(decisionId: string): Promise<TradeDecision | null>;
  getActive(key: ActiveDecisionKey): Promise<TradeDecision | null>;
  findByActionEvent(traderActionEventId: string): Promise<TradeDecision | null>;
  listForUser(userId: number, limit?: number): Promise<TradeDecision[]>;
  listForAccount(
    userId: number,
    accountId: string,
    limit?: number,
  ): Promise<TradeDecision[]>;
  /** Append-only create. Refuses overwrite of existing decisionId. */
  create(decision: TradeDecision): Promise<TradeDecision>;
  /**
   * Replace lifecycle fields only. NEVER replaces frozen context.
   * Throws DECISION_CONTEXT_IMMUTABLE_VIOLATION on context change.
   */
  updateLifecycle(next: TradeDecision): Promise<TradeDecision>;
  /** Claim traderActionEventId for idempotency; returns false if already claimed. */
  tryClaimActionEvent?(
    traderActionEventId: string,
    decisionId: string,
  ): Promise<boolean>;
}
