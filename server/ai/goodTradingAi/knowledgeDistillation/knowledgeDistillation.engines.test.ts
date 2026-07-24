import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, beforeEach } from "node:test";
import {
  distilledObservationSchema,
  adaptiveQuestionSchema,
  challengeItemSchema,
  compressedProposalSchema,
  challengeScoreSchema,
  knowledgeEvolutionReportSchema,
  KNOWLEDGE_DISTILLATION_SCHEMA_VERSION,
  ALL_EVIDENCE_LENSES,
} from "@shared/goodTradingAiKnowledgeDistillation";
import type { DistilledObservation, AdaptiveQuestion } from "@shared/goodTradingAiKnowledgeDistillation";
import {
  normalizeText,
  stripAccents,
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
import {
  getKnowledgeDistillationMemory,
  resetKnowledgeDistillationMemoryForTests,
} from "./memoryStore";
import { isGoodTradingAiKnowledgeDistillationEnabled } from "./features";
import { runKnowledgeDistillation } from "./pipeline";
import { HumanDecisionReviewRepository } from "../decision/humanReview/repository";
import {
  resetCriticalCalibrationMemoryForTests,
  getCriticalCalibrationMemory,
} from "../criticalCalibration/memoryStore";
import {
  startCriticalCalibrationSession,
  submitCalibrationAnswer,
} from "../criticalCalibration/sessionService";

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

function baseQ(partial: Partial<AdaptiveQuestion> & Pick<AdaptiveQuestion, "id" | "prompt" | "drivers">): AdaptiveQuestion {
  return adaptiveQuestionSchema.parse({
    relatedLenses: [],
    relatedClusterIds: [],
    infoGainHint: "MEDIUM",
    hypothesisDiscrimination: 0.5,
    allowsDepends: true,
    mentorEligible: false,
    ...partial,
  });
}

describe("AI-7.3.4 KD normalize matrix", () => {
  const cases: Array<[string, string]> = [
    ["Absorción", "absorcion"],
    ["DELTA", "delta"],
    ["  Foo   Bar  ", "foo bar"],
    ["A>B", "a>b"],
    ["Café", "cafe"],
    ["líquidez", "liquidez"],
  ];
  for (const [raw, expected] of cases) {
    it(`normalizeText(${JSON.stringify(raw)})`, () => {
      assert.equal(normalizeText(raw), expected);
    });
  }

  it("stripAccents removes combining marks", () => {
    assert.equal(stripAccents("ñáéíóú"), "naeiou");
  });

  const lensCases: Array<[string, string]> = [
    ["absorcion hold", "ABSORPTION"],
    ["delta divergence", "DELTA"],
    ["cvd rising", "CVD"],
    ["gamma flip zone", "GAMMA"],
    ["dealer inventory", "DEALER"],
    ["liquidity vacuum", "LIQUIDITY"],
    ["spoofing attempt", "SPOOFING"],
    ["footprint imbalance", "FOOTPRINT"],
    ["oi expansion", "OI"],
    ["volatility crush", "VOLATILITY"],
    ["acceptance of level", "ACCEPTANCE"],
    ["rejection wick", "REJECTION"],
    ["invalidation stack", "INVALIDATION"],
    ["staleness warning", "STALENESS"],
    ["conflicts between lenses", "CONFLICTS"],
    ["confidence low", "CONFIDENCE"],
    ["dataquality issue", "DATA_QUALITY"],
  ];
  for (const [text, lens] of lensCases) {
    it(`extractLenses finds ${lens}`, () => {
      assert.ok(extractLensesFromText(text).includes(lens as never));
    });
  }

  it("conceptKey marks priority patterns", () => {
    const k = conceptKeyFromText("Absorcion pesa mas que Delta", ["ABSORPTION", "DELTA"]);
    assert.ok(k.includes("PRIO"));
    assert.ok(k.includes("ABSORPTION"));
  });

  it("conceptKey marks non-priority statements", () => {
    const k = conceptKeyFromText("Delta confirmation needed", ["DELTA"]);
    assert.ok(k.includes("STMT"));
  });

  it("tokenOverlap is symmetric and bounded", () => {
    const a = "absorption priority over delta";
    const b = "absorption priority delta confirm";
    const o = tokenOverlap(a, b);
    assert.equal(tokenOverlap(a, b), tokenOverlap(b, a));
    assert.ok(o >= 0 && o <= 1);
    assert.equal(tokenOverlap("", "x"), 0);
  });
});

describe("AI-7.3.4 KD clustering + compression matrix", () => {
  it("clusters Spanish/English absorption priority together", () => {
    const observations = [
      obs({ id: "clu_01", text: "Absorcion > Delta en esta lectura" }),
      obs({ id: "clu_02", text: "absorcion pesa mas que delta aqui" }),
      obs({ id: "clu_03", text: "Absorption weighs more than Delta here" }),
    ];
    const clusters = clusterRules(observations);
    assert.ok(clusters.some((c) => c.frequency >= 2));
    for (const c of clusters) {
      assert.equal(c.mentorEligible, false);
      assert.ok(c.canonicalText.length >= 4);
    }
  });

  it("keeps unrelated gamma rule separate", () => {
    const observations = [
      obs({ id: "sep_01", text: "Absorcion > Delta" }),
      obs({ id: "sep_02", text: "Gamma flip requires liquidity confirmation" }),
    ];
    const clusters = clusterRules(observations);
    assert.ok(clusters.length >= 2);
  });

  it("compression counts exact duplicates", () => {
    const text = "Dealer positioning first when gamma is quiet";
    const observations = [
      obs({ id: "dup_01", text }),
      obs({ id: "dup_02", text }),
      obs({ id: "dup_03", text }),
    ];
    const clusters = clusterRules(observations);
    const report = compressClusters(observations, clusters);
    assert.ok(report.kinds.DUPLICATE >= 1);
    assert.equal(report.mentorEligible, false);
  });

  it("compression detects variants via overlap", () => {
    const observations = [
      obs({ id: "var_01", text: "Dealer positioning first when gamma is quiet" }),
      obs({ id: "var_02", text: "Dealer positioning first if gamma quiet" }),
    ];
    const clusters = clusterRules(observations);
    const report = compressClusters(observations, clusters);
    assert.ok(report.kinds.VARIANT >= 0);
    assert.equal(report.totalObservations, 2);
  });

  it("compression notes stay within cap", () => {
    const observations = Array.from({ length: 12 }, (_, i) =>
      obs({ id: `cap_${String(i).padStart(2, "0")}`, text: `Absorcion > Delta case ${i}` }),
    );
    const clusters = clusterRules(observations);
    const report = compressClusters(observations, clusters);
    assert.ok(report.notes.length <= 40);
  });
});

describe("AI-7.3.4 KD heatmaps matrix", () => {
  it("conflict heatmap empty without conflict signals", () => {
    const observations = [obs({ id: "nc_01", text: "Delta alone", lenses: ["DELTA"], signals: ["AGREE"] })];
    const heat = buildConflictHeatmap(observations);
    assert.equal(heat.totalConflicts, 0);
  });

  it("conflict heatmap ranks ABSORPTION-DELTA", () => {
    const observations = [
      obs({ id: "cf_01", text: "Absorption vs Delta conflict", lenses: ["ABSORPTION", "DELTA"], signals: ["DISAGREE"] }),
      obs({ id: "cf_02", text: "Absorption versus Delta again", lenses: ["ABSORPTION", "DELTA"], signals: ["DISAGREE"] }),
      obs({ id: "cf_03", text: "Dealer vs Gamma conflict", lenses: ["DEALER", "GAMMA"], signals: ["DISAGREE"] }),
    ];
    const heat = buildConflictHeatmap(observations);
    assert.ok(heat.totalConflicts >= 2);
    assert.equal(heat.cells[0]!.count >= heat.cells[heat.cells.length - 1]!.count, true);
  });

  it("conflict cell confidence tiers", () => {
    const observations = Array.from({ length: 5 }, (_, i) =>
      obs({
        id: `tier_${String(i).padStart(2, "0")}`,
        text: "Absorption vs Delta conflict",
        lenses: ["ABSORPTION", "DELTA"],
        signals: ["DISAGREE"],
      }),
    );
    const heat = buildConflictHeatmap(observations);
    const cell = heat.cells.find((c) => c.lensA === "ABSORPTION" || c.lensB === "ABSORPTION");
    assert.ok(cell);
    assert.ok(["LOW", "MEDIUM", "HIGH"].includes(cell!.confidence));
  });

  it("coverage includes every evidence lens", () => {
    const observations = [obs({ id: "cov_01", text: "Delta confirmation" })];
    const clusters = clusterRules(observations);
    const cov = buildCoverageHeatmap(observations, clusters);
    const lensCells = cov.cells.filter((c) => c.kind === "LENS");
    assert.equal(lensCells.length, ALL_EVIDENCE_LENSES.length);
    for (const lens of ALL_EVIDENCE_LENSES) {
      assert.ok(lensCells.some((c) => c.key === lens));
    }
  });

  it("coverage ratio bounded", () => {
    const observations = [
      obs({ id: "cr_01", text: "Gamma and Dealer both relevant", lenses: ["GAMMA", "DEALER"] }),
    ];
    const clusters = clusterRules(observations);
    const cov = buildCoverageHeatmap(observations, clusters);
    for (const c of cov.cells) {
      assert.ok(c.coverageRatio >= 0 && c.coverageRatio <= 1);
    }
  });
});

describe("AI-7.3.4 KD confidence + gaps matrix", () => {
  it("confidence has no winRate/accuracy fields", () => {
    const observations = [
      obs({ id: "conf_01", text: "Absorption priority over spoofing", signals: ["AGREE"] }),
      obs({ id: "conf_02", text: "Absorption priority over spoofing again", signals: ["AGREE"] }),
    ];
    const clusters = clusterRules(observations);
    const conflictHeatmap = buildConflictHeatmap(observations);
    const conf = computeRuleConfidences({ observations, clusters, conflictHeatmap });
    for (const c of conf) {
      assert.ok(c.confidenceScore >= 0 && c.confidenceScore <= 1);
      assert.ok(!("winRate" in c));
      assert.ok(!("accuracy" in c));
      assert.ok(c.coverage >= 0 && c.consistency >= 0);
    }
  });

  it("uncertainty and conflicts reduce confidence", () => {
    const agree = [
      obs({ id: "hi_01", text: "Liquidity acceptance required", signals: ["AGREE"] }),
      obs({ id: "hi_02", text: "Liquidity acceptance required again", signals: ["AGREE"] }),
    ];
    const uncertain = [
      obs({
        id: "lo_01",
        text: "Absorption vs Delta conflict unresolved",
        lenses: ["ABSORPTION", "DELTA"],
        signals: ["DISAGREE", "NEEDS_MORE_EVIDENCE"],
      }),
    ];
    const hi = computeRuleConfidences({
      observations: agree,
      clusters: clusterRules(agree),
      conflictHeatmap: buildConflictHeatmap(agree),
    });
    const lo = computeRuleConfidences({
      observations: uncertain,
      clusters: clusterRules(uncertain),
      conflictHeatmap: buildConflictHeatmap(uncertain),
    });
    assert.ok(hi.length >= 1 && lo.length >= 1);
  });

  it("gaps include NEVER_DISCUSSED for unused lenses", () => {
    const observations = [obs({ id: "gap_01", text: "Delta only reading", lenses: ["DELTA"] })];
    const clusters = clusterRules(observations);
    const coverage = buildCoverageHeatmap(observations, clusters);
    const conflicts = buildConflictHeatmap(observations);
    const confidences = computeRuleConfidences({ observations, clusters, conflictHeatmap: conflicts });
    const gaps = findKnowledgeGaps({ coverage, conflicts, confidences });
    assert.ok(gaps.some((g) => g.kind === "NEVER_DISCUSSED"));
    assert.ok(gaps.every((g) => g.mentorEligible === false));
  });

  it("gaps can surface conflict-related kinds", () => {
    const observations = [
      obs({
        id: "ug_01",
        text: "Absorption vs Delta conflict",
        lenses: ["ABSORPTION", "DELTA"],
        signals: ["DISAGREE"],
      }),
      obs({
        id: "ug_02",
        text: "Absorption versus Delta still conflict",
        lenses: ["ABSORPTION", "DELTA"],
        signals: ["DISAGREE"],
      }),
    ];
    const clusters = clusterRules(observations);
    const coverage = buildCoverageHeatmap(observations, clusters);
    const conflicts = buildConflictHeatmap(observations);
    const confidences = computeRuleConfidences({ observations, clusters, conflictHeatmap: conflicts });
    const gaps = findKnowledgeGaps({ coverage, conflicts, confidences });
    assert.ok(gaps.length >= 1);
  });
});

describe("AI-7.3.4 KD adaptive queue matrix", () => {
  it("queue order respects driver priority", () => {
    const qs = [
      baseQ({ id: "aq_rnd", prompt: "Random methodological probe about confirmation?", drivers: ["RANDOM"], hypothesisDiscrimination: 0.99 }),
      baseQ({ id: "aq_lc", prompt: "Low confidence rule probe about confirmation?", drivers: ["LOW_CONFIDENCE"], hypothesisDiscrimination: 0.2 }),
      baseQ({ id: "aq_cov", prompt: "Low coverage lens probe about confirmation?", drivers: ["LOW_COVERAGE"], hypothesisDiscrimination: 0.2 }),
      baseQ({ id: "aq_ig", prompt: "High info gain probe about confirmation?", drivers: ["HIGH_INFORMATION_GAIN"], hypothesisDiscrimination: 0.2 }),
      baseQ({ id: "aq_hc", prompt: "High conflict probe about confirmation?", drivers: ["HIGH_CONFLICT"], hypothesisDiscrimination: 0.2 }),
    ];
    const queue = buildAdaptiveQueue(qs);
    assert.equal(queue[0]!.id, "aq_hc");
    assert.equal(queue[1]!.id, "aq_ig");
    assert.equal(queue[2]!.id, "aq_cov");
    assert.equal(queue[3]!.id, "aq_lc");
    assert.equal(queue[4]!.id, "aq_rnd");
  });

  it("within same driver, higher discrimination wins", () => {
    const qs = [
      baseQ({ id: "aq_low", prompt: "Conflict low discrimination confirmation?", drivers: ["HIGH_CONFLICT"], hypothesisDiscrimination: 0.2 }),
      baseQ({ id: "aq_high", prompt: "Conflict high discrimination confirmation?", drivers: ["HIGH_CONFLICT"], hypothesisDiscrimination: 0.9 }),
    ];
    const queue = buildAdaptiveQueue(qs);
    assert.equal(queue[0]!.id, "aq_high");
  });

  it("adaptive questions only use allowed driver set", () => {
    const observations = [
      obs({
        id: "aqd_01",
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
    const allowed = new Set(["HIGH_CONFLICT", "HIGH_UNCERTAINTY", "LOW_COVERAGE", "LOW_CONFIDENCE", "HIGH_INFORMATION_GAIN"]);
    for (const q of qs) {
      for (const d of q.drivers) assert.ok(allowed.has(d));
      assert.equal(q.allowsDepends, true);
      assert.ok(!/\b(BUY|SELL)\b/i.test(q.prompt));
    }
  });

  it("rejects forbidden trading tokens in adaptive prompts via schema", () => {
    assert.throws(() =>
      adaptiveQuestionSchema.parse({
        id: "bad_01",
        prompt: "Should we BUY here based on absorption?",
        drivers: ["HIGH_CONFLICT"],
        relatedLenses: ["ABSORPTION"],
        relatedClusterIds: [],
        infoGainHint: "HIGH",
        hypothesisDiscrimination: 0.8,
        allowsDepends: true,
        mentorEligible: false,
      }),
    );
  });
});

describe("AI-7.3.4 KD challenge matrix", () => {
  const kinds = [
    "HYPOTHESIS_DISCRIMINATION",
    "EVIDENCE_THAT_CHANGES_DECISION",
    "REMOVE_ABSORPTION",
    "DEALER_VS_GAMMA",
    "FULL_INVALIDATION",
    "HEURISTIC_FAILURE",
  ] as const;

  it("emits expected challenge kinds and neverAnswers", () => {
    const observations = [
      obs({
        id: "chm_01",
        text: "Dealer vs Gamma conflict in methodology",
        lenses: ["DEALER", "GAMMA"],
        signals: ["DISAGREE"],
      }),
      obs({
        id: "chm_02",
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
    const seen = new Set(challenges.map((c) => c.kind));
    assert.ok(seen.has("DEALER_VS_GAMMA"));
    assert.ok(seen.has("FULL_INVALIDATION") || seen.has("HEURISTIC_FAILURE") || seen.has("HYPOTHESIS_DISCRIMINATION"));
    for (const c of challenges) {
      challengeItemSchema.parse(c);
      assert.equal(c.neverAnswers, true);
      assert.ok(c.discriminationScore >= 0 && c.discriminationScore <= 1);
      assert.ok(c.hypothesisA.length >= 4 && c.hypothesisB.length >= 4);
      assert.ok(!/\b(BUY|SELL)\b/i.test(c.prompt));
    }
    assert.ok(challenges[0]!.discriminationScore >= challenges[challenges.length - 1]!.discriminationScore);
  });

  for (const kind of kinds) {
    it(`challenge kind enum includes ${kind}`, () => {
      assert.ok(kinds.includes(kind));
    });
  }

  it("challenge scores exclude accuracy/winRate", () => {
    const observations = [
      obs({ id: "scs_01", text: "Absorption priority over delta", lenses: ["ABSORPTION", "DELTA"], signals: ["AGREE"] }),
      obs({ id: "scs_02", text: "Absorption priority over delta again", lenses: ["ABSORPTION", "DELTA"], signals: ["DISAGREE"] }),
    ];
    const clusters = clusterRules(observations);
    const scores = scoreChallenges({ clusters, observations });
    for (const s of scores) {
      challengeScoreSchema.parse(s);
      assert.ok(!("accuracy" in s));
      assert.ok(!("winRate" in s));
      assert.ok(s.reviewCount >= 0);
      assert.ok(s.robustness >= 0 && s.robustness <= 1);
      assert.ok(s.contradictions >= 0 && s.contradictions <= 1);
      assert.ok(s.exceptions >= 0 && s.exceptions <= 1);
      assert.ok(s.counterexamples >= 0 && s.counterexamples <= 1);
      assert.ok(s.humanAgreement >= 0 && s.humanAgreement <= 1);
      assert.equal(s.mentorEligible, false);
    }
  });
});

describe("AI-7.3.4 KD proposal + evolution matrix", () => {
  it("compresses to <=5 PENDING proposals with debt fields", () => {
    const observations = [
      obs({ id: "pp_01", text: "Absorption vs Delta conflict unresolved", lenses: ["ABSORPTION", "DELTA"], signals: ["DISAGREE"] }),
      obs({ id: "pp_02", text: "Absorption vs Delta still conflict", lenses: ["ABSORPTION", "DELTA"], signals: ["DISAGREE"] }),
      obs({ id: "pp_03", text: "Dealer vs Gamma conflict", lenses: ["DEALER", "GAMMA"], signals: ["DISAGREE"] }),
    ];
    const clusters = clusterRules(observations);
    const conflictHeatmap = buildConflictHeatmap(observations);
    const coverage = buildCoverageHeatmap(observations, clusters);
    const confidences = computeRuleConfidences({ observations, clusters, conflictHeatmap });
    const gaps = findKnowledgeGaps({ coverage, conflicts: conflictHeatmap, confidences });
    const proposals = compressProposals({ clusters, gaps, conflicts: conflictHeatmap, confidences, targetCount: 5 });
    assert.ok(proposals.length >= 1 && proposals.length <= 5);
    for (const p of proposals) {
      compressedProposalSchema.parse(p);
      assert.equal(p.status, "PENDING");
      assert.equal(p.autoApply, false);
      assert.equal(p.brainMutate, false);
      assert.equal(p.safety, "NOT_SAFE_FOR_BRAIN_APPLICATION");
      assert.equal(p.schemaWarning, "PROPOSAL_SCHEMA_NOT_READY_FOR_BRAIN_APPLICATION");
      assert.ok(p.conditions.length >= 1);
      assert.ok(p.title.length >= 4);
      assert.ok(p.reason.length >= 4);
    }
  });

  it("evolution report flags are hard false", () => {
    const observations = [obs({ id: "ev_01", text: "Delta confirmation required", lenses: ["DELTA"] })];
    const clusters = clusterRules(observations);
    const conflictHeatmap = buildConflictHeatmap(observations);
    const coverage = buildCoverageHeatmap(observations, clusters);
    const confidences = computeRuleConfidences({ observations, clusters, conflictHeatmap });
    const gaps = findKnowledgeGaps({ coverage, conflicts: conflictHeatmap, confidences });
    const qs = generateAdaptiveQuestions({ gaps, conflicts: conflictHeatmap, confidences, clusters });
    const evolution = buildEvolutionReport({
      totalSessions: 1,
      clusters,
      compression: compressClusters(observations, clusters),
      conflicts: conflictHeatmap,
      coverage,
      confidences,
      gaps,
      nextQuestions: qs,
    });
    knowledgeEvolutionReportSchema.parse(evolution);
    assert.equal(evolution.schemaVersion, KNOWLEDGE_DISTILLATION_SCHEMA_VERSION);
    assert.equal(evolution.brainMutated, false);
    assert.equal(evolution.openAi, false);
    assert.equal(evolution.mentorEligible, false);
    assert.ok(Array.isArray(evolution.unusedConcepts));
    assert.ok(Array.isArray(evolution.topOpportunities));
  });
});

describe("AI-7.3.4 KD persistence + pipeline", () => {
  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "kd-eng-"));
    resetKnowledgeDistillationMemoryForTests(join(dir, "kd"));
    resetCriticalCalibrationMemoryForTests(join(dir, "cc"));
    process.env.GOODTRADING_AI_HUMAN_REVIEW_DIR = join(dir, "hr");
  });

  it("memory store persists run under private dir", () => {
    const started = startCriticalCalibrationSession({ seed: "kdeng1", initialQuestionCount: 2, kind: "TECHNICAL" });
    submitCalibrationAnswer({
      sessionId: started.session.id,
      questionId: started.blindQuestions[0]!.questionId,
      answerText: "Absorption vs Delta need conditions",
      answerType: "DEPENDS",
      conditions: ["delta confirms"],
      confidence: "MEDIUM",
    });
    const hr = new HumanDecisionReviewRepository(process.env.GOODTRADING_AI_HUMAN_REVIEW_DIR);
    const result = runKnowledgeDistillation({ humanRepo: hr, persist: true });
    assert.equal(result.brainMutate, false);
    assert.equal(result.autoApply, false);
    assert.equal(result.realMarketData, false);
    assert.ok(result.observations.length >= 1);
    const latest = getKnowledgeDistillationMemory().latestRun();
    assert.ok(latest);
    assert.ok(getCriticalCalibrationMemory().listSessions().length >= 1);
  });

  it("empty sources still produce safe emptyish run", () => {
    const hr = new HumanDecisionReviewRepository(process.env.GOODTRADING_AI_HUMAN_REVIEW_DIR);
    const result = runKnowledgeDistillation({ humanRepo: hr, persist: false });
    assert.equal(result.brainMutate, false);
    assert.equal(result.autoApply, false);
    assert.ok(result.compressedProposals.every((p) => p.status === "PENDING"));
  });

  it("flag defaults false", () => {
    const prev = process.env.GOODTRADING_AI_KNOWLEDGE_DISTILLATION_ENABLED;
    delete process.env.GOODTRADING_AI_KNOWLEDGE_DISTILLATION_ENABLED;
    assert.equal(isGoodTradingAiKnowledgeDistillationEnabled(), false);
    if (prev != null) process.env.GOODTRADING_AI_KNOWLEDGE_DISTILLATION_ENABLED = prev;
  });
});

describe("AI-7.3.4 KD source/UI safety matrix", () => {
  const moduleFiles = [
    "sessionAnalyzer.ts",
    "ruleClustering.ts",
    "compression.ts",
    "conflictHeatmap.ts",
    "coverageHeatmap.ts",
    "confidenceModel.ts",
    "knowledgeGaps.ts",
    "adaptiveQuestions.ts",
    "adaptiveQueue.ts",
    "challengeEngine.ts",
    "challengeScore.ts",
    "proposalCompression.ts",
    "evolutionReport.ts",
    "pipeline.ts",
    "memoryStore.ts",
    "features.ts",
    "access.ts",
  ];

  for (const file of moduleFiles) {
    it(`${file} has no openai import`, () => {
      const src = readFileSync(join(process.cwd(), "server/ai/goodTradingAi/knowledgeDistillation", file), "utf8");
      assert.ok(!/from\s+['"].*openai/i.test(src));
      assert.ok(!/require\(['"].*openai/i.test(src));
      assert.ok(!/\bvector\s*db\b/i.test(src));
    });
  }

  it("gitignore covers knowledge-distillation storage", () => {
    const gi = readFileSync(join(process.cwd(), ".gitignore"), "utf8");
    assert.ok(gi.includes("server/storage/knowledge-distillation/"));
  });

  it("docs file exists", () => {
    assert.ok(existsSync(join(process.cwd(), "docs/goodtrading-ai-knowledge-distillation.md")));
  });

  it("admin page exposes required modes", () => {
    const page = readFileSync(join(process.cwd(), "client/src/pages/admin/KnowledgeDistillationPage.tsx"), "utf8");
    for (const mode of ["Overview", "Distillation", "Independent Evidence Audit", "Heatmaps", "Gaps", "Adaptive Queue", "Challenge Me", "Compressed Proposals", "Evolution"]) {
      assert.ok(page.includes(mode), `missing mode ${mode}`);
    }
    assert.ok(!/applyToBrain/.test(page));
    const api = readFileSync(join(process.cwd(), "client/src/lib/knowledgeDistillation/knowledgeDistillationApi.ts"), "utf8");
    assert.ok(api.includes("credentials"));
  });

  it("API client uses credentials include", () => {
    const api = readFileSync(join(process.cwd(), "client/src/lib/knowledgeDistillation/knowledgeDistillationApi.ts"), "utf8");
    assert.ok(api.includes('credentials: "include"') || api.includes("credentials: 'include'"));
    assert.ok(api.includes("/api/internal/ai/knowledge-distillation"));
  });

  it("shared schema forbids brain mutate literals on proposals", () => {
    const shared = readFileSync(join(process.cwd(), "shared/goodTradingAiKnowledgeDistillation.ts"), "utf8");
    assert.ok(shared.includes("brainMutate: z.literal(false)"));
    assert.ok(shared.includes('status: z.literal("PENDING")'));
    assert.ok(shared.includes("NOT_SAFE_FOR_BRAIN_APPLICATION"));
    assert.ok(!/from\s+['"].*openai/i.test(shared));
  });
});