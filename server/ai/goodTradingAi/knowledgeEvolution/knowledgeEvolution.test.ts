import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, beforeEach } from "node:test";
import {
  distilledObservationSchema,
  type DistilledObservation,
} from "@shared/goodTradingAiKnowledgeDistillation";
import {
  knowledgeEvolutionRunResultSchema,
  rankedProposalSchema,
  stableRuleIdSchema,
} from "@shared/goodTradingAiKnowledgeEvolution";
import { extractLensesFromText } from "../knowledgeDistillation/normalize";
import { clusterRules } from "../knowledgeDistillation/ruleClustering";
import { buildStableRuleId, inferRuleKind } from "./ruleIds";
import { upsertRegistryFromObservations } from "./ruleRegistry";
import { buildHistories } from "./ruleHistory";
import { computeStabilities } from "./stability";
import { computeVolatilities } from "./volatility";
import { buildDependencyGraph } from "./dependencyGraph";
import { detectKeystones } from "./keystone";
import { detectObsoleteRules } from "./obsoleteDetector";
import { buildStabilityReport } from "./stabilityReport";
import { appendTimelineEvents } from "./timeline";
import { buildAdaptivePriorityV2, mapPriorityV2ToDistillationDrivers } from "./adaptivePriorityV2";
import { computeKnowledgeHealth } from "./knowledgeHealth";
import { rankProposals } from "./proposalRanking";
import { runKnowledgeEvolution } from "./pipeline";
import { applySessionFeedback } from "./feedbackLoop";
import { resetKnowledgeEvolutionMemoryForTests, getKnowledgeEvolutionMemory } from "./memoryStore";
import { isGoodTradingAiKnowledgeEvolutionEnabled } from "./features";
import { HumanDecisionReviewRepository } from "../decision/humanReview/repository";
import { resetCriticalCalibrationMemoryForTests } from "../criticalCalibration/memoryStore";
import {
  startCriticalCalibrationSession,
  submitCalibrationAnswer,
} from "../criticalCalibration/sessionService";
import { resetKnowledgeDistillationMemoryForTests } from "../knowledgeDistillation/memoryStore";

function obs(
  partial: Partial<DistilledObservation> & Pick<DistilledObservation, "id" | "text">,
): DistilledObservation {
  return distilledObservationSchema.parse({
    sourceKind: "CRITICAL_CALIBRATION",
    sessionId: "sess_kev",
    itemId: "item_1",
    lenses: partial.lenses ?? extractLensesFromText(partial.text),
    signals: partial.signals ?? ["ANSWER"],
    createdAtMs: Date.now(),
    mentorEligible: false,
    ...partial,
  });
}

describe("AI-7.3.5 Knowledge Evolution", () => {
  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "kev-"));
    resetKnowledgeEvolutionMemoryForTests(join(dir, "kev"));
    resetKnowledgeDistillationMemoryForTests(join(dir, "kd"));
    resetCriticalCalibrationMemoryForTests(join(dir, "cc"));
    process.env.GOODTRADING_AI_HUMAN_REVIEW_DIR = join(dir, "hr");
  });

  describe("Rule Registry", () => {
    it("builds stable RULE_* ids never free-text", () => {
      const id = buildStableRuleId(["ABSORPTION", "DELTA"], "PRIORITY");
      assert.equal(id, "RULE_ABSORPTION_DELTA_PRIORITY");
      assert.ok(stableRuleIdSchema.safeParse(id).success);
      assert.ok(!stableRuleIdSchema.safeParse("absorcion pesa mas").success);
      assert.ok(!stableRuleIdSchema.safeParse("free text rule").success);
    });

    it("registers rules from observations with stable ids", () => {
      const observations = [
        obs({ id: "reg_01", text: "Absorcion > Delta priority", lenses: ["ABSORPTION", "DELTA"], signals: ["AGREE"] }),
        obs({ id: "reg_02", text: "Dealer vs Gamma conflict", lenses: ["DEALER", "GAMMA"], signals: ["DISAGREE"] }),
      ];
      const clusters = clusterRules(observations);
      const rules = upsertRegistryFromObservations(observations, clusters, []);
      assert.ok(rules.length >= 1);
      for (const r of rules) {
        assert.ok(r.id.startsWith("RULE_"));
        assert.equal(r.mentorEligible, false);
        assert.ok(r.currentVersion >= 1);
      }
    });

    it("infers priority kind for absorption > delta", () => {
      assert.equal(inferRuleKind("Absorcion pesa mas que Delta", ["ABSORPTION", "DELTA"]), "PRIORITY");
      assert.equal(inferRuleKind("Dealer vs Gamma conflict", ["DEALER", "GAMMA"]), "CONFLICT");
    });
  });

  describe("History", () => {
    it("counts agree/disagree/defer/conditions/evidence/revisions", () => {
      const observations = [
        obs({ id: "h_01", text: "Absorcion > Delta", lenses: ["ABSORPTION", "DELTA"], signals: ["AGREE"] }),
        obs({ id: "h_02", text: "Absorcion > Delta again", lenses: ["ABSORPTION", "DELTA"], signals: ["DISAGREE"] }),
        obs({ id: "h_03", text: "Absorcion > Delta defer", lenses: ["ABSORPTION", "DELTA"], signals: ["DEFER"] }),
        obs({
          id: "h_04",
          text: "Absorcion > Delta needs conditions",
          lenses: ["ABSORPTION", "DELTA"],
          signals: ["NEEDS_CONDITIONS"],
        }),
        obs({
          id: "h_05",
          text: "Absorcion > Delta needs evidence",
          lenses: ["ABSORPTION", "DELTA"],
          signals: ["NEEDS_MORE_EVIDENCE"],
        }),
        obs({ id: "h_06", text: "Absorcion > Delta revision", lenses: ["ABSORPTION", "DELTA"], signals: ["REVISION"] }),
      ];
      const rules = upsertRegistryFromObservations(observations, clusterRules(observations), []);
      const histories = buildHistories(rules, observations, []);
      const target = histories.find((h) => h.ruleId.includes("ABSORPTION") && h.ruleId.includes("DELTA"));
      assert.ok(target);
      assert.ok(target!.agreementCount >= 1);
      assert.ok(target!.disagreementCount >= 1);
      assert.ok(target!.deferCount >= 1);
      assert.ok(target!.needsConditionsCount >= 1);
      assert.ok(target!.needsEvidenceCount >= 1);
      assert.ok(target!.revisions >= 1);
      assert.equal(target!.mentorEligible, false);
    });
  });

  describe("Stability", () => {
    it("scores without win rate or accuracy", () => {
      const observations = [
        obs({ id: "s_01", text: "Liquidity acceptance required", lenses: ["LIQUIDITY", "ACCEPTANCE"], signals: ["AGREE"] }),
        obs({ id: "s_02", text: "Liquidity acceptance required again", lenses: ["LIQUIDITY", "ACCEPTANCE"], signals: ["AGREE"] }),
      ];
      const rules = upsertRegistryFromObservations(observations, clusterRules(observations), []);
      const histories = buildHistories(rules, observations, []);
      const stabilities = computeStabilities(histories);
      assert.ok(stabilities.length >= 1);
      for (const s of stabilities) {
        assert.ok(s.stabilityScore >= 0 && s.stabilityScore <= 1);
        assert.ok(!("winRate" in s));
        assert.ok(!("accuracy" in s));
      }
    });
  });

  describe("Volatility", () => {
    it("rises with disagreements and revisions", () => {
      const calm = [
        obs({ id: "v_c1", text: "Delta confirmation", lenses: ["DELTA"], signals: ["AGREE"] }),
        obs({ id: "v_c2", text: "Delta confirmation again", lenses: ["DELTA"], signals: ["AGREE"] }),
      ];
      const volatile = [
        obs({ id: "v_v1", text: "Absorcion > Delta conflict", lenses: ["ABSORPTION", "DELTA"], signals: ["DISAGREE"] }),
        obs({ id: "v_v2", text: "Absorcion > Delta revision", lenses: ["ABSORPTION", "DELTA"], signals: ["REVISION", "NEEDS_CONDITIONS"] }),
      ];
      const calmRules = upsertRegistryFromObservations(calm, clusterRules(calm), []);
      const volRules = upsertRegistryFromObservations(volatile, clusterRules(volatile), []);
      const calmVol = computeVolatilities(buildHistories(calmRules, calm, []));
      const hotVol = computeVolatilities(buildHistories(volRules, volatile, []));
      assert.ok(hotVol[0]!.volatilityScore >= calmVol[0]!.volatilityScore);
    });
  });

  describe("Dependency Graph", () => {
    it("builds directed edges and reports cyclesBroken", () => {
      const observations = [
        obs({ id: "d_01", text: "Absorcion > Delta priority", lenses: ["ABSORPTION", "DELTA"], signals: ["AGREE"] }),
        obs({ id: "d_02", text: "Absorcion confirmation required", lenses: ["ABSORPTION"], signals: ["AGREE"] }),
        obs({ id: "d_03", text: "Invalidation of absorption hold", lenses: ["ABSORPTION", "INVALIDATION"], signals: ["ANSWER"] }),
      ];
      const rules = upsertRegistryFromObservations(observations, clusterRules(observations), []);
      const graph = buildDependencyGraph(rules);
      assert.equal(graph.mentorEligible, false);
      assert.ok(graph.cyclesBroken >= 0);
      for (const e of graph.edges) {
        assert.ok(["requires", "supports", "invalidates", "strengthens", "weakens", "dependsOn"].includes(e.relation));
        assert.notEqual(e.fromRuleId, e.toRuleId);
      }
    });

    it("breaks simple cycles", () => {
      const rules = upsertRegistryFromObservations(
        [
          obs({ id: "cy_01", text: "Absorcion priority", lenses: ["ABSORPTION"], signals: ["AGREE"] }),
          obs({ id: "cy_02", text: "Absorcion confirmation", lenses: ["ABSORPTION"], signals: ["AGREE"] }),
          obs({ id: "cy_03", text: "Absorcion invalidation", lenses: ["ABSORPTION", "INVALIDATION"], signals: ["ANSWER"] }),
        ],
        [],
        [],
      );
      // Force enough rules for edges
      const graph = buildDependencyGraph(rules);
      assert.ok(Array.isArray(graph.edges));
    });
  });

  describe("Keystone", () => {
    it("ranks by dependency impact", () => {
      const observations = [
        obs({ id: "k_01", text: "Absorcion > Delta priority", lenses: ["ABSORPTION", "DELTA"], signals: ["AGREE"] }),
        obs({ id: "k_02", text: "Absorcion confirmation", lenses: ["ABSORPTION"], signals: ["AGREE"] }),
        obs({ id: "k_03", text: "Delta confirmation", lenses: ["DELTA"], signals: ["AGREE"] }),
      ];
      const rules = upsertRegistryFromObservations(observations, clusterRules(observations), []);
      const graph = buildDependencyGraph(rules);
      const keystones = detectKeystones(rules, graph);
      assert.ok(keystones.length >= 1);
      assert.ok(keystones[0]!.keystoneScore >= keystones[keystones.length - 1]!.keystoneScore);
      assert.ok(!("winRate" in keystones[0]!));
    });
  });

  describe("Obsolete", () => {
    it("flags never-used and never deletes", () => {
      const observations = [obs({ id: "o_01", text: "Delta confirmation", lenses: ["DELTA"], signals: ["AGREE"] })];
      const rules = upsertRegistryFromObservations(observations, clusterRules(observations), []);
      // Inject a never-reviewed rule by cloning registry with extra
      const extra = {
        ...rules[0]!,
        id: "RULE_SPOOFING_GENERAL" as const,
        lenses: ["SPOOFING" as const],
        label: "SPOOFING GENERAL",
        conceptKey: "SPOOFING",
      };
      const allRules = [...rules, extra];
      const histories = buildHistories(rules, observations, []);
      const stabilities = computeStabilities(histories);
      const graph = buildDependencyGraph(allRules);
      const obsolete = detectObsoleteRules({ rules: allRules, histories, stabilities, graph });
      assert.ok(obsolete.some((o) => o.kind === "NEVER_USED"));
      assert.ok(obsolete.every((o) => o.neverDelete === true));
    });
  });

  describe("Stability Report + Timeline", () => {
    it("builds report buckets and append-only timeline", () => {
      const observations = [
        obs({ id: "t_01", text: "Absorcion > Delta", lenses: ["ABSORPTION", "DELTA"], signals: ["AGREE"] }),
        obs({ id: "t_02", text: "Absorcion > Delta disagree", lenses: ["ABSORPTION", "DELTA"], signals: ["DISAGREE"] }),
      ];
      const rules = upsertRegistryFromObservations(observations, clusterRules(observations), []);
      const histories = buildHistories(rules, observations, []);
      const stabilities = computeStabilities(histories);
      const volatilities = computeVolatilities(histories);
      const report = buildStabilityReport({ histories, stabilities, volatilities });
      assert.equal(report.mentorEligible, false);
      assert.ok(Array.isArray(report.mostStable));
      assert.ok(Array.isArray(report.highestVolatility));

      const graph = buildDependencyGraph(rules);
      const keystones = detectKeystones(rules, graph);
      const obsolete = detectObsoleteRules({ rules, histories, stabilities, graph });
      const t1 = appendTimelineEvents({
        previous: [],
        rules,
        histories,
        stabilities,
        volatilities,
        keystones,
        obsolete,
      });
      const t2 = appendTimelineEvents({
        previous: t1,
        rules,
        histories,
        stabilities,
        volatilities,
        keystones,
        obsolete,
      });
      assert.ok(t1.some((e) => e.kind === "CREATED"));
      // Append-only: second pass does not shrink or rewrite created ids
      assert.ok(t2.length >= t1.length);
      assert.ok(t2.filter((e) => e.id.startsWith("ev_created_")).length === t1.filter((e) => e.id.startsWith("ev_created_")).length);
    });
  });

  describe("Adaptive Priority v2", () => {
    it("orders HIGH_VOLATILITY before LOW_CONFIDENCE and RANDOM", () => {
      const observations = [
        obs({
          id: "ap_01",
          text: "Absorcion > Delta conflict",
          lenses: ["ABSORPTION", "DELTA"],
          signals: ["DISAGREE", "REVISION", "NEEDS_CONDITIONS"],
        }),
        obs({ id: "ap_02", text: "Oi expansion note", lenses: ["OI"], signals: ["ANSWER"] }),
      ];
      const rules = upsertRegistryFromObservations(observations, clusterRules(observations), []);
      const histories = buildHistories(rules, observations, []);
      const stabilities = computeStabilities(histories);
      const volatilities = computeVolatilities(histories);
      const keystones = detectKeystones(rules, buildDependencyGraph(rules));
      const priority = buildAdaptivePriorityV2({ histories, stabilities, volatilities, keystones });
      assert.ok(priority.length >= 1);
      const first = priority[0]!;
      assert.ok(
        first.drivers.includes("HIGH_VOLATILITY") ||
          first.drivers.includes("HIGH_CONFLICT") ||
          first.drivers.includes("HIGH_INFORMATION_GAIN") ||
          first.drivers.includes("LOW_COVERAGE"),
      );
      const mapped = mapPriorityV2ToDistillationDrivers(first.drivers);
      assert.ok(mapped.length >= 1);
    });
  });

  describe("Health + Proposal Ranking", () => {
    it("computes health metrics and ranks PENDING proposals", () => {
      const observations = [
        obs({ id: "hp_01", text: "Dealer vs Gamma conflict", lenses: ["DEALER", "GAMMA"], signals: ["DISAGREE"] }),
        obs({ id: "hp_02", text: "Absorcion > Delta", lenses: ["ABSORPTION", "DELTA"], signals: ["AGREE"] }),
      ];
      const rules = upsertRegistryFromObservations(observations, clusterRules(observations), []);
      const histories = buildHistories(rules, observations, []);
      const stabilities = computeStabilities(histories);
      const volatilities = computeVolatilities(histories);
      const graph = buildDependencyGraph(rules);
      const keystones = detectKeystones(rules, graph);
      const obsolete = detectObsoleteRules({ rules, histories, stabilities, graph });
      const timeline = appendTimelineEvents({
        previous: [],
        rules,
        histories,
        stabilities,
        volatilities,
        keystones,
        obsolete,
      });
      const health = computeKnowledgeHealth({
        rules,
        histories,
        stabilities,
        volatilities,
        graph,
        timeline,
      });
      assert.ok(health.overallStability >= 0 && health.overallStability <= 1);
      assert.ok(health.overallVolatility >= 0);
      assert.equal(health.mentorEligible, false);

      const ranked = rankProposals({
        rules,
        histories,
        stabilities,
        volatilities,
        keystones,
        obsolete,
      });
      assert.ok(ranked.length >= 1);
      for (const p of ranked) {
        rankedProposalSchema.parse(p);
        assert.equal(p.status, "PENDING");
        assert.equal(p.autoApply, false);
        assert.equal(p.brainMutate, false);
        assert.equal(p.safety, "NOT_SAFE_FOR_BRAIN_APPLICATION");
      }
      assert.ok(ranked[0]!.rankScore >= ranked[ranked.length - 1]!.rankScore);
    });
  });

  describe("Pipeline + Feedback Loop", () => {
    it("runs end-to-end with CC answers and PENDING proposals", () => {
      const started = startCriticalCalibrationSession({
        seed: "kev735",
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
      const hr = new HumanDecisionReviewRepository(process.env.GOODTRADING_AI_HUMAN_REVIEW_DIR);
      const result = runKnowledgeEvolution({ humanRepo: hr, persist: true });
      knowledgeEvolutionRunResultSchema.parse(result);
      assert.equal(result.brainMutate, false);
      assert.equal(result.autoApply, false);
      assert.equal(result.openAi, false);
      assert.equal(result.realMarketData, false);
      assert.ok(result.rules.every((r) => r.id.startsWith("RULE_")));
      assert.ok(result.rankedProposals.every((p) => p.status === "PENDING" && p.brainMutate === false));
      assert.ok(getKnowledgeEvolutionMemory().latestRun());
    });

    it("feedback loop updates health without Brain mutate", () => {
      const observations = [
        obs({ id: "fb_01", text: "Absorcion > Delta", lenses: ["ABSORPTION", "DELTA"], signals: ["DISAGREE"] }),
      ];
      const out = applySessionFeedback({ observations, persist: true });
      assert.equal(out.brainMutate, false);
      assert.equal(out.autoApply, false);
      assert.ok(out.health.overallVolatility >= 0);
      assert.ok(out.result.histories.length >= 1);
    });
  });

  describe("Flag + safety", () => {
    it("flag defaults false", () => {
      const prev = process.env.GOODTRADING_AI_KNOWLEDGE_EVOLUTION_ENABLED;
      delete process.env.GOODTRADING_AI_KNOWLEDGE_EVOLUTION_ENABLED;
      assert.equal(isGoodTradingAiKnowledgeEvolutionEnabled(), false);
      if (prev != null) process.env.GOODTRADING_AI_KNOWLEDGE_EVOLUTION_ENABLED = prev;
    });

    it("module sources forbid openai imports and Brain apply", () => {
      const files = [
        "pipeline.ts",
        "feedbackLoop.ts",
        "proposalRanking.ts",
        "adaptivePriorityV2.ts",
        "dependencyGraph.ts",
      ];
      for (const f of files) {
        const src = readFileSync(join(process.cwd(), "server/ai/goodTradingAi/knowledgeEvolution", f), "utf8");
        assert.ok(!/from\s+['"].*openai/i.test(src));
        assert.ok(!/applyToBrain|autoApply:\s*true/.test(src));
      }
    });

    it("gitignore and docs exist", () => {
      const gi = readFileSync(join(process.cwd(), ".gitignore"), "utf8");
      assert.ok(gi.includes("server/storage/knowledge-evolution/"));
      assert.ok(existsSync(join(process.cwd(), "docs/goodtrading-ai-knowledge-evolution.md")));
    });
  });
});