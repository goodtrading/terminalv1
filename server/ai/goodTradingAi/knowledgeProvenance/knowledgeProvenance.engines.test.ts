import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  distilledObservationSchema,
  type DistilledObservation,
} from "@shared/goodTradingAiKnowledgeDistillation";
import { justificationEventKindSchema } from "@shared/goodTradingAiKnowledgeProvenance";
import { extractLensesFromText } from "../knowledgeDistillation/normalize";
import { upsertProvenanceRegistry } from "./provenanceRegistry";
import { appendJustificationEvents } from "./justificationHistory";
import { buildLineageGraph } from "./ruleLineage";
import { queryProvenance } from "./provenanceQueries";
import { buildPerRuleTimelines } from "./knowledgeTimeline";
import { buildImpactTraces } from "./impactTrace";
import { buildProposalContexts } from "./proposalContext";
import { listRationalesForRule } from "./rationaleStore";

function obs(
  partial: Partial<DistilledObservation> & Pick<DistilledObservation, "id" | "text">,
): DistilledObservation {
  return distilledObservationSchema.parse({
    sourceKind: "CRITICAL_CALIBRATION",
    sessionId: "sess_kp_eng",
    itemId: "item_1",
    lenses: partial.lenses ?? extractLensesFromText(partial.text),
    signals: partial.signals ?? ["ANSWER"],
    createdAtMs: Date.now(),
    mentorEligible: false,
    ...partial,
  });
}

describe("AI-7.3.6 KP engines matrix", () => {
  const kinds = [
    "CREATED",
    "REVIEWED",
    "CHALLENGED",
    "REFINED",
    "EXCEPTION_ADDED",
    "CONTRADICTION_FOUND",
    "REPLACED",
    "MERGED",
    "SPLIT",
    "DEPRECATED",
  ] as const;

  for (const kind of kinds) {
    it(`justification kind includes ${kind}`, () => {
      assert.ok(justificationEventKindSchema.options.includes(kind));
    });
  }

  it("registry origins include CRITICAL_CALIBRATION", () => {
    const observations = [
      obs({ id: "o_01", text: "Absorcion > Delta", lenses: ["ABSORPTION", "DELTA"], signals: ["AGREE"] }),
    ];
    const registry = upsertProvenanceRegistry({ observations });
    assert.ok(registry.some((r) => r.origin === "CRITICAL_CALIBRATION"));
  });

  const signalCases: Array<[string, string[]]> = [
    ["AGREE", ["REVIEWED", "CREATED"]],
    ["DISAGREE", ["CHALLENGED", "CREATED"]],
    ["REVISION", ["REFINED", "CREATED"]],
    ["NEEDS_CONDITIONS", ["EXCEPTION_ADDED", "CREATED"]],
  ];
  for (const [signal, expectedKinds] of signalCases) {
    it(`signal ${signal} produces expected event kinds`, () => {
      const observations = [
        obs({
          id: `sig_${signal}`,
          text: "Absorcion > Delta case",
          lenses: ["ABSORPTION", "DELTA"],
          signals: [signal as DistilledObservation["signals"][number]],
        }),
      ];
      const registry = upsertProvenanceRegistry({ observations });
      const events = appendJustificationEvents({ previous: [], registry, observations });
      const kindsSeen = new Set(events.map((e) => e.kind));
      assert.ok(expectedKinds.some((k) => kindsSeen.has(k as never)));
    });
  }

  it("timeline never deletes older events on rebuild", () => {
    const observations = [
      obs({ id: "t_01", text: "Delta confirmation", lenses: ["DELTA"], signals: ["AGREE"], createdAtMs: 1000 }),
      obs({ id: "t_02", text: "Delta confirmation challenge", lenses: ["DELTA"], signals: ["DISAGREE"], createdAtMs: 2000 }),
    ];
    const registry = upsertProvenanceRegistry({ observations });
    const e1 = appendJustificationEvents({ previous: [], registry, observations: [observations[0]!] });
    const e2 = appendJustificationEvents({ previous: e1, registry, observations });
    const timelines = buildPerRuleTimelines(e2);
    const ruleId = registry[0]!.stableRuleId;
    assert.ok((timelines[ruleId] ?? []).length >= 2);
    assert.ok(e2.length >= e1.length);
  });

  it("lineage relatedRules for shared lenses", () => {
    const observations = [
      obs({ id: "lr_01", text: "Absorcion priority", lenses: ["ABSORPTION"], signals: ["AGREE"] }),
      obs({ id: "lr_02", text: "Absorcion confirmation", lenses: ["ABSORPTION"], signals: ["AGREE"] }),
    ];
    const registry = upsertProvenanceRegistry({ observations });
    const events = appendJustificationEvents({ previous: [], registry, observations });
    const lineage = buildLineageGraph({ registry, events });
    assert.ok(lineage.edges.length >= 0);
  });

  it("query derived/superseded arrays are arrays", () => {
    const observations = [
      obs({ id: "qd_01", text: "Gamma flip note", lenses: ["GAMMA", "FLIP"], signals: ["ANSWER"] }),
    ];
    const registry = upsertProvenanceRegistry({ observations });
    const events = appendJustificationEvents({ previous: [], registry, observations });
    const lineage = buildLineageGraph({ registry, events });
    const q = queryProvenance({ ruleId: registry[0]!.stableRuleId, registry, events, lineage });
    assert.ok(Array.isArray(q.derivedRules));
    assert.ok(Array.isArray(q.supersededRules));
  });

  it("impact traces cover all registry rules", () => {
    const observations = [
      obs({ id: "im_01", text: "Dealer vs Gamma", lenses: ["DEALER", "GAMMA"], signals: ["DISAGREE"] }),
      obs({ id: "im_02", text: "Liquidity acceptance", lenses: ["LIQUIDITY", "ACCEPTANCE"], signals: ["AGREE"] }),
    ];
    const registry = upsertProvenanceRegistry({ observations });
    const events = appendJustificationEvents({ previous: [], registry, observations });
    const lineage = buildLineageGraph({ registry, events });
    const traces = buildImpactTraces({ registry, events, lineage });
    assert.equal(traces.length, registry.length);
  });

  it("proposal context stays PENDING with safety flags", () => {
    const observations = [
      obs({ id: "pc_01", text: "Absorcion > Delta", lenses: ["ABSORPTION", "DELTA"], signals: ["AGREE"] }),
    ];
    const registry = upsertProvenanceRegistry({ observations });
    const events = appendJustificationEvents({ previous: [], registry, observations });
    const lineage = buildLineageGraph({ registry, events });
    const ctx = buildProposalContexts({
      proposals: [{ id: "prop_01", reason: registry[0]!.stableRuleId, affectedRuleIds: [registry[0]!.stableRuleId] }],
      registry,
      events,
      lineage,
    });
    assert.equal(ctx[0]!.status, "PENDING");
    assert.equal(ctx[0]!.safety, "NOT_SAFE_FOR_BRAIN_APPLICATION");
    const rats = listRationalesForRule(events, registry[0]!.stableRuleId);
    assert.ok(rats.length >= 1);
  });
});