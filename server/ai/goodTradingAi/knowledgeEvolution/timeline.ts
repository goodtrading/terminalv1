/**
 * Evolution Timeline — append-only events. Never rewrite history.
 */
import type {
  KeystoneScore,
  ObsoleteRule,
  RegisteredRule,
  RuleHistory,
  RuleStability,
  RuleVolatility,
  TimelineEvent,
} from "@shared/goodTradingAiKnowledgeEvolution";
import { timelineEventSchema } from "@shared/goodTradingAiKnowledgeEvolution";

export function appendTimelineEvents(input: {
  previous: TimelineEvent[];
  rules: RegisteredRule[];
  histories: RuleHistory[];
  stabilities: RuleStability[];
  volatilities: RuleVolatility[];
  keystones: KeystoneScore[];
  obsolete: ObsoleteRule[];
  nowMs?: number;
}): TimelineEvent[] {
  const now = input.nowMs ?? Date.now();
  const existingIds = new Set(input.previous.map((e) => e.id));
  const out = [...input.previous];

  const push = (partial: Omit<TimelineEvent, "mentorEligible">) => {
    if (existingIds.has(partial.id)) return;
    existingIds.add(partial.id);
    out.push(timelineEventSchema.parse({ ...partial, mentorEligible: false }));
  };

  for (const r of input.rules) {
    push({
      id: `ev_created_${r.id}`,
      ruleId: r.id,
      kind: "CREATED",
      atMs: r.createdAtMs,
      detail: `Rule ${r.id} entered registry.`,
    });
  }

  for (const h of input.histories) {
    if (h.disagreementCount > 0) {
      push({
        id: `ev_disagree_${h.ruleId}_${h.disagreementCount}`,
        ruleId: h.ruleId,
        kind: "DISAGREEMENT",
        atMs: h.lastSeenAtMs,
        detail: `Disagreements=${h.disagreementCount}`,
      });
    }
    if (h.exceptionCount > 0) {
      push({
        id: `ev_exc_${h.ruleId}_${h.exceptionCount}`,
        ruleId: h.ruleId,
        kind: "EXCEPTION",
        atMs: h.lastSeenAtMs,
        detail: `Exceptions=${h.exceptionCount}`,
      });
    }
    if (h.revisions > 0) {
      push({
        id: `ev_rev_${h.ruleId}_v${h.currentVersion}`,
        ruleId: h.ruleId,
        kind: "REVISION",
        atMs: h.lastSeenAtMs,
        detail: `Version=${h.currentVersion} revisions=${h.revisions}`,
      });
    }
  }

  for (const s of input.stabilities.filter((x) => x.stabilityScore >= 0.75)) {
    push({
      id: `ev_histab_${s.ruleId}`,
      ruleId: s.ruleId,
      kind: "HIGH_STABILITY",
      atMs: now,
      detail: `stabilityScore=${s.stabilityScore.toFixed(2)}`,
    });
    if (s.stabilityScore >= 0.85) {
      push({
        id: `ev_mature_${s.ruleId}`,
        ruleId: s.ruleId,
        kind: "MATURE",
        atMs: now,
        detail: `Rule considered mature (stability>=0.85).`,
      });
    }
  }

  for (const v of input.volatilities.filter((x) => x.volatilityScore >= 0.6)) {
    push({
      id: `ev_hivol_${v.ruleId}_${Math.round(v.volatilityScore * 100)}`,
      ruleId: v.ruleId,
      kind: "HIGH_VOLATILITY",
      atMs: now,
      detail: `volatilityScore=${v.volatilityScore.toFixed(2)}`,
    });
  }

  for (const k of input.keystones.filter((x) => x.keystoneScore >= 0.55).slice(0, 10)) {
    push({
      id: `ev_key_${k.ruleId}`,
      ruleId: k.ruleId,
      kind: "KEYSTONE_DETECTED",
      atMs: now,
      detail: `keystoneScore=${k.keystoneScore.toFixed(2)} deps=${k.dependencyCount}`,
    });
  }

  for (const o of input.obsolete.slice(0, 20)) {
    push({
      id: `ev_obs_${o.ruleId}_${o.kind}`,
      ruleId: o.ruleId,
      kind: "OBSOLETE_FLAGGED",
      atMs: now,
      detail: `${o.kind}: ${o.detail}`.slice(0, 400),
    });
  }

  return out.sort((a, b) => a.atMs - b.atMs).slice(-5000);
}