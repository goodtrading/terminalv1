/**
 * AI-7.3.9 — Async adapters over existing file-backed stores.
 */
import {
  HumanDecisionReviewRepository,
  type HumanReviewSessionRecord,
} from "../decision/humanReview/repository";
import type { HoldoutSnapshot } from "../decision/humanReview/holdout";
import type {
  HumanDecisionAnswer,
  MethodologyChangeProposal,
} from "@shared/goodTradingAiHumanReview";
import {
  CriticalCalibrationMemory,
  type CalibrationRunRecord,
  type CriticalCalibrationSessionRecord,
} from "../criticalCalibration/memoryStore";
import type {
  CalibrationObservation,
  CalibrationQuestion,
  ImprovementProposal,
} from "@shared/goodTradingAiCriticalCalibration";
import { KnowledgeDistillationMemory } from "../knowledgeDistillation/memoryStore";
import type {
  CompressedProposal,
  DistillationRunResult,
} from "@shared/goodTradingAiKnowledgeDistillation";
import type { IndependentEvidenceAudit } from "@shared/goodTradingAiIndependentEvidence";
import type {
  CriticalCalibrationRepository,
  HumanReviewRepository,
  KnowledgeDistillationRepository,
} from "./interfaces";

export class FileHumanReviewRepository implements HumanReviewRepository {
  constructor(private readonly inner: HumanDecisionReviewRepository) {}
  createSession(input: {
    caseOrder: string[];
    seed?: string | null;
    nowMs?: number;
  }): Promise<HumanReviewSessionRecord> {
    return Promise.resolve(this.inner.createSession(input));
  }
  getSession(sessionId: string) {
    return Promise.resolve(this.inner.getSession(sessionId));
  }
  listSessions() {
    return Promise.resolve(this.inner.listSessions());
  }
  appendAnswer(sessionId: string, answer: HumanDecisionAnswer) {
    return Promise.resolve(this.inner.appendAnswer(sessionId, answer));
  }
  getAnswersForSession(sessionId: string) {
    return Promise.resolve(this.inner.getAnswersForSession(sessionId));
  }
  getLatestAnswer(sessionId: string, caseId: string) {
    return Promise.resolve(this.inner.getLatestAnswer(sessionId, caseId));
  }
  appendProposal(proposal: MethodologyChangeProposal) {
    return Promise.resolve(this.inner.appendProposal(proposal));
  }
  listProposals() {
    return Promise.resolve(this.inner.listProposals());
  }
  saveHoldoutSnapshot(snapshot: HoldoutSnapshot) {
    return Promise.resolve(this.inner.saveHoldoutSnapshot(snapshot));
  }
  loadHoldoutSnapshot() {
    return Promise.resolve(this.inner.loadHoldoutSnapshot());
  }
}

export class FileCriticalCalibrationRepository implements CriticalCalibrationRepository {
  constructor(private readonly inner: CriticalCalibrationMemory) {}
  saveProposal(proposal: ImprovementProposal) {
    return Promise.resolve(this.inner.saveProposal(proposal));
  }
  listProposals() {
    return Promise.resolve(this.inner.listProposals());
  }
  decideProposal(id: string, status: "ACCEPTED" | "REJECTED", note?: string) {
    return Promise.resolve(this.inner.decideProposal(id, status, note));
  }
  saveQuestionQueue(questions: CalibrationQuestion[]) {
    return Promise.resolve(this.inner.saveQuestionQueue(questions));
  }
  listQuestions() {
    return Promise.resolve(this.inner.listQuestions());
  }
  saveRunRecord(record: CalibrationRunRecord) {
    return Promise.resolve(this.inner.saveRunRecord(record));
  }
  listRuns() {
    return Promise.resolve(this.inner.listRuns());
  }
  saveSession(session: CriticalCalibrationSessionRecord) {
    return Promise.resolve(this.inner.saveSession(session));
  }
  getSession(id: string) {
    return Promise.resolve(this.inner.getSession(id));
  }
  listSessions() {
    return Promise.resolve(this.inner.listSessions());
  }
  saveObservation(obs: CalibrationObservation) {
    return Promise.resolve(this.inner.saveObservation(obs));
  }
  listObservations(sessionId?: string) {
    return Promise.resolve(this.inner.listObservations(sessionId));
  }
}

export class FileKnowledgeDistillationRepository implements KnowledgeDistillationRepository {
  constructor(private readonly inner: KnowledgeDistillationMemory) {}
  saveRun(result: DistillationRunResult, id?: string) {
    return Promise.resolve(this.inner.saveRun(result, id));
  }
  latestRun() {
    return Promise.resolve(this.inner.latestRun());
  }
  saveProposal(p: CompressedProposal) {
    return Promise.resolve(this.inner.saveProposal(p));
  }
  listProposals() {
    return Promise.resolve(this.inner.listProposals());
  }
  async listRunIds(): Promise<string[]> {
    const { readdirSync, existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dir = join(this.inner.rootDir, "private", "reports");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
  }
  async getRun(id: string): Promise<DistillationRunResult | null> {
    const { existsSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const file = join(this.inner.rootDir, "private", "reports", `${id}.json`);
    if (!existsSync(file)) return null;
    try {
      return JSON.parse(readFileSync(file, "utf8")) as DistillationRunResult;
    } catch {
      return null;
    }
  }
  async saveIndependentEvidenceAudit(audit: IndependentEvidenceAudit): Promise<string> {
    const { getIndependentEvidenceAuditMemory } = await import(
      "../knowledgeDistillation/independentEvidence/memoryStore"
    );
    return getIndependentEvidenceAuditMemory().saveAudit(audit);
  }
  async listIndependentEvidenceAudits(sourceRunId?: string): Promise<IndependentEvidenceAudit[]> {
    const { getIndependentEvidenceAuditMemory } = await import(
      "../knowledgeDistillation/independentEvidence/memoryStore"
    );
    const mem = getIndependentEvidenceAuditMemory();
    return sourceRunId ? mem.listAuditsForRun(sourceRunId) : mem.listAuditIds().map((id) => mem.getAudit(id)!);
  }
  async getIndependentEvidenceAudit(id: string): Promise<IndependentEvidenceAudit | null> {
    const { getIndependentEvidenceAuditMemory } = await import(
      "../knowledgeDistillation/independentEvidence/memoryStore"
    );
    return getIndependentEvidenceAuditMemory().getAudit(id);
  }
}
