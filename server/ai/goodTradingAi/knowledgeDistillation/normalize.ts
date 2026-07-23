/**
 * Structural token normalization for rule clustering — no NLP/embeddings.
 */
import type { EvidenceLens } from "@shared/goodTradingAiCriticalCalibration";
import { ALL_EVIDENCE_LENSES } from "@shared/goodTradingAiCriticalCalibration";

const LENS_ALIASES: Record<string, EvidenceLens> = {
  absorcion: "ABSORPTION",
  absorption: "ABSORPTION",
  delta: "DELTA",
  cvd: "CVD",
  gamma: "GAMMA",
  dealer: "DEALER",
  dealers: "DEALER",
  flip: "FLIP",
  liquidez: "LIQUIDITY",
  liquidity: "LIQUIDITY",
  spoof: "SPOOFING",
  spoofing: "SPOOFING",
  footprint: "FOOTPRINT",
  oi: "OI",
  volatilidad: "VOLATILITY",
  volatility: "VOLATILITY",
  acceptance: "ACCEPTANCE",
  aceptacion: "ACCEPTANCE",
  rejection: "REJECTION",
  rechazo: "REJECTION",
  invalidacion: "INVALIDATION",
  invalidation: "INVALIDATION",
  staleness: "STALENESS",
  conflicts: "CONFLICTS",
  confidence: "CONFIDENCE",
  dataquality: "DATA_QUALITY",
};

const PRIORITY_VERBS = [
  "pesa mas",
  "pesa más",
  "weighs more",
  "priority",
  "prioritize",
  "prioriza",
  "over",
  "antes que",
  ">",
];

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

export function normalizeText(raw: string): string {
  return stripAccents(raw)
    .toLowerCase()
    .replace(/[^a-z0-9\s>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractLensesFromText(raw: string): EvidenceLens[] {
  const n = normalizeText(raw);
  const found = new Set<EvidenceLens>();
  for (const [alias, lens] of Object.entries(LENS_ALIASES)) {
    if (new RegExp(`\\b${alias}\\b`, "i").test(n) || n.includes(alias)) found.add(lens);
  }
  for (const lens of ALL_EVIDENCE_LENSES) {
    if (n.includes(lens.toLowerCase().replace(/_/g, " ")) || n.includes(lens.toLowerCase())) {
      found.add(lens);
    }
  }
  return [...found].slice(0, 8);
}

/** Build a structural concept key: sorted lenses + priority pattern tokens. */
export function conceptKeyFromText(raw: string, lenses: EvidenceLens[]): string {
  const n = normalizeText(raw);
  const lensPart = [...lenses].sort().join("+") || "CONTEXT";
  const hasPriority = PRIORITY_VERBS.some((v) => n.includes(normalizeText(v)));
  const tokens = n
    .split(" ")
    .filter((t) => t.length >= 4)
    .filter((t) => !["esta", "este", "para", "como", "when", "with", "that", "this", "from", "have"].includes(t))
    .slice(0, 8);
  const core = tokens.slice(0, 5).join("_") || "rule";
  return `${lensPart}|${hasPriority ? "PRIO" : "STMT"}|${core}`.slice(0, 160);
}

export function tokenOverlap(a: string, b: string): number {
  const ta = new Set(normalizeText(a).split(" ").filter((x) => x.length >= 3));
  const tb = new Set(normalizeText(b).split(" ").filter((x) => x.length >= 3));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}