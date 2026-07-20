import type { KnowledgeProposalKind } from "@shared/goodTradingAiExtractor";
import { normalizeExtractorText, type TranscriptSegment } from "./transcriptParser";

export type ExtractedCandidate = {
  segmentIndex: number;
  kind: KnowledgeProposalKind;
  title: string;
  statement: string;
  explanation: string;
  concepts: string[];
  aliases: string[];
  categoryHint?: string;
  sourceExcerpt: string;
  signals: string[];
};

const KIND_PATTERNS: Array<{
  kind: KnowledgeProposalKind;
  re: RegExp;
  signal: string;
}> = [
  { kind: "ANTI_PATTERN", re: /\b(anti[- ]?patron|nunca hagas|error tipico|trampa comun|no confundir|mal interpret)\b/i, signal: "anti_pattern" },
  { kind: "SETUP", re: /\b(setup|playbook|secuencia educativa|si .+ entonces .+ y )\b/i, signal: "setup" },
  // Avoid bare "contexto antes" — that phrase often appears inside RULE statements.
  { kind: "PRINCIPLE", re: /\b(principio|siempre prioriz|hipotesis no certeza|regla constitucional)\b/i, signal: "principle" },
  { kind: "DEFINITION", re: /\b(que es|definicion|se define como|significa que)\b/i, signal: "definition" },
  { kind: "EXAMPLE", re: /\b(ejemplo|por ejemplo|caso tipico|caso educativo)\b/i, signal: "example" },
  { kind: "HEURISTIC", re: /\b(heuristica|suele|a menudo|puede indicar|tendencia a|ojo con)\b/i, signal: "heuristic" },
  { kind: "RULE", re: /\b(regla|siempre|nunca|debe|no debe|sin invalidacion|si .+, entonces)\b/i, signal: "rule" },
];

const CONCEPT_LEXICON: Array<{ concept: string; aliases: string[]; category: string }> = [
  { concept: "gamma", aliases: ["gamma", "gex", "flip", "global flip", "local flip"], category: "gamma" },
  { concept: "absorption", aliases: ["absorption", "absorcion", "pasivo"], category: "order_flow" },
  { concept: "delta", aliases: ["delta", "cvd", "cumulative delta"], category: "delta_cvd" },
  { concept: "liquidity", aliases: ["liquidez", "liquidity", "wall", "spoofing", "sweep", "reclaim"], category: "liquidity" },
  { concept: "order_flow", aliases: ["order flow", "orderflow", "agresivo", "acceptance", "rejection"], category: "order_flow" },
  { concept: "open_interest", aliases: ["open interest", "oi", "interes abierto"], category: "open_interest" },
  { concept: "risk", aliases: ["riesgo", "invalidacion", "invalidación", "sizing"], category: "risk" },
  { concept: "execution", aliases: ["ejecucion", "ejecución", "entrada", "salida"], category: "execution" },
];

function titleFromStatement(statement: string, kind: KnowledgeProposalKind): string {
  const base = statement.replace(/\s+/g, " ").trim();
  const cut = base.length > 72 ? `${base.slice(0, 69)}…` : base;
  return cut || `${kind} candidata`;
}

function detectConcepts(normalized: string): { concepts: string[]; aliases: string[]; categoryHint?: string } {
  const concepts: string[] = [];
  const aliases: string[] = [];
  let categoryHint: string | undefined;
  for (const row of CONCEPT_LEXICON) {
    if (row.aliases.some((a) => normalized.includes(a.replace(/\s+/g, " ")))) {
      concepts.push(row.concept);
      aliases.push(...row.aliases.filter((a) => normalized.includes(a)).slice(0, 3));
      categoryHint = categoryHint ?? row.category;
    }
  }
  return {
    concepts: Array.from(new Set(concepts)).slice(0, 8),
    aliases: Array.from(new Set(aliases)).slice(0, 8),
    categoryHint,
  };
}

function classifyKind(normalized: string, raw: string): { kind: KnowledgeProposalKind; signals: string[] } {
  const signals: string[] = [];
  for (const p of KIND_PATTERNS) {
    if (p.re.test(normalized) || p.re.test(raw)) {
      signals.push(p.signal);
      return { kind: p.kind, signals };
    }
  }
  // Soft fallback: methodological claims without marker → HEURISTIC
  if (/\b(gamma|flip|absorption|wall|delta|cvd|oi|liquidez)\b/i.test(normalized)) {
    signals.push("concept_heuristic_fallback");
    return { kind: "HEURISTIC", signals };
  }
  signals.push("default_rule");
  return { kind: "RULE", signals };
}

function looksLikeKnowledge(normalized: string): boolean {
  if (normalized.length < 24) return false;
  // Skip pure chitchat / logistics
  if (/\b(hola|buenas|gracias|microfono|zoom|link|discord|mañana nos vemos)\b/.test(normalized)) {
    return false;
  }
  const hasMethod =
    /\b(gamma|flip|absorption|wall|delta|cvd|oi|liquidez|spoofing|spoof|order flow|invalidacion|invalid|riesgo|setup|regla|principio|heuristica|nunca|siempre|contexto|hipotesis|acceptance|rejection|reclaim|sweep|sizing|pulling)\b/.test(
      normalized,
    );
  const hasNormative = /\b(siempre|nunca|debe|no debe|si |entonces|evitar|prioridad|confirma|confirmacion|invalida)\b/.test(
    normalized,
  );
  return hasMethod || hasNormative;
}

/**
 * Deterministic candidate extraction from transcript segments.
 */
export function extractKnowledgeCandidates(segments: TranscriptSegment[]): ExtractedCandidate[] {
  const out: ExtractedCandidate[] = [];
  for (const seg of segments) {
    if (!looksLikeKnowledge(seg.normalized)) continue;
    const { kind, signals } = classifyKind(seg.normalized, seg.text);
    const { concepts, aliases, categoryHint } = detectConcepts(seg.normalized);
    const statement = seg.text.replace(/\s+/g, " ").trim().slice(0, 800);
    if (statement.length < 20) continue;
    out.push({
      segmentIndex: seg.index,
      kind,
      title: titleFromStatement(statement, kind),
      statement,
      explanation: `Extraído de segmento #${seg.index + 1}. Revisar antes de incorporar al Brain.`,
      concepts,
      aliases,
      categoryHint,
      sourceExcerpt: statement.slice(0, 500),
      signals,
    });
  }
  return out.slice(0, 80);
}

/** Exposed for tests — same accent-folding as the extract pipeline. */
export function classifyProposalKind(text: string): KnowledgeProposalKind {
  return classifyKind(normalizeExtractorText(text), text).kind;
}
