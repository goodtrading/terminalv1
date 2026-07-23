import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, beforeEach } from "node:test";
import {
  distilledObservationSchema,
  adaptiveQuestionSchema,
  challengeItemSchema,
  compressedProposalSchema,
  distillationRunResultSchema,
} from "@shared/goodTradingAiKnowledgeDistillation";
import type { DistilledObservation } from "@shared/goodTradingAiKnowledgeDistillation";
import { HumanDecisionReviewRepository } from "../decision/humanReview/repository";
import {
  resetCriticalCalibrationMemoryForTests,
  getCriticalCalibrationMemory,
} from "../criticalCalibration/memoryStore";
import {
  startCriticalCalibrationSession,
  submitCalibrationAnswer,
} from "../criticalCalibration/sessionService";
import { resetKnowledgeDistillationMemoryForTests } from "./memoryStore";
import {
  normalizeText,
  conceptKeyFromText,
  extractLensesFromText,
  tokenOverlap,
} from "./normalize";
import { clusterRules } from "./ruleClustering";
import { compressClusters } from "./compression";
import { buildConflictHeatmap } from "./conflictHeatmap";
import { buildCoverageHeatmap } from "./coverageHeatmap";
import { computeRuleConfidences } from "./confidenceModel";
import { findKnowledgeGaps } from "./knowledgeGaps";
import { generateAdaptiveQuestions } from "./adaptiveQuestions";
import { buildAdaptiveQueue } from "./adaptiveQueue";
import { buildChallenges } from "./challengeEngine";
import { scoreChallenges } from "./challengeScore";
import { compressProposals } from "./proposalCompression";
import { buildEvolutionReport } from "./evolutionReport";
import { runKnowledgeDistillation } from "./pipeline";
import { isGoodTradingAiKnowledgeDistillationEnabled } from "./features";

function obs(
  partial: Partial<DistilledObservation> & Pick<DistilledObservation, "id" | "text">,
): DistilledObservation {
  return distilledObservationSchema.parse({
    sourceKind: "CRITICAL_CALIBRATION",
    sessionId: "sess_test",
    itemId: "item_1",
    lenses: partial.lenses ?? extractLensesFromText(partial.text),
    signals: partial.signals ?? ["ANSWER"],
    createdAtMs: Date.now(),
    mentorEligible: false,
    ...partial,
  });
}

describe("AI-7.3.4 Knowledge Distillation", () => {
  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "kd-"));
    resetKnowledgeDistillationMemoryForTests(join(dir, "kd"));
    resetCriticalCalibrationMemoryForTests(join(dir, "cc"));
    process.env.GOODTRADING_AI_HUMAN_REVIEW_DIR = join(dir, "hr");
  });

  describe("normalize / clustering", () => {
    it("normalizes accents and extracts lenses", () => {
      assert.equal(normalizeText("Absorcion > Delta"), "absorcion > delta");
      const lenses = extractLensesFromText("Absorcion pesa mas que Delta y CVD");
      assert.ok(lenses.includes("ABSORPTION"));
      assert.ok(lenses.includes("DELTA"));
      const k1 = conceptKeyFromText("Absorcion pesa mas que Delta", ["ABSORPTION", "DELTA"]);
      const k2 = conceptKeyFromText("absorcion pesa mas delta", ["ABSORPTION", "DELTA"]);
      assert.ok(k1.includes("ABSORPTION"));
      assert.ok(tokenOverlap("absorcion pesa mas", "absorcion pesa mas que delta") >= 0.5);
      assert.equal(k1.split("|")[0], k2.split("|")[0]);
    });

    it("clusters equivalent absorption priority statements", () => {
      const observations = [
        obs({ id: "obs_o1", text: "Absorcion > Delta en esta lectura" }),
        obs({ id: "obs_o2", text: "absorcion pesa mas que delta aqui" }),
        obs({ id: "obs_o3", text: "Gamma flip requiere confirmacion de liquidez" }),
      ];
      const clusters = clusterRules(observations);
      assert.ok(clusters.length >= 1);
      for (const c of clusters) assert.equal(c.mentorEligible, false);
    });
  });

  describe("compression", () => {
    it("reports duplicates and variants", () => {
      const observations = [
        obs({ id: "obs_a1", text: "Dealer positioning first when gamma is quiet" }),
        obs({ id: "obs_a2", text: "Dealer positioning first when gamma is quiet" }),
        obs({ id: "obs_a3", text: "Dealer positioning first if gamma quiet" }),
      ];
      const clusters = clusterRules(observations);
      const report = compressClusters(observations, clusters);
      assert.equal(report.mentorEligible, false);
      assert.equal(report.totalObservations, 3);
      assert.ok(typeof report.kinds.DUPLICATE === "number");
    });
  });

  describe("conflict + coverage heatmaps", () => {
    it("builds conflict cells for disagree multi-lens notes", () => {
      const observations = [
        obs({
          id: "obs_c1",
          text: "Absorption vs Delta conflict disagree with priority",
          lenses: ["ABSORPTION", "DELTA"],
          signals: ["DISAGREE"],
        }),
        obs({
          id: "obs_c2",
          text: "Absorption vs Delta again conflict",
          lenses: ["ABSORPTION", "DELTA"],
          signals: ["NEEDS_CONDITIONS"],
        }),
        obs({
          id: "obs_c3",
          text: "Dealer vs Gamma conflict",
          lenses: ["DEALER", "GAMMA"],
          signals: ["DISAGREE"],
        }),
      ];
      const heat = buildConflictHeatmap(observations);
      assert.ok(heat.totalConflicts >= 1);
      assert.ok(heat.cells.some((c) => c.lensA === "ABSORPTION" || c.lensB === "ABSORPTION"));
      assert.equal(heat.mentorEligible, false);
    });

    it("coverage includes all lenses with zero counts", () => {
      const observations = [obs({ id: "obs_x1", text: "Delta confirmation required" })];
      const clusters = clusterRules(observations);
      const cov = buildCoverageHeatmap(observations, clusters);
      assert.ok(cov.cells.some((c) => c.kind === "LENS" && c.key === "DELTA" && c.count >= 1));
      assert.ok(cov.cells.some((c) => c.kind === "LENS" && c.key === "GAMMA"));
      assert.equal(cov.mentorEligible, false);
    });
  });

  describe("confidence + gaps", () => {
    it("computes confidence without win rate fields", () => {
      const observations = [
        obs({ id: "obs_p1", text: "Absorption priority over spoofing", signals: ["AGREE"] }),
        obs({ id: "obs_p2", text: "Absorption priority over spoofing again", signals: ["AGREE"] }),
        obs({ id: "obs_p3", text: "Absorption priority unsure", signals: ["NEEDS_MORE_EVIDENCE"] }),
      ];
      const clusters = clusterRules(observations);
      const conflictHeatmap = buildConflictHeatmap(observations);
      const conf = computeRuleConfidences({ observations, clusters, conflictHeatmap });
      assert.ok(conf.length >= 1);
      for (const c of conf) {
        assert.ok(c.confidenceScore >= 0 && c.confidenceScore <= 1);
        assert.ok(!("winRate" in c));
        assert.equal(c.mentorEligible, false);
      }
      const coverage = buildCoverageHeatmap(observations, clusters);
      const gaps = findKnowledgeGaps({ coverage, conflicts: conflictHeatmap, confidences: conf });
      assert.ok(gaps.some((g) => g.kind === "NEVER_DISCUSSED"));
      assert.equal(gaps[0]!.mentorEligible, false);
    });
  });

  describe("adaptive questions + queue", () => {
    it("only uses allowed drivers and prioritizes discrimination", () => {
      const observations = [
        obs({
          id: "obs_q1",
          text: "Absorption vs Delta conflict needs resolution",
          lenses: ["ABSORPTION", "DELTA"],
          signals: ["DISAGREE"],
        }),
      ];
      const clusters = clusterRules(observations);
      const conflictHeatmap = buildConflictHeatmap(observations);
      const coverage = buildCoverageHeatmap(observations, clusters);
      const confidences = computeRuleConfidences({ observations, clusters, conflictHeatmap });
      const gaps = findKnowledgeGaps({ coverage, conflicts: conflictHeatmap, confidences });
      const qs = generateAdaptiveQuestions({ gaps, conflicts: conflictHeatmap, confidences, clusters });
      assert.ok(qs.length >= 1);
      for (const q of qs) {
        adaptiveQuestionSchema.parse(q);
        assert.equal(q.allowsDepends, true);
        assert.ok(!/\b(BUY|SELL)\b/i.test(q.prompt));
      }
      const queue = buildAdaptiveQueue(qs);
      assert.ok(queue.length >= 1);
    });
  });

  describe("challenge engine + score", () => {
    it("prioritizes hypothesis discrimination and never answers", () => {
      const observations = [
        obs({
          id: "obs_ch1",
          text: "Dealer vs Gamma conflict in methodology",
          lenses: ["DEALER", "GAMMA"],
          signals: ["DISAGREE"],
        }),
        obs({
          id: "obs_ch2",
          text: "Absorption required for acceptance",
          lenses: ["ABSORPTION", "ACCEPTANCE"],
          signals: ["AGREE"],
        }),
      ];
      const clusters = clusterRules(observations);
      const conflictHeatmap = buildConflictHeatmap(observations);
      const confidences = computeRuleConfidences({ observations, clusters, conflictHeatmap });
      const challenges = buildChallenges({ clusters, confidences, conflicts: conflictHeatmap });
      assert.ok(challenges.length >= 3);
      for (const c of challenges) {
        challengeItemSchema.parse(c);
        assert.equal(c.neverAnswers, true);
        assert.ok(c.hypothesisA.length >= 4 && c.hypothesisB.length >= 4);
      }
      assert.ok(
        challenges[0]!.discriminationScore >= challenges[challenges.length - 1]!.discriminationScore,
      );
      const scores = scoreChallenges({ clusters, observations });
      for (const s of scores) {
        assert.ok(!("accuracy" in s));
        assert.ok(!("winRate" in s));
        assert.equal(s.mentorEligible, false);
      }
    });
  });

  describe("proposal compression + evolution", () => {
    it("emits PENDING proposals with debt warnings only", () => {
      const observations = [
        obs({
          id: "obs_pr1",
          text: "Absorption vs Delta conflict unresolved",
          lenses: ["ABSORPTION", "DELTA"],
          signals: ["DISAGREE"],
        }),
        obs({
          id: "obs_pr2",
          text: "Absorption vs Delta still conflict",
          lenses: ["ABSORPTION", "DELTA"],
          signals: ["DISAGREE"],
        }),
      ];
      const clusters = clusterRules(observations);
      const conflictHeatmap = buildConflictHeatmap(observations);
      const coverage = buildCoverageHeatmap(observations, clusters);
      const confidences = computeRuleConfidences({ observations, clusters, conflictHeatmap });
      const gaps = findKnowledgeGaps({ coverage, conflicts: conflictHeatmap, confidences });
      const proposals = compressProposals({
        clusters,
        gaps,
        conflicts: conflictHeatmap,
        confidences,
        targetCount: 5,
      });
      assert.ok(proposals.length >= 1 && proposals.length <= 5);
      for (const p of proposals) {
        compressedProposalSchema.parse(p);
        assert.equal(p.status, "PENDING");
        assert.equal(p.autoApply, false);
        assert.equal(p.brainMutate, false);
        assert.equal(p.safety, "NOT_SAFE_FOR_BRAIN_APPLICATION");
      }
      const qs = generateAdaptiveQuestions({ gaps, conflicts: conflictHeatmap, confidences, clusters });
      const evolution = buildEvolutionReport({
        totalSessions: 2,
        clusters,
        compression: compressClusters(observations, clusters),
        conflicts: conflictHeatmap,
        coverage,
        confidences,
        gaps,
        nextQuestions: qs,
      });
      assert.equal(evolution.brainMutated, false);
      assert.equal(evolution.openAi, false);
    });
  });

  describe("pipeline integration", () => {
    it("runs end-to-end with CC session answers and PENDING proposals", () => {
      const started = startCriticalCalibrationSession({
        seed: "kd734",
        initialQuestionCount: 3,
        kind: "TECHNICAL",
      });
      const qid = started.blindQuestions[0]!.questionId;
      submitCalibrationAnswer({
        sessionId: started.session.id,
        questionId: qid,
        answerText: "Absorption vs Delta need conditions before priority",
        answerType: "DEPENDS",
        conditions: ["delta confirms"],
        confidence: "MEDIUM",
      });
      submitCalibrationAnswer({
        sessionId: started.session.id,
        questionId: qid,
        answerText: "Disagree with engine priority without absorption hold",
        confidence: "HIGH",
        observationKind: "ADDENDUM",
        postRevealAction: "DISAGREE",
      });

      const hr = new HumanDecisionReviewRepository(process.env.GOODTRADING_AI_HUMAN_REVIEW_DIR);
      const result = runKnowledgeDistillation({ humanRepo: hr, persist: true });
      distillationRunResultSchema.parse(result);
      assert.equal(result.brainMutate, false);
      assert.equal(result.autoApply, false);
      assert.equal(result.realMarketData, false);
      assert.ok(result.observations.length >= 1);
      assert.ok(result.challenges.every((c) => c.neverAnswers === true));
      assert.ok(
        result.compressedProposals.every((p) => p.status === "PENDING" && p.brainMutate === false),
      );
      assert.ok(getCriticalCalibrationMemory().listSessions().length >= 1);
    });
  });

  describe("flag + safety source", () => {
    it("flag defaults false", () => {
      const prev = process.env.GOODTRADING_AI_KNOWLEDGE_DISTILLATION_ENABLED;
      delete process.env.GOODTRADING_AI_KNOWLEDGE_DISTILLATION_ENABLED;
      assert.equal(isGoodTradingAiKnowledgeDistillationEnabled(), false);
      if (prev != null) process.env.GOODTRADING_AI_KNOWLEDGE_DISTILLATION_ENABLED = prev;
    });

    it("module sources forbid OpenAI and Brain apply", () => {
      const pipeline = readFileSync(
        join(process.cwd(), "server/ai/goodTradingAi/knowledgeDistillation/pipeline.ts"),
        "utf8",
      );
      assert.ok(!/from\s+['"].*openai/i.test(pipeline));
      assert.ok(!/\bembeddings?\b/i.test(pipeline));
      assert.ok(/no OpenAI/i.test(pipeline) || /deterministic/i.test(pipeline));
      const routes = readFileSync(
        join(process.cwd(), "server/routes/knowledgeDistillation.routes.ts"),
        "utf8",
      );
      assert.ok(routes.includes("mentorEligible: false"));
      assert.ok(routes.includes("brainMutate: false"));
      assert.ok(!/applyToBrain|autoApply:\s*true/.test(routes));
    });
  });
});
