import { normalizeQuery } from "../knowledge/retrieve";

export function normalizeCurationText(text: string): string {
  return normalizeQuery(text);
}

export function tokenSet(text: string): Set<string> {
  return new Set(
    normalizeCurationText(text)
      .split(" ")
      .filter((t) => t.length >= 3),
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of Array.from(a)) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

export function round01(n: number): number {
  return Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;
}

export function clamp01(n: number): number {
  return round01(n);
}

/** Stable fingerprint buckets for near-O(n) duplicate candidate generation. */
export function fingerprintBuckets(tokens: Set<string>, bucketCount = 64): string[] {
  const sorted = Array.from(tokens).sort();
  if (!sorted.length) return ["__empty__"];
  const buckets = new Set<string>();
  for (const t of sorted.slice(0, 12)) {
    let h = 0;
    for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
    buckets.add(`b${h % bucketCount}`);
  }
  // Also bucket by first char of top tokens for locality
  for (const t of sorted.slice(0, 4)) {
    buckets.add(`c${t.slice(0, 2)}`);
  }
  return Array.from(buckets);
}

export function allRelationIds(entry: {
  supports: string[];
  dependsOn: string[];
  requires: string[];
  invalidates: string[];
  contradicts: string[];
  relatedTo: string[];
  parentConcept: string[];
  childConcept: string[];
  relatedEntryIds: string[];
  prerequisites: string[];
}): string[] {
  return [
    ...entry.supports,
    ...entry.dependsOn,
    ...entry.requires,
    ...entry.invalidates,
    ...entry.contradicts,
    ...entry.relatedTo,
    ...entry.parentConcept,
    ...entry.childConcept,
    ...entry.relatedEntryIds,
    ...entry.prerequisites,
  ];
}
