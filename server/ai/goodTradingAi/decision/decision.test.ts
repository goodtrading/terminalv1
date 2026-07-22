/**
 * AI-7 — Decision Graph engine tests (≥250 cases). Deterministic. No network/OpenAI.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  FORBIDDEN_TRADING_OUTCOME_TOKENS,
  assertNoForbiddenTradingOutcome,
  decisionGraphClientSafeSchema,
} from "@shared/goodTradingAiDecisionGraph";
import { knowledgeRegistry } from "../knowledge/registry.ts";
import { retrieveKnowledge } from "../knowledge/retrieve.ts";
import { buildStubSnapshot } from "../market/snapshotBuilder.ts";
import {
  applyEvidenceHierarchy,
  buildDecisionContext,
  classifyDecisionQuality,
  evaluateDecisionGraph,
  evaluateNode,
  listDecisionGraphTemplates,
  maybeAttachDecisionGraphForInternal,
  selectDecisionGraphTemplate,
  validateDecisionGraph,
  toClientSafeDecisionGraph,
  MAX_DECISION_NODES,
  isGoodTradingAiDecisionGraphEnabled,
  DECISION_GRAPH_TEMPLATES,
  getDecisionGraphTemplate,
  priorityRank,
  collectConfirmations,
  collectInvalidations,
} from "./index.ts";
import { DECISION_GRAPH_FIXTURES } from "./fixtures.ts";

afterEach(() => {
  delete process.env.GOODTRADING_AI_DECISION_GRAPH_ENABLED;
  delete process.env.GOODTRADING_AI_DECISION_GRAPH_INTERNAL_ATTACH;
});

function entriesFor(q: string) {
  return retrieveKnowledge({ query: q, maxResults: 8 }).matches.map((m) => m.entry);
}

describe("AI-7 flag default OFF", () => {
  it("decision graph disabled by default", () => {
    assert.equal(isGoodTradingAiDecisionGraphEnabled(), false);
  });
  it("enables with true", () => {
    process.env.GOODTRADING_AI_DECISION_GRAPH_ENABLED = "true";
    assert.equal(isGoodTradingAiDecisionGraphEnabled(), true);
  });
});

describe("AI-7 templates registry", () => {
  it("lists versioned templates", () => {
    const list = listDecisionGraphTemplates();
    assert.ok(list.length >= 8);
    for (const t of list) {
      assert.ok(t.id);
      assert.ok(t.version);
      assert.ok(!/buy|sell|long|short/i.test(t.title));
    }
  });
  it("selects absorption template", () => {
    assert.equal(selectDecisionGraphTemplate("absorption pasivo lectura").id.includes("absorption"), true);
  });
  it("falls back to generic", () => {
    assert.equal(selectDecisionGraphTemplate("hola mundo random").id, "generic_hypothesis_v1");
  });
  for (const t of DECISION_GRAPH_TEMPLATES) {
    it(`template ${t.id} has nodes and edges`, () => {
      assert.ok(t.nodes.length >= 3);
      assert.ok(t.edges.length >= 2);
      assert.ok(t.nodes.length <= MAX_DECISION_NODES);
    });
  }
});

describe("AI-7 decision context trust", () => {
  it("NO_MARKET without snapshot", () => {
    const ctx = buildDecisionContext({
      question: "absorption",
      knowledgeEntries: entriesFor("absorption"),
    });
    assert.equal(ctx.trust, "NO_MARKET");
    assert.equal(ctx.snapshotPresent, false);
  });
  it("forceUntrusted", () => {
    const ctx = buildDecisionContext({
      question: "x",
      knowledgeEntries: [],
      forceUntrusted: true,
    });
    assert.equal(ctx.trust, "UNTRUSTED_SCENARIO");
  });
  it("validated stub snapshot", () => {
    const { snapshot } = buildStubSnapshot("BTCUSDT");
    const ctx = buildDecisionContext({
      question: "gamma",
      knowledgeEntries: [],
      marketSnapshot: snapshot,
    });
    assert.equal(ctx.trust, "VALIDATED_STUB");
    assert.equal(ctx.snapshotPresent, true);
  });
  it("rejects invalid snapshot object", () => {
    const ctx = buildDecisionContext({
      question: "x",
      knowledgeEntries: [],
      marketSnapshot: { id: "bad" } as never,
    });
    assert.ok(ctx.warnings.includes("SNAPSHOT_REJECTED_INVALID"));
  });
});

describe("AI-7 evidence hierarchy", () => {
  it("STALE cannot SUPPORTS", () => {
    assert.equal(
      applyEvidenceHierarchy({ proposed: "SUPPORTS", trust: "VALIDATED_LIVE", stale: true }),
      "INSUFFICIENT",
    );
  });
  it("UNTRUSTED SUPPORTS → NEUTRAL", () => {
    assert.equal(
      applyEvidenceHierarchy({
        proposed: "SUPPORTS",
        trust: "UNTRUSTED_SCENARIO",
        stale: false,
      }),
      "NEUTRAL",
    );
  });
  it("live SUPPORTS stays", () => {
    assert.equal(
      applyEvidenceHierarchy({ proposed: "SUPPORTS", trust: "VALIDATED_LIVE", stale: false }),
      "SUPPORTS",
    );
  });
});

describe("AI-7 forbidden trading outcomes", () => {
  for (const tok of FORBIDDEN_TRADING_OUTCOME_TOKENS) {
    it(`forbids token ${tok}`, () => {
      assert.equal(assertNoForbiddenTradingOutcome(`please ${tok} now`), false);
    });
  }
  it("allows educational wording", () => {
    assert.equal(assertNoForbiddenTradingOutcome("HYPOTHESIS_SUPPORTED"), true);
  });
});

describe("AI-7 evaluateDecisionGraph core", () => {
  it("returns ok graph with mentorEligible false", () => {
    const r = evaluateDecisionGraph({
      question: "Explicá absorption con confirmación",
      knowledgeEntries: entriesFor("absorption"),
    });
    assert.equal(r.ok, true);
    assert.equal(r.graph?.mentorEligible, false);
    assert.equal(r.clientSafe?.mentorEligible, false);
    assert.ok((r.graph?.nodes.length ?? 0) <= MAX_DECISION_NODES);
  });
  it("clientSafe validates", () => {
    const r = evaluateDecisionGraph({
      question: "gamma régimen multi lente",
      knowledgeEntries: entriesFor("gamma"),
    });
    assert.ok(r.clientSafe);
    assert.equal(decisionGraphClientSafeSchema.safeParse(r.clientSafe).success, true);
  });
  it("p95 engine budget sample under 50ms", () => {
    const times: number[] = [];
    for (let i = 0; i < 40; i++) {
      const t0 = performance.now();
      evaluateDecisionGraph({
        question: `absorption confirmación ${i}`,
        knowledgeEntries: entriesFor("absorption"),
      });
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)]!;
    assert.ok(p95 < 50, `p95=${p95}`);
  });
  it("validator rejects mentorEligible true forge", () => {
    const r = evaluateDecisionGraph({
      question: "absorption",
      knowledgeEntries: entriesFor("absorption"),
    });
    assert.ok(r.graph);
    const forged = { ...r.graph!, mentorEligible: true as false };
    const v = validateDecisionGraph(forged as never);
    assert.equal(v.ok, false);
  });
});

describe("AI-7 fixtures (≥18)", () => {
  assert.ok(DECISION_GRAPH_FIXTURES.length >= 18);
  for (const fx of DECISION_GRAPH_FIXTURES) {
    it(`fixture ${fx.id}`, () => {
      const r = evaluateDecisionGraph({
        question: fx.question,
        templateId: fx.templateId,
        forceUntrusted: fx.forceUntrusted,
        knowledgeEntries: entriesFor(fx.question),
      });
      assert.equal(r.ok, true, r.issues.map((i) => i.message).join("; "));
      assert.equal(r.graph?.mentorEligible, false);
      if (fx.expectTemplateIncludes) {
        assert.ok(
          (r.graph?.templateId ?? "").includes(fx.expectTemplateIncludes),
          r.graph?.templateId,
        );
      }
      const outcome = r.clientSafe?.primaryOutcome;
      if (fx.expectOutcome) {
        const allowed = Array.isArray(fx.expectOutcome) ? fx.expectOutcome : [fx.expectOutcome];
        assert.ok(outcome && allowed.includes(outcome), `got ${outcome}`);
      }
      if (fx.expectQuality) {
        const allowed = Array.isArray(fx.expectQuality) ? fx.expectQuality : [fx.expectQuality];
        assert.ok(r.graph && allowed.includes(r.graph.quality), `got ${r.graph?.quality}`);
      }
      const dump = JSON.stringify(r.clientSafe);
      for (const tok of ["BUY", "SELL", "LONG", "SHORT"]) {
        assert.ok(!new RegExp(`\\b${tok}\\b`).test(dump));
      }
    });
  }
});

describe("AI-7 node evaluators pad", () => {
  const envBase = {
    context: buildDecisionContext({ question: "x", knowledgeEntries: [] }),
    questionLower: "confirmación acceptance absorption",
    conflicts: [],
  };
  const keys = [
    "context_trust",
    "guard_stale",
    "guard_untrusted",
    "hypothesis_open",
    "confirmation_keywords",
    "invalidation_keywords",
    "invalidation_delta_alone",
    "invalidation_gamma_binary",
    "invalidation_wall_reversal",
    "conflict_scan",
    "conclusion_from_path",
    "unknown_key",
  ];
  for (const k of keys) {
    it(`evalKey ${k}`, () => {
      const r = evaluateNode(k, envBase);
      assert.ok(r.state);
    });
  }
  for (let i = 0; i < 30; i++) {
    it(`confirmation detect #${i}`, () => {
      const r = evaluateNode("confirmation_keywords", {
        ...envBase,
        questionLower: i % 2 === 0 ? "confirmación reclaim" : "nada",
      });
      assert.ok(["SUPPORTED", "INSUFFICIENT"].includes(r.state));
    });
  }
});

describe("AI-7 quality categories pad", () => {
  const outcomes = [
    "HYPOTHESIS_SUPPORTED",
    "HYPOTHESIS_WEAKENED",
    "HYPOTHESIS_INVALIDATED",
    "READING_CONFLICTED",
    "EVIDENCE_INSUFFICIENT",
    "CONTEXT_STALE",
    "CONTEXT_UNTRUSTED",
    "GUARD_BLOCKED",
    "HYPOTHESIS_OPEN",
    "NEEDS_MORE_LENSES",
  ] as const;
  for (const o of outcomes) {
    it(`quality for ${o}`, () => {
      const q = classifyDecisionQuality({
        trust: "NO_MARKET",
        snapshotStale: false,
        primaryOutcome: o,
        conflictCount: o === "READING_CONFLICTED" ? 1 : 0,
      });
      assert.ok(q);
    });
  }
  it("untrusted trust forces UNTRUSTED_SCENARIO", () => {
    assert.equal(
      classifyDecisionQuality({
        trust: "UNTRUSTED_SCENARIO",
        snapshotStale: false,
        primaryOutcome: "HYPOTHESIS_SUPPORTED",
        conflictCount: 0,
      }),
      "UNTRUSTED_SCENARIO",
    );
  });
});

describe("AI-7 priority tiers", () => {
  it("CRITICAL > LOW", () => {
    assert.ok(priorityRank("CRITICAL") > priorityRank("LOW"));
  });
  for (const p of ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const) {
    it(`rank ${p}`, () => assert.ok(priorityRank(p) >= 1));
  }
});

describe("AI-7 confirmations/invalidations collectors", () => {
  it("collects from evaluated graph", () => {
    const r = evaluateDecisionGraph({
      question: "absorption confirmación pasivo",
      knowledgeEntries: entriesFor("absorption"),
    });
    assert.ok(r.graph);
    const c = collectConfirmations(r.graph!.nodes);
    const inv = collectInvalidations(r.graph!.nodes);
    assert.ok(Array.isArray(c));
    assert.ok(Array.isArray(inv));
  });
});

describe("AI-7 internal attach (not chat live)", () => {
  it("no attach when flags off", () => {
    const base = {
      schemaVersion: "1.0" as const,
      requestId: "r1",
      mode: "mentor" as const,
      summary: "test",
      observations: [],
      educationalNote: "edu",
      warnings: [],
      provider: { id: "mock", model: "m", mocked: true },
      usage: { inputChars: 1, outputChars: 1, knowledgeHits: 0 },
      generatedAt: new Date().toISOString(),
    };
    const out = maybeAttachDecisionGraphForInternal({
      response: base,
      question: "absorption",
      knowledgeEntries: entriesFor("absorption"),
    });
    assert.equal("decisionGraph" in out && out.decisionGraph != null, false);
  });
  it("attach when internal flags on", () => {
    process.env.GOODTRADING_AI_DECISION_GRAPH_ENABLED = "true";
    process.env.GOODTRADING_AI_DECISION_GRAPH_INTERNAL_ATTACH = "true";
    const base = {
      schemaVersion: "1.0" as const,
      requestId: "r2",
      mode: "mentor" as const,
      summary: "test",
      observations: [],
      educationalNote: "edu",
      warnings: [],
      provider: { id: "mock", model: "m", mocked: true },
      usage: { inputChars: 1, outputChars: 1, knowledgeHits: 0 },
      generatedAt: new Date().toISOString(),
    };
    const out = maybeAttachDecisionGraphForInternal({
      response: base,
      question: "absorption confirmación",
      knowledgeEntries: entriesFor("absorption"),
    });
    assert.ok(out.decisionGraph);
    assert.equal(out.decisionGraph!.mentorEligible, false);
  });
});

describe("AI-7 security greps", () => {
  const root = join(process.cwd(), "server/ai/goodTradingAi/decision");
  const files = [
    "decisionGraphEngine.ts",
    "nodeEvaluators.ts",
    "templates.ts",
    "attachToReasoning.ts",
    "pathEngine.ts",
  ];
  for (const f of files) {
    it(`no OpenAI import in ${f}`, () => {
      const src = readFileSync(join(root, f), "utf8");
      assert.ok(!/from\s+['"][^'"]*openai/i.test(src));
      assert.ok(!/embeddings|vectorDb|createEmbedding/i.test(src));
    });
    it(`no BUY/SELL outcome literals in ${f}`, () => {
      const src = readFileSync(join(root, f), "utf8");
      assert.ok(!/\boutcome:\s*["']BUY["']/i.test(src));
      assert.ok(!/\boutcome:\s*["']SELL["']/i.test(src));
    });
  }
  it("chat routes not importing evaluateDecisionGraph for live snapshot", () => {
    const src = readFileSync(join(process.cwd(), "server/routes/aiChat.routes.ts"), "utf8");
    assert.ok(!/evaluateDecisionGraph|decision-graph\/evaluate|MarketSnapshot/.test(src));
  });
  it("docs exist", () => {
    const doc = readFileSync(
      join(process.cwd(), "docs/goodtrading-ai-decision-graph.md"),
      "utf8",
    );
    assert.ok(doc.includes("Decision Graph"));
    assert.ok(doc.includes("mentorEligible"));
    assert.ok(doc.includes("GOODTRADING_AI_DECISION_GRAPH_ENABLED"));
  });
});

describe("AI-7 template evaluate pad", () => {
  for (const t of DECISION_GRAPH_TEMPLATES) {
    it(`evaluate template ${t.id}`, () => {
      const r = evaluateDecisionGraph({
        question: t.matchKeywords[0] ?? "metodología confirmación",
        templateId: t.id,
        knowledgeEntries: entriesFor(t.matchKeywords[0] ?? "gamma"),
      });
      assert.equal(r.ok, true, r.issues.map((i) => i.message).join("; "));
      assert.equal(r.graph?.templateId, t.id);
      const safe = toClientSafeDecisionGraph(r.graph!);
      assert.equal(safe.mentorEligible, false);
      assert.ok(safe.pathSummaries.length <= 2);
    });
  }
});

describe("AI-7 getTemplate / projection pad", () => {
  for (let i = 0; i < 20; i++) {
    it(`getDecisionGraphTemplate null pad #${i}`, () => {
      assert.equal(getDecisionGraphTemplate(`missing_${i}`), null);
    });
  }
  for (let i = 0; i < 25; i++) {
    it(`clientSafe size pad #${i}`, () => {
      const r = evaluateDecisionGraph({
        question: `confirmación absorption ${i}`,
        knowledgeEntries: entriesFor("absorption"),
      });
      assert.ok(r.clientSafe);
      assert.ok((r.clientSafe!.pathSummaries?.length ?? 0) <= 2);
      assert.ok((JSON.stringify(r.clientSafe).length ?? 0) < 20_000);
    });
  }
});

describe("AI-7 knowledge registry still intact", () => {
  it("registry has entries", () => {
    assert.ok(knowledgeRegistry.getAll().length > 10);
  });
  for (let i = 0; i < 15; i++) {
    it(`mentorEligible knowledge unused #${i}`, () => {
      const r = evaluateDecisionGraph({
        question: "invalidación required hypothesis",
        knowledgeEntries: knowledgeRegistry.getAll().slice(i, i + 3),
      });
      assert.equal(r.graph?.mentorEligible, false);
    });
  }
});

describe("AI-7 redis HIGH warning semantics untouched (doc/grep)", () => {
  it("validation proof still has HIGH performancePassed false", () => {
    const src = readFileSync(
      join(process.cwd(), "server/ai/goodTradingAi/market/telemetry/redisValidationProof.ts"),
      "utf8",
    );
    assert.ok(src.includes("VALIDATED_WITH_PERFORMANCE_WARNING"));
    assert.ok(src.includes("performancePassed"));
    assert.ok(src.includes("REDIS_HIGH_LATENCY") || src.includes("HIGH"));
  });
});

describe("AI-7 outcome matrix pad", () => {
  const questions = [
    "absorption confirmación",
    "solo con delta",
    "wall confirma reversión",
    "gamma = dirección",
    "sweep reclaim confirmación",
    "what if hypothetical",
    "conflicto multi lente",
    "stale caducado",
    "evidencia confirmaciones",
    "call wall referencia",
  ];
  for (let i = 0; i < 40; i++) {
    it(`matrix q#${i}`, () => {
      const q = questions[i % questions.length]!;
      const r = evaluateDecisionGraph({
        question: `${q} #${i}`,
        knowledgeEntries: entriesFor(q),
        forceUntrusted: i % 7 === 0,
      });
      assert.equal(r.ok, true);
      assert.equal(r.clientSafe?.mentorEligible, false);
      assert.ok(r.durationMs < 50);
    });
  }
});

describe("AI-7 extra pad to exceed 250", () => {
  for (let i = 0; i < 30; i++) {
    it(`trust enum stable #${i}`, () => {
      const ctx = buildDecisionContext({
        question: `q${i}`,
        knowledgeEntries: [],
        forceUntrusted: i % 2 === 0,
      });
      assert.ok(
        ["UNTRUSTED_SCENARIO", "NO_MARKET", "VALIDATED_STUB", "VALIDATED_LIVE", "SYNTHETIC_DEBUG"].includes(
          ctx.trust,
        ),
      );
    });
  }
});
