/**
 * AI-7.3.9 — Repository interfaces for Human Review, Critical Calibration, KD.
 */
import type {
  HumanDecisionAnswer,
  MethodologyChangeProposal,
} from "@shared/goodTradingAiHumanReview";
import type {
  CalibrationObservation,
  CalibrationQuestion,
  ImprovementProposal,
} from "@shared/goodTradingAiCriticalCalibration";
import type {
  CompressedProposal,
  DistillationRunResult,
} from "@shared/goodTradingAiKnowledgeDistillation";
import type { IndependentEvidenceAudit } from "@shared/goodTradingAiIndependentEvidence";
import type { CrossCaseValidationAudit } from "@shared/goodTradingAiCrossCaseValidation";
import type { HumanReviewSessionRecord } from "../decision/humanReview/repository";
import type { HoldoutSnapshot } from "../decision/humanReview/holdout";
import type {
  CalibrationRunRecord,
  CriticalCalibrationSessionRecord,
} from "../criticalCalibration/memoryStore";

export interface HumanReviewRepository {
  createSession(input: {
    caseOrder: string[];
    seed?: string | null;
    nowMs?: number;
  }): Promise<HumanReviewSessionRecord>;
  getSession(sessionId: string): Promise<HumanReviewSessionRecord | null>;
  listSessions(): Promise<HumanReviewSessionRecord[]>;
  appendAnswer(sessionId: string, answer: HumanDecisionAnswer): Promise<HumanDecisionAnswer>;
  getAnswersForSession(sessionId: string): Promise<HumanDecisionAnswer[]>;
  getLatestAnswer(sessionId: string, caseId: string): Promise<HumanDecisionAnswer | null>;
  appendProposal(proposal: MethodologyChangeProposal): Promise<MethodologyChangeProposal>;
  listProposals(): Promise<MethodologyChangeProposal[]>;
  saveHoldoutSnapshot(snapshot: HoldoutSnapshot): Promise<HoldoutSnapshot>;
  loadHoldoutSnapshot(): Promise<HoldoutSnapshot | null>;
}

export interface CriticalCalibrationRepository {
  saveProposal(proposal: ImprovementProposal): Promise<ImprovementProposal>;
  listProposals(): Promise<ImprovementProposal[]>;
  decideProposal(
    id: string,
    status: "ACCEPTED" | "REJECTED",
    note?: string,
  ): Promise<ImprovementProposal | null>;
  saveQuestionQueue(questions: CalibrationQuestion[]): Promise<CalibrationQuestion[]>;
  listQuestions(): Promise<CalibrationQuestion[]>;
  saveRunRecord(record: CalibrationRunRecord): Promise<CalibrationRunRecord>;
  listRuns(): Promise<CalibrationRunRecord[]>;
  saveSession(session: CriticalCalibrationSessionRecord): Promise<CriticalCalibrationSessionRecord>;
  getSession(id: string): Promise<CriticalCalibrationSessionRecord | null>;
  listSessions(): Promise<CriticalCalibrationSessionRecord[]>;
  saveObservation(obs: CalibrationObservation): Promise<CalibrationObservation>;
  listObservations(sessionId?: string): Promise<CalibrationObservation[]>;
}

export interface KnowledgeDistillationRepository {
  saveRun(result: DistillationRunResult, id?: string): Promise<string>;
  latestRun(): Promise<DistillationRunResult | null>;
  saveProposal(p: CompressedProposal): Promise<CompressedProposal>;
  listProposals(): Promise<CompressedProposal[]>;
  listRunIds(): Promise<string[]>;
  getRun(id: string): Promise<DistillationRunResult | null>;
  /** AI-7.3.12 — append-only audit linked to source run; never overwrites runs. */
  saveIndependentEvidenceAudit?(audit: IndependentEvidenceAudit): Promise<string>;
  listIndependentEvidenceAudits?(sourceRunId?: string): Promise<IndependentEvidenceAudit[]>;
  getIndependentEvidenceAudit?(id: string): Promise<IndependentEvidenceAudit | null>;
  /** AI-7.3.13 — append-only cross-case validation audit; never overwrites. */
  saveCrossCaseValidationAudit?(audit: CrossCaseValidationAudit): Promise<string>;
  listCrossCaseValidationAudits?(sourceRunId?: string): Promise<CrossCaseValidationAudit[]>;
  getCrossCaseValidationAudit?(id: string): Promise<CrossCaseValidationAudit | null>;
}
