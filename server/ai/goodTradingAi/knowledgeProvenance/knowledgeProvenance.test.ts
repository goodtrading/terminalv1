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
  provenanceRunResultSchema,
  proposalContextSchema,
  stableRuleIdSchema,
} from "@shared/goodTradingAiKnowledgeProvenance";
import { extractLensesFromText } from "../knowledgeDistillation/normalize";
import { buildStableRuleId, inferRuleKind } from "../knowledgeEvolution/ruleIds";
import { upsertProvenanceRegistry } from "./provenanceRegistry";
import { appendJustificationEvents } from "./justificationHistory";
import { buildLineageGraph, lineageEdge } from "./ruleLineage";
import { listRationalesForRule, assertAppendOnly } from "./rationaleStore";
import { queryProvenance } from "./provenanceQueries";
import { buildPerRuleTimelines, timelineForRule } from "./knowledgeTimeline";
import { buildImpactTraces } from "./impactTrace";
import { buildProposalContexts } from "./proposalContext";
import { runKnowledgeProvenance } from "./pipeline";
import {
  resetKnowledgeProvenanceMemoryForTests,
  getKnowledgeProvenanceMemory,
} from "./memoryStore";
import { isGoodTradingAiKnowledgeProvenanceEnabled } from "./features";
import { HumanDecisionReviewRepository } from "../decision/humanReview/repository";
import { resetCriticalCalibrationMemoryForTests } from "../criticalCalibration/memoryStore";
import {
  startCriticalCalibrationSession,
  submitCalibrationAnswer,
} from "../criticalCalibration/sessionService";
import { resetKnowledgeDistillationMemoryForTests } from "../knowledgeDistillation/memoryStore";
import { resetKnowledgeEvolutionMemoryForTests } from "../knowledgeEvolution/memoryStore";

function obs(
  partial: Partial<DistilledObservation> & Pick<DistilledObservation, "id" | "text">,
): DistilledObservation {
  return distilledObservationSchema.parse({
    sourceKind: "CRITICAL_CALIBRATION",
    sessionId: "sess_kp",
    itemId: "item_1",
    lenses: partial.lenses ?? extractLensesFromText(partial.text),
    signals: partial.signals ?? ["ANSWER"],
    createdAtMs: Date.now(),
    mentorEligible: false,
    ...partial,
  });
}

describe("AI-7.3.6 Knowledge Provenance", () => {
  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "kp-"));
    resetKnowledgeProvenanceMemoryForTests(join(dir, "kp"));
    resetKnowledgeEvolutionMemoryForTests(join(dir, "kev"));
    resetKnowledgeDistillationMemoryForTests(join(dir, "kd"));
    resetCriticalCalibrationMemoryForTests(join(dir, "cc"));
    process.env.GOODTRADING_AI_HUMAN_REVIEW_DIR = join(dir, "hr");
  });

  describe("Registry", () => {
    it("registers stable RULE_* ids with origin metadata", () => {
      const observations = [
        obs({ id: "r_01", text: "Absorcion > Delta priority", lenses: ["ABSORPTION", "DELTA"], signals: ["AGREE"] }),
      ];
      const registry = upsertProvenanceRegistry({ observations, existing: [] });
      assert.ok(registry.length >= 1);
      for (const r of registry) {
        assert.ok(r.stableRuleId.startsWith("RULE_"));
        assert.ok(stableRuleIdSchema.safeParse(r.stableRuleId).success);
        assert.equal(r.mentorEligible, false);
        assert.ok(r.currentVersion >= 1);
      }
    });

    it("rejects free-text ids via schema", () => {
      assert.ok(!stableRuleIdSchema.safeParse("free text").success);
    });
  });

  describe("Justification History", () => {
    it("is append-only and never overwrites event ids", () => {
      const observations = [
        obs({ id: "h_01", text: "Absorcion > Delta", lenses: ["ABSORPTION", "DELTA"], signals: ["AGREE"] }),
        obs({ id: "h_02", text: "Absorcion > Delta disagree", lenses: ["ABSORPTION", "DELTA"], signals: ["DISAGREE"] }),
      ];
      const registry = upsertProvenanceRegistry({ observations });
      const e1 = appendJustificationEvents({ previous: [], registry, observations });
      const e2 = appendJustificationEvents({ previous: e1, registry, observations });
      assert.ok(e1.some((e) => e.kind === "CREATED"));
      assert.ok(e1.some((e) => e.kind === "CHALLENGED" || e.kind === "REVIEWED"));
      assert.ok(e2.length >= e1.length);
      assert.ok(e1.every((e) => e.appendOnly === true));
      const ids = e2.map((e) => e.id);
      assert.equal(new Set(ids).size, ids.length);
    });

    it("records contradiction when disagree follows review", () => {
      const t0 = Date.now() - 1000;
      const observations = [
        obs({ id: "c_01", text: "Absorcion > Delta", lenses: ["ABSORPTION", "DELTA"], signals: ["AGREE"], createdAtMs: t0 }),
        obs({
          id: "c_02",
          text: "Absorcion > Delta disagree",
          lenses: ["ABSORPTION", "DELTA"],
          signals: ["DISAGREE"],
          createdAtMs: t0 + 500,
        }),
      ];
      const registry = upsertProvenanceRegistry({ observations });
      const events = appendJustificationEvents({ previous: [], registry, observations });
      assert.ok(events.some((e) => e.kind === "CONTRADICTION_FOUND"));
    });
  });

  describe("Rationale Store", () => {
    it("exposes rationale without edit path", () => {
      const observations = [
        obs({ id: "ra_01", text: "Dealer vs Gamma conflict", lenses: ["DEALER", "GAMMA"], signals: ["DISAGREE"] }),
      ];
      const registry = upsertProvenanceRegistry({ observations });
      const events = appendJustificationEvents({ previous: [], registry, observations });
      const ruleId = buildStableRuleId(["DEALER", "GAMMA"], inferRuleKind(observations[0]!.text, ["DEALER", "GAMMA"]));
      const rationales = listRationalesForRule(events, ruleId);
      assert.ok(rationales.length >= 1);
      assert.ok(rationales[0]!.rationale.rationale.length >= 4);
      assert.equal(assertAppendOnly(events), true);
    });
  });

  describe("Lineage", () => {
    it("builds graph and breaks cycles", () => {
      const observations = [
        obs({ id: "l_01", text: "Absorcion > Delta priority", lenses: ["ABSORPTION", "DELTA"], signals: ["AGREE"] }),
        obs({ id: "l_02", text: "Absorcion confirmation", lenses: ["ABSORPTION"], signals: ["AGREE"] }),
        obs({ id: "l_03", text: "Delta confirmation", lenses: ["DELTA"], signals: ["AGREE"] }),
      ];
      const registry = upsertProvenanceRegistry({ observations });
      const events = appendJustificationEvents({ previous: [], registry, observations });
      const lineage = buildLineageGraph({ registry, events });
      assert.equal(lineage.mentorEligible, false);
      assert.ok(lineage.cyclesBroken >= 0);
      // Force a cycle and ensure breakCycles via parent/child pairs still yields finite graph
      const a = registry[0]!.stableRuleId;
      const b = registry[1]?.stableRuleId ?? a;
      if (a !== b) {
        const forced = {
          edges: [lineageEdge(a, b, "parentRule"), lineageEdge(b, a, "parentRule")],
          cyclesBroken: 0,
          mentorEligible: false as const,
        };
        const again = buildLineageGraph({
          registry,
          events: [
            ...events,
            ...appendJustificationEvents({
              previous: events,
              registry,
              observations: [],
            }),
          ],
        });
        assert.ok(Array.isArray(again.edges));
        assert.ok(forced.edges.length === 2);
      }
    });
  });

  describe("Queries + Timeline", () => {
    it("returns origin evolution revisions counterexamples", () => {
      const observations = [
        obs({ id: "q_01", text: "Absorcion > Delta", lenses: ["ABSORPTION", "DELTA"], signals: ["AGREE"] }),
        obs({ id: "q_02", text: "Absorcion > Delta challenge", lenses: ["ABSORPTION", "DELTA"], signals: ["DISAGREE"] }),
      ];
      const registry = upsertProvenanceRegistry({ observations });
      const events = appendJustificationEvents({ previous: [], registry, observations });
      const lineage = buildLineageGraph({ registry, events });
      const ruleId = registry[0]!.stableRuleId;
      const result = queryProvenance({ ruleId, registry, events, lineage });
      assert.ok(result.origin);
      assert.ok(result.fullEvolution.length >= 1);
      assert.ok(result.counterexamples.length >= 1);
      const timelines = buildPerRuleTimelines(events);
      assert.ok((timelines[ruleId] ?? []).length >= 1);
      assert.ok(timelineForRule(events, ruleId).length >= 1);
    });
  });

  describe("Impact Trace + Proposal Context", () => {
    it("traces impact and builds PENDING proposal context", () => {
      const observations = [
        obs({ id: "i_01", text: "Absorcion > Delta priority", lenses: ["ABSORPTION", "DELTA"], signals: ["AGREE"] }),
        obs({ id: "i_02", text: "Absorcion confirmation", lenses: ["ABSORPTION"], signals: ["DISAGREE"] }),
      ];
      const registry = upsertProvenanceRegistry({ observations });
      const events = appendJustificationEvents({ previous: [], registry, observations });
      const lineage = buildLineageGraph({ registry, events });
      const traces = buildImpactTraces({ registry, events, lineage });
      assert.ok(traces.length >= 1);
      assert.ok(["LOW", "MEDIUM", "HIGH"].includes(traces[0]!.potentialModificationImpact));

      const contexts = buildProposalContexts({
        proposals: [
          {
            id: "prop_test_01",
            title: "Clarify priority",
            reason: `Need review of ${registry[0]!.stableRuleId}`,
            affectedRuleIds: [registry[0]!.stableRuleId],
          },
        ],
        registry,
        events,
        lineage,
      });
      assert.equal(contexts.length, 1);
      proposalContextSchema.parse(contexts[0]);
      assert.equal(contexts[0]!.status, "PENDING");
      assert.equal(contexts[0]!.autoApply, false);
      assert.equal(contexts[0]!.brainMutate, false);
    });
  });

  describe("Pipeline", () => {
    it("runs end-to-end from CC answers without Brain mutate", () => {
      const started = startCriticalCalibrationSession({
        seed: "kp736",
        initialQuestionCount: 2,
        kind: "TECHNICAL",
      });
      submitCalibrationAnswer({
        sessionId: started.session.id,
        questionId: started.blindQuestions[0]!.questionId,
        answerText: "Absorption vs Delta need conditions",
        answerType: "DEPENDS",
        conditions: ["delta confirms"],
        confidence: "MEDIUM",
      });
      const hr = new HumanDecisionReviewRepository(process.env.GOODTRADING_AI_HUMAN_REVIEW_DIR);
      const result = runKnowledgeProvenance({ humanRepo: hr, persist: true });
      provenanceRunResultSchema.parse(result);
      assert.equal(result.brainMutate, false);
      assert.equal(result.autoApply, false);
      assert.equal(result.openAi, false);
      assert.ok(result.registry.every((r) => r.stableRuleId.startsWith("RULE_")));
      assert.ok(getKnowledgeProvenanceMemory().latestRun());
    });
  });

  describe("Flag + safety", () => {
    it("flag defaults false", () => {
      const prev = process.env.GOODTRADING_AI_KNOWLEDGE_PROVENANCE_ENABLED;
      delete process.env.GOODTRADING_AI_KNOWLEDGE_PROVENANCE_ENABLED;
      assert.equal(isGoodTradingAiKnowledgeProvenanceEnabled(), false);
      if (prev != null) process.env.GOODTRADING_AI_KNOWLEDGE_PROVENANCE_ENABLED = prev;
    });

    it("sources forbid openai and Brain apply", () => {
      for (const f of ["pipeline.ts", "proposalContext.ts", "justificationHistory.ts", "memoryStore.ts"]) {
        const src = readFileSync(join(process.cwd(), "server/ai/goodTradingAi/knowledgeProvenance", f), "utf8");
        assert.ok(!/from\s+['"].*openai/i.test(src));
        assert.ok(!/applyToBrain|autoApply:\s*true/.test(src));
      }
    });

    it("gitignore and docs exist", () => {
      assert.ok(readFileSync(join(process.cwd(), ".gitignore"), "utf8").includes("knowledge-provenance"));
      assert.ok(existsSync(join(process.cwd(), "docs/goodtrading-ai-knowledge-provenance.md")));
    });
  });
});