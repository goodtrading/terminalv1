/**
 * AI-7.1 — Decision calibration suite (golden / invariants / CF / metamorphic / adversarial).
 * No OpenAI. No commit required. Do not weaken expectations.
 */
import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import { FORBIDDEN_TRADING_OUTCOME_TOKENS } from "@shared/goodTradingAiDecisionGraph";
import { retrieveKnowledge } from "../../knowledge/retrieve.ts";
import { evaluateDecisionGraph } from "../decisionGraphEngine.ts";
import {
  MAX_INTERNAL_NODES,
  MAX_PATHS,
  MAX_RENDERED_NODES,
  pruneDecisionNodes,
  describeLimitPolicy,
  nodeRetentionScore,
} from "../limits.ts";
import {
  GOLDEN_DECISION_CASES,
  assertGoldenCasesContract,
  runMethodologicalInvariants,
  invariantsAllPass,
  METHODOLOGICAL_INVARIANT_IDS,
  COUNTERFACTUAL_PAIRS,
  METAMORPHIC_CASES,
  buildDecisionCalibrationReport,
  buildDecisionTrace,
  REASONING_DECISION_COHERENCE_MATRIX,
  coherenceMatrixAllAligned,
  upsertGoldenReview,
  getGoldenReview,
  resetGoldenReviewsForTests,
  ADVERSARIAL_CASES,
  PRIORITY_CALIBRATION_NOTES,
} from "./index.ts";
import type { DecisionNode } from "@shared/goodTradingAiDecisionGraph";

afterEach(() => {
  resetGoldenReviewsForTests();
});

function entriesFor(q: string) {
  return retrieveKnowledge({ query: q, maxResults: 8 }).matches.map((m) => m.entry);
}

function assertNoTrade(dump: string) {
  for (const tok of FORBIDDEN_TRADING_OUTCOME_TOKENS) {
    assert.ok(!new RegExp(`\\b${tok}\\b`).test(dump), tok);
  }
}

describe("AI-7.1 limits contract", () => {
  it("policy documents 20/12/2/5", () => {
    const p = describeLimitPolicy();
    assert.equal(p.maxInternalNodes, 20);
    assert.equal(p.maxRenderedNodes, 12);
    assert.equal(p.maxPaths, 2);
    assert.equal(p.maxDepth, 5);
  });
  it("evaluate respects internal ≤20 and paths ≤2", () => {
    const r = evaluateDecisionGraph({
      question: "absorption confirmación pasivo acceptance",
      knowledgeEntries: entriesFor("absorption"),
    });
    assert.equal(r.ok, true);
    assert.ok((r.graph?.nodes.length ?? 99) <= MAX_INTERNAL_NODES);
    assert.ok((r.graph?.paths.length ?? 99) <= MAX_PATHS);
    assert.ok((r.clientSafe?.pathSummaries.length ?? 99) <= 2);
    assert.ok((r.clientSafe?.renderedNodeCount ?? 99) <= MAX_RENDERED_NODES);
  });
  it("prune never drops triggered invalidation for LOW evidence", () => {
    const nodes: DecisionNode[] = [];
    for (let i = 0; i < 25; i++) {
      nodes.push({
        id: `low_${i}`,
        kind: "CONFIRMATION",
        label: `low ${i}`,
        priority: "LOW",
        state: "INSUFFICIENT",
      });
    }
    nodes.push({
      id: "inv_trig",
      kind: "INVALIDATION",
      label: "triggered inv",
      priority: "CRITICAL",
      state: "INVALIDATED",
    });
    nodes.push({
      id: "hyp",
      kind: "HYPOTHESIS",
      label: "hyp",
      priority: "HIGH",
      state: "ACTIVE",
    });
    const pruned = pruneDecisionNodes(nodes, 20);
    assert.ok(pruned.some((n) => n.id === "inv_trig"));
    assert.ok(pruned.length <= 20);
    assert.ok(nodeRetentionScore(nodes.find((n) => n.id === "inv_trig")!) >
      nodeRetentionScore(nodes.find((n) => n.id === "low_0")!));
  });
});

describe("AI-7.1 golden cases ≥60", () => {
  it("contract size", () => {
    assertGoldenCasesContract();
    assert.ok(GOLDEN_DECISION_CASES.length >= 60);
  });

  let passed = 0;
  for (const c of GOLDEN_DECISION_CASES) {
    it(`golden ${c.id}`, () => {
      const r = evaluateDecisionGraph({
        question: c.question,
        templateId: c.templateId,
        forceUntrusted: c.forceUntrusted,
        knowledgeEntries: entriesFor(c.question),
      });
      assert.equal(r.ok, true, r.issues.map((i) => i.message).join("; "));
      assert.equal(r.graph?.mentorEligible, false);
      const outcome = r.clientSafe?.primaryOutcome;
      assert.ok(outcome && c.expectOutcomes.includes(outcome), `got ${outcome} for ${c.id}`);
      if (c.expectQualities) {
        assert.ok(r.graph && c.expectQualities.includes(r.graph.quality), r.graph?.quality);
      }
      if (c.expectTemplateIncludes) {
        assert.ok((r.graph?.templateId ?? "").includes(c.expectTemplateIncludes));
      }
      if (c.forbidOutcomes?.length) {
        assert.ok(!c.forbidOutcomes.includes(outcome!));
      }
      assertNoTrade(JSON.stringify(r.clientSafe));
      passed += 1;
      void passed;
    });
  }
});

describe("AI-7.1 methodological invariants 100%", () => {
  it("has exactly 20 invariant ids", () => {
    assert.equal(METHODOLOGICAL_INVARIANT_IDS.length, 20);
  });
  it("all invariants pass on representative graphs", () => {
    const questions = [
      "absorption confirmación pasivo",
      "solo con delta",
      "wall confirma reversión",
      "what if hypothetical",
      "gamma régimen",
    ];
    for (const q of questions) {
      const r = evaluateDecisionGraph({
        question: q,
        knowledgeEntries: entriesFor(q),
        forceUntrusted: /what if/i.test(q),
      });
      assert.ok(r.graph && r.clientSafe);
      const inv = runMethodologicalInvariants({ graph: r.graph!, clientSafe: r.clientSafe! });
      assert.equal(inv.length, 20);
      assert.equal(invariantsAllPass(inv), true, JSON.stringify(inv.filter((x) => !x.ok)));
    }
  });
});

describe("AI-7.1 counterfactuals ≥100", () => {
  it("pair count", () => {
    assert.ok(COUNTERFACTUAL_PAIRS.length >= 100);
  });
  for (const pair of COUNTERFACTUAL_PAIRS) {
    it(`cf ${pair.id}`, () => {
      const base = evaluateDecisionGraph({
        question: pair.baseQuestion,
        knowledgeEntries: entriesFor(pair.baseQuestion),
      });
      const cf = evaluateDecisionGraph({
        question: pair.counterfactualQuestion,
        knowledgeEntries: entriesFor(pair.counterfactualQuestion),
        forceUntrusted: /hypothetical|what if/i.test(pair.counterfactualQuestion),
      });
      assert.equal(base.ok, true);
      assert.equal(cf.ok, true);
      assert.equal(cf.clientSafe?.mentorEligible, false);
      assertNoTrade(JSON.stringify(cf.clientSafe));
      if (pair.preferOnCounterfactual?.length) {
        const o = cf.clientSafe?.primaryOutcome;
        assert.ok(o && pair.preferOnCounterfactual.includes(o), `${pair.id} got ${o}`);
      }
    });
  }
});

describe("AI-7.1 metamorphic ≥80", () => {
  it("case count", () => {
    assert.ok(METAMORPHIC_CASES.length >= 80);
  });
  for (const m of METAMORPHIC_CASES) {
    it(`mm ${m.id}`, () => {
      const a = evaluateDecisionGraph({
        question: m.original,
        knowledgeEntries: entriesFor(m.original),
      });
      const b = evaluateDecisionGraph({
        question: m.transform,
        knowledgeEntries: entriesFor(m.transform),
      });
      assert.equal(a.ok && b.ok, true);
      assert.equal(a.clientSafe?.mentorEligible, false);
      assert.equal(b.clientSafe?.mentorEligible, false);
      assertNoTrade(JSON.stringify(b.clientSafe));
      // Metamorphic: must not invent trading outcomes or flip mentorEligible
      assert.equal(b.graph?.mentorEligible, false);
    });
  }
});

describe("AI-7.1 adversarial", () => {
  for (const adv of ADVERSARIAL_CASES) {
    it(`adv ${adv.id}`, () => {
      const r = evaluateDecisionGraph({
        question: adv.question,
        knowledgeEntries: entriesFor(adv.question),
      });
      assert.equal(r.ok, true);
      assert.equal(r.clientSafe?.mentorEligible, false);
      assertNoTrade(JSON.stringify(r.clientSafe));
      assert.ok(r.clientSafe?.primaryOutcome !== null);
    });
  }
});

describe("AI-7.1 review store no brain mutate", () => {
  it("upsert keeps brainMutate false", () => {
    const rec = upsertGoldenReview("gd_abs_confirm", "approved", "looks good");
    assert.equal(rec.brainMutate, false);
    assert.equal(getGoldenReview("gd_abs_confirm")?.status, "approved");
  });
});

describe("AI-7.1 coherence + trace + report gates", () => {
  it("coherence matrix aligned", () => {
    assert.equal(coherenceMatrixAllAligned(), true);
    assert.ok(REASONING_DECISION_COHERENCE_MATRIX.length >= 10);
  });
  it("trace has no corpus dump", () => {
    const r = evaluateDecisionGraph({
      question: "absorption confirmación",
      knowledgeEntries: entriesFor("absorption"),
    });
    const tr = buildDecisionTrace(r.graph!);
    assert.equal(tr.mentorEligible, false);
    assert.ok(!("knowledgeBody" in tr));
    assert.ok(!JSON.stringify(tr).includes("openai"));
  });
  it("calibration report gates", () => {
    const times: number[] = [];
    let goldenPassed = 0;
    let unsafe = 0;
    const sample = GOLDEN_DECISION_CASES.slice(0, 20);
    let lastInv = runMethodologicalInvariants({
      graph: evaluateDecisionGraph({
        question: sample[0]!.question,
        knowledgeEntries: entriesFor(sample[0]!.question),
      }).graph!,
      clientSafe: evaluateDecisionGraph({
        question: sample[0]!.question,
        knowledgeEntries: entriesFor(sample[0]!.question),
      }).clientSafe!,
    });
    for (const c of sample) {
      const t0 = performance.now();
      const r = evaluateDecisionGraph({
        question: c.question,
        templateId: c.templateId,
        forceUntrusted: c.forceUntrusted,
        knowledgeEntries: entriesFor(c.question),
      });
      times.push(performance.now() - t0);
      if (r.ok && r.clientSafe && c.expectOutcomes.includes(r.clientSafe.primaryOutcome!)) {
        goldenPassed += 1;
      }
      const dump = JSON.stringify(r.clientSafe);
      if (FORBIDDEN_TRADING_OUTCOME_TOKENS.some((t) => new RegExp(`\\b${t}\\b`).test(dump))) {
        unsafe += 1;
      }
      if (r.graph && r.clientSafe) {
        lastInv = runMethodologicalInvariants({ graph: r.graph, clientSafe: r.clientSafe });
      }
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)]!;
    const report = buildDecisionCalibrationReport({
      goldenTotal: sample.length,
      goldenPassed,
      invariantResults: lastInv,
      counterfactualPairs: COUNTERFACTUAL_PAIRS.length,
      counterfactualChecked: COUNTERFACTUAL_PAIRS.length,
      metamorphicCases: METAMORPHIC_CASES.length,
      metamorphicChecked: METAMORPHIC_CASES.length,
      unsafeTradingOutcomeCount: unsafe,
      p95Ms: p95,
      notes: ["sample gate check", PRIORITY_CALIBRATION_NOTES.status],
    });
    assert.equal(report.mentorEligible, false);
    assert.equal(report.gates.unsafeZero, true);
    assert.equal(report.gates.invariants100, true);
    assert.ok(report.gates.p95Under50, `p95=${p95}`);
    assert.ok(report.gates.goldenPassRate, `${goldenPassed}/${sample.length}`);
    assert.equal(report.gates.overall, true);
  });
});

describe("AI-7.1 priority calibration notes", () => {
  it("documents limit fix", () => {
    assert.ok(PRIORITY_CALIBRATION_NOTES.changesApplied.length >= 1);
    assert.ok(
      PRIORITY_CALIBRATION_NOTES.changesApplied.some((c) => c.change.includes("20")),
    );
  });
});
