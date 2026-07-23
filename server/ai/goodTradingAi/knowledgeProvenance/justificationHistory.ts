/**
 * Justification History — append-only events. Never overwrite.
 */
import type { DistilledObservation } from "@shared/goodTradingAiKnowledgeDistillation";
import type {
  JustificationEvent,
  JustificationEventKind,
  ProvenanceRecord,
} from "@shared/goodTradingAiKnowledgeProvenance";
import { justificationEventSchema } from "@shared/goodTradingAiKnowledgeProvenance";
import { buildStableRuleId, inferRuleKind } from "../knowledgeEvolution/ruleIds";

function eventId(ruleId: string, kind: JustificationEventKind, version: number, atMs: number): string {
  return `je_${ruleId}_${kind}_v${version}_${atMs}`.slice(0, 96);
}

function baseRationale(text: string, kind: JustificationEventKind) {
  return {
    rationale: `${kind}: ${text.slice(0, 700)}`.slice(0, 800) || `${kind} event recorded`,
    supportingEvidence: [] as string[],
    opposingEvidence: [] as string[],
    conditions: [] as string[],
    assumptions: [] as string[],
    uncertainty: "MEDIUM" as const,
  };
}

export function appendJustificationEvents(input: {
  previous: JustificationEvent[];
  registry: ProvenanceRecord[];
  observations?: DistilledObservation[];
  createdBy?: string;
}): JustificationEvent[] {
  const createdBy = input.createdBy ?? "system:provenance";
  const existingIds = new Set(input.previous.map((e) => e.id));
  const out = [...input.previous];
  const versionByRule = new Map<string, number>();
  for (const e of out) {
    versionByRule.set(e.stableRuleId, Math.max(versionByRule.get(e.stableRuleId) ?? 0, e.version));
  }

  const push = (partial: Omit<JustificationEvent, "mentorEligible" | "appendOnly">) => {
    if (existingIds.has(partial.id)) return;
    existingIds.add(partial.id);
    out.push(
      justificationEventSchema.parse({
        ...partial,
        mentorEligible: false,
        appendOnly: true,
      }),
    );
  };

  for (const r of input.registry) {
    const v = 1;
    const id = eventId(r.stableRuleId, "CREATED", v, r.createdAtMs);
    push({
      id,
      stableRuleId: r.stableRuleId,
      kind: "CREATED",
      atMs: r.createdAtMs,
      version: v,
      createdBy: r.createdBy,
      sourceSession: r.sourceSession,
      sourceReview: r.sourceReview,
      sourceProposal: r.sourceProposal,
      rationale: {
        ...baseRationale(`Rule registered from ${r.origin}`, "CREATED"),
        uncertainty: "LOW",
      },
    });
    versionByRule.set(r.stableRuleId, Math.max(versionByRule.get(r.stableRuleId) ?? 0, v));
  }

  for (const o of input.observations ?? []) {
    if (!o.lenses.length) continue;
    const ruleId = buildStableRuleId(o.lenses, inferRuleKind(o.text, o.lenses));
    let kind: JustificationEventKind = "REVIEWED";
    if (o.signals.includes("DISAGREE")) kind = "CHALLENGED";
    else if (o.signals.includes("REVISION")) kind = "REFINED";
    else if (o.signals.includes("NEEDS_CONDITIONS")) kind = "EXCEPTION_ADDED";
    else if (o.signals.includes("NEEDS_MORE_EVIDENCE")) kind = "CHALLENGED";
    else if (o.signals.includes("AGREE")) kind = "REVIEWED";

    const nextVersion = (versionByRule.get(ruleId) ?? 1) + 1;
    const id = eventId(ruleId, kind, nextVersion, o.createdAtMs);
    const rationale = baseRationale(o.text, kind);
    if (o.signals.includes("DISAGREE")) {
      rationale.opposingEvidence = [o.text.slice(0, 240)];
      rationale.uncertainty = "HIGH";
    }
    if (o.signals.includes("AGREE")) {
      rationale.supportingEvidence = [o.text.slice(0, 240)];
      rationale.uncertainty = "LOW";
    }
    if (o.signals.includes("NEEDS_CONDITIONS")) {
      rationale.conditions = [o.text.slice(0, 240)];
      rationale.uncertainty = "MEDIUM";
    }

    push({
      id,
      stableRuleId: ruleId,
      kind,
      atMs: o.createdAtMs,
      version: nextVersion,
      createdBy,
      sourceSession: o.sessionId,
      sourceReview: o.itemId,
      rationale,
    });
    versionByRule.set(ruleId, nextVersion);

    // contradictions: agree+disagree pattern already challenged; mark contradiction when disagree after agree
    if (o.signals.includes("DISAGREE")) {
      const hasAgree = out.some(
        (e) => e.stableRuleId === ruleId && e.kind === "REVIEWED" && e.atMs < o.createdAtMs,
      );
      if (hasAgree) {
        const cv = (versionByRule.get(ruleId) ?? nextVersion) + 1;
        push({
          id: eventId(ruleId, "CONTRADICTION_FOUND", cv, o.createdAtMs + 1),
          stableRuleId: ruleId,
          kind: "CONTRADICTION_FOUND",
          atMs: o.createdAtMs + 1,
          version: cv,
          createdBy,
          sourceSession: o.sessionId,
          rationale: {
            ...baseRationale("Contradiction: prior review vs later challenge", "CONTRADICTION_FOUND"),
            opposingEvidence: [o.text.slice(0, 240)],
            uncertainty: "HIGH",
          },
        });
        versionByRule.set(ruleId, cv);
      }
    }
  }

  return out.sort((a, b) => a.atMs - b.atMs || a.id.localeCompare(b.id)).slice(-10000);
}