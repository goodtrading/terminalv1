/** AI-7 — Priority tiers CRITICAL → LOW */
export type DecisionPriorityTier = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

const RANK: Record<DecisionPriorityTier, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

export function priorityRank(p: DecisionPriorityTier): number {
  return RANK[p];
}

export function maxPriority(
  a: DecisionPriorityTier,
  b: DecisionPriorityTier,
): DecisionPriorityTier {
  return priorityRank(a) >= priorityRank(b) ? a : b;
}

export function sortByPriorityDesc<T extends { priority: DecisionPriorityTier }>(
  items: T[],
): T[] {
  return [...items].sort((x, y) => priorityRank(y.priority) - priorityRank(x.priority));
}
