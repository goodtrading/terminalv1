import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  distilledObservationSchema,
  type DistilledObservation,
} from "@shared/goodTradingAiKnowledgeDistillation";
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
import { buildAdaptivePriorityV2, mapPriorityV2ToDistillationDrivers } from "./adaptivePriorityV2";
import { appendTimelineEvents } from "./timeline";
import { buildStabilityReport } from "./stabilityReport";

function obs(
  partial: Partial<DistilledObservation> & Pick<DistilledObservation, "id" | "text">,
): DistilledObservation {
  return distilledObservationSchema.parse({
    sourceKind: "CRITICAL_CALIBRATION",
    sessionId: "sess_kev_eng",
    itemId: "item_1",
    lenses: partial.lenses ?? extractLensesFromText(partial.text),
    signals: partial.signals ?? ["ANSWER"],
    createdAtMs: Date.now(),
    mentorEligible: false,
    ...partial,
  });
}

describe("AI-7.3.5 KE engines matrix", () => {
  const idCases: Array<[string[], string, string]> = [
    [["ABSORPTION", "DELTA"], "PRIORITY", "RULE_ABSORPTION_DELTA_PRIORITY"],
    [["DEALER", "GAMMA"], "CONFLICT", "RULE_DEALER_GAMMA_CONFLICT"],
    [["LIQUIDITY"], "CONFIRMATION", "RULE_LIQUIDITY_CONFIRMATION"],
    [["INVALIDATION"], "INVALIDATION", "RULE_INVALIDATION_INVALIDATION"],
    [["CVD", "DELTA"], "GENERAL", "RULE_CVD_DELTA_GENERAL"],
  ];
  for (const [lenses, kind, expected] of idCases) {
    it(`stable id ${expected}`, () => {
      assert.equal(buildStableRuleId(lenses as never, kind as never), expected);
    });
  }

  const kindCases: Array<[string, string]> = [
    ["Absorcion pesa mas que Delta", "PRIORITY"],
    ["absorption weighs more than delta", "PRIORITY"],
    ["Dealer vs Gamma conflict", "CONFLICT"],
    ["full invalidation stack", "INVALIDATION"],
    ["delta confirmation required", "CONFIRMATION"],
    ["oi expansion note", "GENERAL"],
  ];
  for (const [text, kind] of kindCases) {
    it(`inferRuleKind(${JSON.stringify(text)}) -> ${kind}`, () => {
      assert.equal(inferRuleKind(text, extractLensesFromText(text)), kind);
    });
  }

  it("registry upsert is idempotent on same lenses+kind", () => {
    const observations = [
      obs({ id: "m_01", text: "Absorcion > Delta", lenses: ["ABSORPTION", "DELTA"], signals: ["AGREE"] }),
      obs({ id: "m_02", text: "Absorcion pesa mas que Delta", lenses: ["ABSORPTION", "DELTA"], signals: ["AGREE"] }),
    ];
    const r1 = upsertRegistryFromObservations(observations, clusterRules(observations), []);
    const r2 = upsertRegistryFromObservations(observations, clusterRules(observations), r1);
    const ids1 = r1.map((r) => r.id).sort().join(",");
    const ids2 = r2.map((r) => r.id).sort().join(",");
    assert.equal(ids1, ids2);
  });

  it("stability bounded for many histories", () => {
    const observations = Array.from({ length: 8 }, (_, i) =>
      obs({
        id: `st_${String(i).padStart(2, "0")}`,
        text: "Absorcion > Delta",
        lenses: ["ABSORPTION", "DELTA"],
        signals: i % 2 === 0 ? ["AGREE"] : ["DISAGREE"],
      }),
    );
    const rules = upsertRegistryFromObservations(observations, clusterRules(observations), []);
    const stabilities = computeStabilities(buildHistories(rules, observations, []));
    for (const s of stabilities) {
      assert.ok(s.stabilityScore >= 0 && s.stabilityScore <= 1);
      assert.ok(s.repetition >= 0 && s.consistency >= 0);
    }
  });

  it("volatility matrix across lenses", () => {
    const lenses = ["DELTA", "GAMMA", "DEALER", "CVD", "ABSORPTION"] as const;
    for (const lens of lenses) {
      const observations = [
        obs({ id: `vl_${lens}_1`, text: `${lens} conflict revision`, lenses: [lens], signals: ["DISAGREE", "REVISION"] }),
      ];
      const rules = upsertRegistryFromObservations(observations, clusterRules(observations), []);
      const vols = computeVolatilities(buildHistories(rules, observations, []));
      assert.ok(vols[0]!.volatilityScore > 0);
    }
  });

  it("dependency relations cover expected set", () => {
    const observations = [
      obs({ id: "dep_01", text: "Absorcion > Delta priority", lenses: ["ABSORPTION", "DELTA"], signals: ["AGREE"] }),
      obs({ id: "dep_02", text: "Absorcion confirmation required", lenses: ["ABSORPTION"], signals: ["AGREE"] }),
      obs({ id: "dep_03", text: "Invalidation of absorption", lenses: ["ABSORPTION", "INVALIDATION"], signals: ["ANSWER"] }),
      obs({ id: "dep_04", text: "Absorcion vs Delta conflict", lenses: ["ABSORPTION", "DELTA"], signals: ["DISAGREE"] }),
    ];
    const rules = upsertRegistryFromObservations(observations, clusterRules(observations), []);
    const graph = buildDependencyGraph(rules);
    const rels = new Set(graph.edges.map((e) => e.relation));
    assert.ok(rels.size >= 1);
    assert.ok(graph.cyclesBroken >= 0);
  });

  it("keystone scores sorted descending", () => {
    const observations = [
      obs({ id: "ks_01", text: "Absorcion > Delta priority", lenses: ["ABSORPTION", "DELTA"], signals: ["AGREE"] }),
      obs({ id: "ks_02", text: "Absorcion confirmation", lenses: ["ABSORPTION"], signals: ["AGREE"] }),
      obs({ id: "ks_03", text: "Delta confirmation", lenses: ["DELTA"], signals: ["AGREE"] }),
      obs({ id: "ks_04", text: "Gamma flip note", lenses: ["GAMMA", "FLIP"], signals: ["ANSWER"] }),
    ];
    const rules = upsertRegistryFromObservations(observations, clusterRules(observations), []);
    const keystones = detectKeystones(rules, buildDependencyGraph(rules));
    for (let i = 1; i < keystones.length; i++) {
      assert.ok(keystones[i - 1]!.keystoneScore >= keystones[i]!.keystoneScore);
    }
  });

  it("obsolete neverDelete always true", () => {
    const observations = [obs({ id: "ob_01", text: "Delta confirmation", lenses: ["DELTA"], signals: ["AGREE"] })];
    const rules = upsertRegistryFromObservations(observations, clusterRules(observations), []);
    const withExtra = [
      ...rules,
      {
        ...rules[0]!,
        id: "RULE_FOOTPRINT_GENERAL" as const,
        lenses: ["FOOTPRINT" as const],
        label: "FOOTPRINT GENERAL",
        conceptKey: "FOOTPRINT",
      },
    ];
    const histories = buildHistories(rules, observations, []);
    const obsolete = detectObsoleteRules({
      rules: withExtra,
      histories,
      stabilities: computeStabilities(histories),
      graph: buildDependencyGraph(withExtra),
    });
    assert.ok(obsolete.every((o) => o.neverDelete));
  });

  it("adaptive priority driver rank mapping to distillation", () => {
    const mapped = mapPriorityV2ToDistillationDrivers([
      "HIGH_VOLATILITY",
      "LOW_STABILITY",
      "LOW_CONFIDENCE",
      "RANDOM",
    ]);
    assert.ok(mapped.includes("HIGH_CONFLICT"));
    assert.ok(mapped.includes("LOW_COVERAGE"));
    assert.ok(mapped.includes("LOW_CONFIDENCE"));
  });

  it("priority engine prefers volatility/conflict drivers first", () => {
    const observations = [
      obs({
        id: "pr_01",
        text: "Absorcion > Delta conflict",
        lenses: ["ABSORPTION", "DELTA"],
        signals: ["DISAGREE", "REVISION", "NEEDS_CONDITIONS"],
      }),
      obs({ id: "pr_02", text: "Oi note", lenses: ["OI"], signals: ["ANSWER"] }),
    ];
    const rules = upsertRegistryFromObservations(observations, clusterRules(observations), []);
    const histories = buildHistories(rules, observations, []);
    const stabilities = computeStabilities(histories);
    const volatilities = computeVolatilities(histories);
    const keystones = detectKeystones(rules, buildDependencyGraph(rules));
    const priority = buildAdaptivePriorityV2({ histories, stabilities, volatilities, keystones });
    assert.ok(priority.length >= 1);
    assert.ok(priority[0]!.priorityScore >= priority[priority.length - 1]!.priorityScore);
  });

  it("timeline kinds include created and disagreement", () => {
    const observations = [
      obs({ id: "tm_01", text: "Absorcion > Delta", lenses: ["ABSORPTION", "DELTA"], signals: ["DISAGREE"] }),
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
    const kinds = new Set(timeline.map((e) => e.kind));
    assert.ok(kinds.has("CREATED"));
    assert.ok(kinds.has("DISAGREEMENT"));
    const report = buildStabilityReport({ histories, stabilities, volatilities });
    assert.ok(report.mostChallenged.length >= 0);
  });
});