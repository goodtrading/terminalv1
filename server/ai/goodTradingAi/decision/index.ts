export { isGoodTradingAiDecisionGraphEnabled, isDecisionGraphAttachAllowedForInternal } from "./features";
export { requireDecisionGraphAccess } from "./access";
export { buildDecisionContext } from "./decisionContext";
export type { DecisionContext, DecisionContextInput } from "./decisionContext";
export {
  DECISION_GRAPH_TEMPLATES,
  listDecisionGraphTemplates,
  getDecisionGraphTemplate,
  selectDecisionGraphTemplate,
} from "./templates";
export { evaluateDecisionGraph } from "./decisionGraphEngine";
export type { EvaluateDecisionGraphInput, EvaluateDecisionGraphResult } from "./decisionGraphEngine";
export { validateDecisionGraph } from "./decisionValidator";
export { toClientSafeDecisionGraph } from "./clientSafeProjection";
export { detectDecisionConflicts } from "./conflictEngine";
export { applyEvidenceHierarchy } from "./evidenceHierarchy";
export { classifyDecisionQuality } from "./decisionQuality";
export { evaluateNode } from "./nodeEvaluators";
export { maybeAttachDecisionGraphForInternal } from "./attachToReasoning";
export {
  MAX_DECISION_NODES,
  MAX_DECISION_DEPTH,
  MAX_INTERNAL_NODES,
  MAX_PATHS,
  MAX_RENDERED_NODES,
  propagateHypothesisState,
  buildPaths,
  pruneDecisionNodes,
  selectRenderedNodes,
  limitPaths,
  describeLimitPolicy,
  nodeRetentionScore,
} from "./pathEngine";
export { collectConfirmations, collectInvalidations } from "./confirmationsInvalidations";
export { priorityRank, sortByPriorityDesc } from "./priority";

/** AI-7.1 calibration (golden suite, invariants, review — no Mentor live). */
export {
  GOLDEN_DECISION_CASES,
  assertGoldenCasesContract,
  runMethodologicalInvariants,
  invariantsAllPass,
  METHODOLOGICAL_INVARIANT_IDS,
  COUNTERFACTUAL_PAIRS,
  METAMORPHIC_CASES,
  buildDecisionCalibrationReport,
  buildDecisionTrace,
  REASONING_DECISION_COHERENCE_MATRIX,
  coherenceMatrixAllAligned,
  upsertGoldenReview,
  getGoldenReview,
  listGoldenReviews,
  resetGoldenReviewsForTests,
  ADVERSARIAL_CASES,
  PRIORITY_CALIBRATION_NOTES,
} from "./calibration";
export type {
  GoldenDecisionCase,
  GoldenDecisionCategory,
  DecisionCalibrationReport,
  DecisionTrace,
  GoldenReviewRecord,
  GoldenReviewStatus,
  CounterfactualPair,
  MetamorphicCase,
  InvariantResult,
} from "./calibration";

/** AI-7.2 Human Methodology Review (blind; mentorEligible=false). */
export * from "./humanReview";
