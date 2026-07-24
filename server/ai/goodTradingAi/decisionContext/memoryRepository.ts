/**
 * AI-8.1.1 — Async memory adapter over DecisionContextMemory.
 * Used for tests / local; never as production capture authority when recorder ON.
 */
import type { TradeDecision } from "@shared/goodTradingAiDecisionContext";
import type {
  ActiveDecisionKey,
  DecisionContextRepository,
} from "./interfaces";
import { getDecisionContextMemory } from "./memoryStore";

export class MemoryDecisionContextRepository implements DecisionContextRepository {
  async get(decisionId: string): Promise<TradeDecision | null> {
    return getDecisionContextMemory().get(decisionId);
  }

  async getActive(key: ActiveDecisionKey): Promise<TradeDecision | null> {
    return getDecisionContextMemory().getActiveByKey(key);
  }

  async findByActionEvent(traderActionEventId: string): Promise<TradeDecision | null> {
    return getDecisionContextMemory().findByActionEvent(traderActionEventId);
  }

  async listForUser(userId: number, limit = 50): Promise<TradeDecision[]> {
    return getDecisionContextMemory().listForUser(userId, limit);
  }

  async listForAccount(
    userId: number,
    accountId: string,
    limit = 50,
  ): Promise<TradeDecision[]> {
    return getDecisionContextMemory().listForAccount(userId, accountId, limit);
  }

  async create(decision: TradeDecision): Promise<TradeDecision> {
    return getDecisionContextMemory().create(decision);
  }

  async updateLifecycle(next: TradeDecision): Promise<TradeDecision> {
    return getDecisionContextMemory().updateLifecycle(next);
  }

  async tryClaimActionEvent(
    traderActionEventId: string,
    decisionId: string,
  ): Promise<boolean> {
    const store = getDecisionContextMemory();
    const existing = store.findByActionEvent(traderActionEventId);
    if (existing) return false;
    store.claimActionEvent(traderActionEventId, decisionId);
    return true;
  }
}
