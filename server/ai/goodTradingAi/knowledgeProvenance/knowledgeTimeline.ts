/**
 * Knowledge Timeline — per-rule event timelines. Never delete history.
 */
import type { JustificationEvent, StableRuleId } from "@shared/goodTradingAiKnowledgeProvenance";

export function buildPerRuleTimelines(
  events: JustificationEvent[],
): Record<string, JustificationEvent[]> {
  const map: Record<string, JustificationEvent[]> = {};
  for (const e of events) {
    const list = map[e.stableRuleId] ?? [];
    list.push(e);
    map[e.stableRuleId] = list;
  }
  for (const id of Object.keys(map)) {
    map[id] = (map[id] ?? []).sort((a, b) => a.atMs - b.atMs).slice(0, 500);
  }
  return map;
}

export function timelineForRule(
  events: JustificationEvent[],
  ruleId: StableRuleId,
): JustificationEvent[] {
  return events.filter((e) => e.stableRuleId === ruleId).sort((a, b) => a.atMs - b.atMs);
}