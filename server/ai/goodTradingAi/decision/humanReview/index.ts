/**
 * AI-7.2 — Human Methodology Review barrel.
 */
export { isGoodTradingAiDecisionReviewEnabled } from "./features";
export { requireDecisionReviewAccess } from "./access";
export {
  toBlindCaseView,
  randomizeCaseOrder,
  hashAnswerBody,
  scenarioLeaksAnswer,
} from "./biasControls";
export { classifyThreeWay, suggestTaxonomy } from "./comparison";
export {
  HUMAN_REVIEW_CASES,
  assertHumanReviewCasesContract,
  getHumanReviewCase,
  listNonHoldoutCases,
  listHoldoutCases,
} from "./reviewCases";
export {
  createHoldoutSnapshot,
  computeHoldoutFingerprint,
  verifyHoldoutPreservation,
  type HoldoutSnapshot,
} from "./holdout";
export {
  HumanDecisionReviewRepository,
  getHumanDecisionReviewRepository,
  setHumanDecisionReviewRepositoryForTests,
  type HumanReviewSessionRecord,
} from "./repository";
export { createMethodologyProposalFromComparison } from "./approval";
export {
  groupProposalsByTaxonomy,
  groupProposalsBySuggestedAction,
} from "./proposals";
export { buildHumanDecisionReviewReport } from "./report";
export {
  buildDecisionMethodologyReviewPacket,
  type DecisionMethodologyReviewPacket,
} from "./packet";
export {
  startBlindSession,
  submitHumanAnswer,
  revealAfterSubmit,
  buildSessionReport,
  type BlindSessionStartResult,
  type SubmitAnswerInput,
  type RevealResult,
} from "./sessionService";
