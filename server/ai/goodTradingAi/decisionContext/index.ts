/**
 * AI-8.1 / AI-8.1.1 — Decision Context Recorder public surface.
 * Record-only. Not wired to Mentor, Brain, KD, KE, KP, or OpenAI.
 */
export {
  isDecisionContextRecorderEnabled,
  getDecisionContextRepositoryMode,
  canCaptureDecisionContext,
  isUnsafeNonDurableDecisionContextStore,
  UNSAFE_NON_DURABLE_DECISION_CONTEXT_STORE,
  DECISION_CONTEXT_STORE_CAP,
  DECISION_CONTEXT_TIMELINE_CAP,
} from "./flags";
export type {
  DecisionContextRepositoryMode,
  DecisionContextStorageHealthStatus,
} from "./flags";
export {
  registerKnownMarketSnapshot,
  registerKnownDecisionGraph,
  lookupMarketRef,
  lookupDecisionGraphRef,
  lookupMarketRefEligible,
  lookupDecisionGraphRefEligible,
  summarizeMarketSnapshot,
  summarizeDecisionGraphClientSafe,
  resetContextRefRegistryForTests,
} from "./contextRefRegistry";
export {
  getDecisionContextMemory,
  resetDecisionContextMemoryForTests,
} from "./memoryStore";
export {
  freezeDecisionContext,
  newStableDecisionId,
  traderActionContextIdFrom,
} from "./freezeContext";
export {
  recordFromBingxReconciliation,
  recordSinglePositionEvent,
  getTradeDecision,
  listTradeDecisionsForUser,
  listTradeDecisionsForAccount,
} from "./recorder";
export { getDecisionContextRepository, resetDecisionContextRepositoryForTests } from "./repositoryFactory";
export { assessDecisionContextStorageHealth } from "./health";
export { buildTradeDecisionExport, assertExportSanitized, TRADE_DECISION_EXPORT_VERSION } from "./export";
export { classifyPositionTimelineEvent } from "./journalSemantics";
export { fingerprintDecisionContext } from "./postgresRepository";
export type { DecisionContextRepository, ActiveDecisionKey, DecisionPositionSide } from "./interfaces";

export {
  canUseDecisionContextForMentor,
  canUseDecisionContextForLearning,
  canMutateBrainFromDecisionContext,
  canAutoApplyDecisionContext,
  DECISION_CONTEXT_UI_BADGES,
  isPositionEventForDecision,
  mapPositionEventToTimelineType,
  POSITION_EVENTS_FOR_DECISION,
} from "@shared/goodTradingAiDecisionContext";
