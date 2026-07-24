/**
 * AI-7.3.9 — Postgres-backed repositories (JSONB docs). Parameterized SQL only.
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
import { canAcceptProposal } from "../criticalCalibration/proposalEngine";
import type { HumanReviewSessionRecord } from "../decision/humanReview/repository";
import type { HoldoutSnapshot } from "../decision/humanReview/holdout";
import type {
  CalibrationRunRecord,
  CriticalCalibrationSessionRecord,
} from "../criticalCalibration/memoryStore";
import { getDoc, listDocs, listDocIds, upsertDoc } from "./postgresSchema";
import type {
  CriticalCalibrationRepository,
  HumanReviewRepository,
  KnowledgeDistillationRepository,
} from "./interfaces";
import { randomUUID } from "node:crypto";

const NS_HR = "hr";
const NS_CC = "cc";
const NS_KD = "kd";

export class PostgresHumanReviewRepository implements HumanReviewRepository {
  async createSession(input: {
    caseOrder: string[];
    seed?: string | null;
    nowMs?: number;
  }): Promise<HumanReviewSessionRecord> {
    const session: HumanReviewSessionRecord = {
      id: randomUUID(),
      createdAtMs: input.nowMs ?? Date.now(),
      seed: input.seed ?? null,
      caseOrder: [...input.caseOrder],
      owner: "IGNACIO",
      mentorEligible: false,
    };
    await upsertDoc({
      namespace: NS_HR,
      collection: "sessions",
      id: session.id,
      payload: session,
      nowMs: session.createdAtMs,
    });
    return session;
  }
  getSession(sessionId: string) {
    return getDoc<HumanReviewSessionRecord>(NS_HR, "sessions", sessionId);
  }
  async listSessions() {
    const all = await listDocs<HumanReviewSessionRecord>(NS_HR, "sessions");
    return all.sort((a, b) => b.createdAtMs - a.createdAtMs);
  }
  async appendAnswer(sessionId: string, answer: HumanDecisionAnswer) {
    const key = `${sessionId}::${answer.reviewCaseId}`;
    const prior =
      (await getDoc<{ revisions: HumanDecisionAnswer[] }>(NS_HR, "answers", key))?.revisions ??
      [];
    const maxRev = prior.reduce((m, a) => Math.max(m, a.revision), 0);
    if (answer.revision !== maxRev + 1) {
      throw new Error(`Answer revision must be ${maxRev + 1} (got ${answer.revision}); append-only`);
    }
    const next = [...prior.map((a) => structuredClone(a)), structuredClone(answer)];
    await upsertDoc({
      namespace: NS_HR,
      collection: "answers",
      id: key,
      parentId: sessionId,
      payload: { revisions: next },
    });
    return answer;
  }
  async getAnswersForSession(sessionId: string) {
    const rows = await listDocs<{ revisions: HumanDecisionAnswer[] }>(NS_HR, "answers", sessionId);
    const latest: HumanDecisionAnswer[] = [];
    for (const row of rows) {
      const revs = row.revisions ?? [];
      if (!revs.length) continue;
      latest.push(revs.reduce((a, b) => (b.revision > a.revision ? b : a)));
    }
    return latest;
  }
  async getLatestAnswer(sessionId: string, caseId: string) {
    const key = `${sessionId}::${caseId}`;
    const row = await getDoc<{ revisions: HumanDecisionAnswer[] }>(NS_HR, "answers", key);
    const revs = row?.revisions ?? [];
    if (!revs.length) return null;
    return revs.reduce((a, b) => (b.revision > a.revision ? b : a));
  }
  async appendProposal(proposal: MethodologyChangeProposal) {
    await upsertDoc({ namespace: NS_HR, collection: "proposals", id: proposal.id, payload: proposal });
    return proposal;
  }
  listProposals() {
    return listDocs<MethodologyChangeProposal>(NS_HR, "proposals");
  }
  async saveHoldoutSnapshot(snapshot: HoldoutSnapshot) {
    await upsertDoc({ namespace: NS_HR, collection: "meta", id: "holdout", payload: snapshot });
    return snapshot;
  }
  loadHoldoutSnapshot() {
    return getDoc<HoldoutSnapshot>(NS_HR, "meta", "holdout");
  }
}

export class PostgresCriticalCalibrationRepository implements CriticalCalibrationRepository {
  async saveProposal(proposal: ImprovementProposal) {
    await upsertDoc({ namespace: NS_CC, collection: "proposals", id: proposal.id, payload: proposal });
    return proposal;
  }
  listProposals() {
    return listDocs<ImprovementProposal>(NS_CC, "proposals");
  }
  async decideProposal(id: string, status: "ACCEPTED" | "REJECTED", note?: string) {
    const all = await this.listProposals();
    const p = all.find((x) => x.id === id);
    if (!p) return null;
    if (status === "ACCEPTED") {
      const gate = canAcceptProposal(p, await this.listObservations());
      if (!gate.ok) throw new Error(`PROPOSAL_SUPPORT_INSUFFICIENT: ${gate.reason}`);
    }
    const updated: ImprovementProposal = {
      ...p,
      status,
      decidedAtMs: Date.now(),
      decisionNote: note?.slice(0, 600),
      autoApply: false,
      brainMutate: false,
      mentorEligible: false,
    };
    await this.saveProposal(updated);
    if (note) {
      await upsertDoc({
        namespace: NS_CC,
        collection: "notes",
        id,
        payload: { note: note.slice(0, 600) },
      });
    }
    return updated;
  }
  async saveQuestionQueue(questions: CalibrationQuestion[]) {
    await upsertDoc({
      namespace: NS_CC,
      collection: "meta",
      id: "questions-queue",
      payload: { questions, savedAtMs: Date.now() },
    });
    return questions;
  }
  async listQuestions() {
    const raw = await getDoc<{ questions?: CalibrationQuestion[] }>(NS_CC, "meta", "questions-queue");
    return raw?.questions ?? [];
  }
  async saveRunRecord(record: CalibrationRunRecord) {
    await upsertDoc({ namespace: NS_CC, collection: "runs", id: record.id, payload: record });
    return record;
  }
  listRuns() {
    return listDocs<CalibrationRunRecord>(NS_CC, "runs");
  }
  async saveSession(session: CriticalCalibrationSessionRecord) {
    await upsertDoc({ namespace: NS_CC, collection: "sessions", id: session.id, payload: session });
    return session;
  }
  getSession(id: string) {
    return getDoc<CriticalCalibrationSessionRecord>(NS_CC, "sessions", id);
  }
  listSessions() {
    return listDocs<CriticalCalibrationSessionRecord>(NS_CC, "sessions");
  }
  async saveObservation(obs: CalibrationObservation) {
    await upsertDoc({
      namespace: NS_CC,
      collection: "observations",
      id: obs.id,
      parentId: obs.sessionId,
      payload: obs,
    });
    return obs;
  }
  listObservations(sessionId?: string) {
    return listDocs<CalibrationObservation>(NS_CC, "observations", sessionId);
  }
}

export class PostgresKnowledgeDistillationRepository implements KnowledgeDistillationRepository {
  async saveRun(result: DistillationRunResult, id = `run_${Date.now()}`) {
    await upsertDoc({ namespace: NS_KD, collection: "runs", id, payload: result });
    for (const p of result.compressedProposals) await this.saveProposal(p);
    return id;
  }
  async latestRun() {
    const ids = await listDocIds(NS_KD, "runs");
    if (!ids.length) return null;
    return getDoc<DistillationRunResult>(NS_KD, "runs", ids[ids.length - 1]!);
  }
  async saveProposal(p: CompressedProposal) {
    await upsertDoc({ namespace: NS_KD, collection: "proposals", id: p.id, payload: p });
    return p;
  }
  listProposals() {
    return listDocs<CompressedProposal>(NS_KD, "proposals");
  }
  listRunIds() {
    return listDocIds(NS_KD, "runs");
  }
  getRun(id: string) {
    return getDoc<DistillationRunResult>(NS_KD, "runs", id);
  }
  async saveIndependentEvidenceAudit(audit: IndependentEvidenceAudit) {
    const existing = await getDoc(NS_KD, "independent_evidence_audits", audit.id);
    if (existing) throw new Error("AUDIT_APPEND_ONLY_REFUSES_OVERWRITE");
    await upsertDoc({
      namespace: NS_KD,
      collection: "independent_evidence_audits",
      id: audit.id,
      payload: audit,
    });
    return audit.id;
  }
  async listIndependentEvidenceAudits(sourceRunId?: string) {
    const all = await listDocs<IndependentEvidenceAudit>(NS_KD, "independent_evidence_audits");
    if (!sourceRunId) return all;
    return all.filter((a) => a.sourceRunId === sourceRunId);
  }
  getIndependentEvidenceAudit(id: string) {
    return getDoc<IndependentEvidenceAudit>(NS_KD, "independent_evidence_audits", id);
  }
}
