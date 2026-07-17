import { knowledgeRegistry } from "./registry";
import type { GoodTradingKnowledgeEntry, KnowledgeKind } from "./types";

export type KnowledgeRetrievalRequest = {
  query: string;
  maxResults?: number;
  /** Prefer constitution principles when scores are close. */
  preferConstitution?: boolean;
};

export type KnowledgeRetrievalMatch = {
  entry: GoodTradingKnowledgeEntry;
  score: number;
  reasons: string[];
};

export type KnowledgeCoverage = "high" | "medium" | "limited";

export type KnowledgeRetrievalResult = {
  matches: KnowledgeRetrievalMatch[];
  coverage: KnowledgeCoverage;
  normalizedQuery: string;
};

const STOPWORDS = new Set([
  "a", "al", "de", "del", "la", "las", "el", "los", "un", "una", "unos", "unas",
  "y", "o", "u", "en", "con", "por", "para", "que", "qué", "como", "cómo", "cual",
  "cuál", "es", "son", "se", "su", "sus", "me", "te", "mi", "tu", "the", "and",
  "or", "of", "to", "in", "on", "for", "is", "are", "what", "how", "why", "when",
  "where", "a", "an", "vs", "versus", "sobre", "entre", "desde", "hasta", "muy",
  "mas", "más", "menos", "solo", "sólo", "tambien", "también", "hay", "tiene",
  "hacer", "puede", "puedo", "quiero", "necesito", "explica", "explicame",
  "explícame", "dime", "definicion", "definición", "mean", "means",
]);

const KIND_WEIGHT: Record<KnowledgeKind, number> = {
  PRINCIPLE: 6,
  RULE: 5,
  SETUP: 4,
  DEFINITION: 3,
  HEURISTIC: 2,
  EXAMPLE: 1,
  ANTI_PATTERN: 3,
};

export function normalizeQuery(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(normalized: string): string[] {
  return normalized.split(" ").filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/**
 * Deterministic local retrieval — no embeddings / vector DB.
 */
export function retrieveKnowledge(req: KnowledgeRetrievalRequest): KnowledgeRetrievalResult {
  const maxResults = Math.min(8, Math.max(1, req.maxResults ?? 6));
  const preferConstitution = req.preferConstitution !== false;
  const normalizedQuery = normalizeQuery(req.query);
  const toks = tokens(normalizedQuery);

  if (!normalizedQuery) {
    return { matches: [], coverage: "limited", normalizedQuery };
  }

  const scored: KnowledgeRetrievalMatch[] = [];

  for (const entry of knowledgeRegistry.getAll()) {
    let score = 0;
    const reasons: string[] = [];

    for (const concept of entry.concepts) {
      const c = normalizeQuery(concept);
      if (!c) continue;
      if (normalizedQuery.includes(c)) {
        const w = c.length >= 8 ? 8 : c.length >= 5 ? 6 : 4;
        score += w;
        reasons.push(`concept:${c}`);
      }
    }

    for (const alias of entry.aliases) {
      const a = normalizeQuery(alias);
      if (!a) continue;
      if (normalizedQuery.includes(a)) {
        score += a.length >= 8 ? 7 : 5;
        reasons.push(`alias:${a}`);
      }
    }

    const title = normalizeQuery(entry.title);
    if (title && normalizedQuery.includes(title)) {
      score += 5;
      reasons.push("title");
    } else {
      // partial title token hits
      for (const tt of tokens(title)) {
        if (toks.includes(tt)) {
          score += 1;
          reasons.push(`titleToken:${tt}`);
        }
      }
    }

    // category keyword hints
    const catHints: Record<string, string[]> = {
      constitution: ["constitucion", "principio", "principios", "metodologia", "método", "method"],
      gamma: ["gamma", "gex", "flip", "dealer", "call wall", "put wall"],
      liquidity: ["liquidez", "liquidity", "wall", "pulling", "stacking", "spoofing", "sweep"],
      order_flow: ["order flow", "orderflow", "absorption", "absorcion", "footprint", "dom", "tape"],
      delta_cvd: ["delta", "cvd"],
      open_interest: ["oi", "open interest", "interes abierto"],
      execution: ["ejecucion", "execution", "entrada", "orden"],
      risk: ["riesgo", "risk", "sizing", "invalidacion", "invalidation"],
      setups: ["setup", "escenario", "playbook"],
      teaching: ["como preguntar", "trampa", "mentor"],
      glossary: ["glosario", "significa", "que es"],
      cross: ["combinacion", "integracion", "junto", "relacion"],
    };
    for (const hint of catHints[entry.category] ?? []) {
      if (normalizedQuery.includes(normalizeQuery(hint))) {
        score += 2;
        reasons.push(`categoryHint:${entry.category}`);
        break;
      }
    }

    if (score <= 0) continue;

    score += KIND_WEIGHT[entry.kind] ?? 0;
    if (preferConstitution && entry.category === "constitution") {
      score += 3;
      reasons.push("constitutionBoost");
    }

    // multi-match bonus
    const uniqueReasons = new Set(reasons.map((r) => r.split(":")[0]));
    if (uniqueReasons.size >= 3) score += 3;
    else if (uniqueReasons.size >= 2) score += 1;

    // Multi-lens queries boost cross / integration entries
    const wantsGamma = /\bgamma\b|\bgex\b|\bflip\b/.test(normalizedQuery);
    const wantsLiq = /\bliquidez\b|\bliquidity\b|\bwall\b|\bpulling\b/.test(normalizedQuery);
    const wantsOf = /\border ?flow\b|\babsorption\b|\bdom\b|\bfootprint\b/.test(normalizedQuery);
    const lensCount = [wantsGamma, wantsLiq, wantsOf].filter(Boolean).length;
    if (lensCount >= 2 && (entry.category === "cross" || entry.id.includes("multi_lens") || entry.id.includes("not_spot"))) {
      score += 10;
      reasons.push("multiLensBoost");
    }

    scored.push({ entry, score, reasons: [...new Set(reasons)].sort() });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // constitution before heuristics on ties
    if (preferConstitution) {
      const ac = a.entry.category === "constitution" ? 0 : 1;
      const bc = b.entry.category === "constitution" ? 0 : 1;
      if (ac !== bc) return ac - bc;
    }
    const kindDelta = (KIND_WEIGHT[b.entry.kind] ?? 0) - (KIND_WEIGHT[a.entry.kind] ?? 0);
    if (kindDelta !== 0) return kindDelta;
    return a.entry.id.localeCompare(b.entry.id);
  });

  // Expand with related high-priority constitution if top match is heuristic-only and constitution exists in pool
  const top = scored.slice(0, maxResults);

  // Pull related constitution entries for top matches (stable)
  const extra: KnowledgeRetrievalMatch[] = [];
  if (preferConstitution) {
    for (const m of top) {
      for (const rid of m.entry.relatedEntryIds) {
        const rel = knowledgeRegistry.getById(rid);
        if (!rel || rel.category !== "constitution") continue;
        if (top.some((t) => t.entry.id === rel.id) || extra.some((t) => t.entry.id === rel.id)) continue;
        extra.push({
          entry: rel,
          score: m.score - 1,
          reasons: [`relatedFrom:${m.entry.id}`],
        });
      }
    }
  }

  const merged = [...top, ...extra]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.entry.id.localeCompare(b.entry.id);
    })
    .filter((m, i, arr) => arr.findIndex((x) => x.entry.id === m.entry.id) === i)
    .slice(0, maxResults);

  const best = merged[0]?.score ?? 0;
  let coverage: KnowledgeCoverage = "limited";
  if (merged.length >= 3 && best >= 16) coverage = "high";
  else if (merged.length >= 1 && best >= 8) coverage = "medium";

  return { matches: merged, coverage, normalizedQuery };
}
