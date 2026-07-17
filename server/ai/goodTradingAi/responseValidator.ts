import type {
  GoodTradingAIChatResponse,
  GoodTradingAIKnowledgeReference,
} from "@shared/goodTradingAi";

export type ValidationIssue = { code: string; message: string };

const BANNED: { re: RegExp; replace: string }[] = [
  { re: /\bcompra ahora\b/gi, replace: "[recomendación directa bloqueada]" },
  { re: /\bvende ahora\b/gi, replace: "[recomendación directa bloqueada]" },
  { re: /\bbuy now\b/gi, replace: "[direct recommendation blocked]" },
  { re: /\bsell now\b/gi, replace: "[direct recommendation blocked]" },
  {
    re: /\bwall confirma reversi[oó]n\b/gi,
    replace: "una wall no confirma reversión por sí sola",
  },
  {
    re: /\bgamma negativa\s*=\s*vender\b/gi,
    replace: "gamma negativa no implica vender automáticamente",
  },
  {
    re: /\bgamma positiva\s*=\s*comprar\b/gi,
    replace: "gamma positiva no implica comprar automáticamente",
  },
  {
    re: /\ban[aá]lisis (del )?mercado en vivo\b/gi,
    replace: "contenido educativo sin mercado en vivo",
  },
];

const LIVE_CLAIM =
  /\b(est[aá] subiendo ahora|precio actual de|btc est[aá] en|miro tu (dom|bookmap|heatmap)|seg[uú]n el bookmap en vivo)\b/i;

/**
 * Deterministic post-provider validator / sanitizer.
 */
export function validateMentorResponse(
  response: GoodTradingAIChatResponse,
): { ok: boolean; response: GoodTradingAIChatResponse; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  let summary = response.summary ?? "";
  let educationalNote = response.educationalNote ?? "";
  const warnings = [...(response.warnings ?? [])];
  let observations = [...(response.observations ?? [])];
  let refs: GoodTradingAIKnowledgeReference[] = [...(response.knowledgeReferences ?? [])];

  if (!summary.trim()) {
    issues.push({ code: "EMPTY_SUMMARY", message: "summary empty" });
    summary =
      "No pude construir un resumen educativo válido. Reformulá la pregunta sobre un concepto de la metodología.";
  }

  if (summary.length > 4000) {
    summary = summary.slice(0, 3990) + "…";
    issues.push({ code: "SUMMARY_TRUNCATED", message: "summary truncated" });
  }

  for (const ban of BANNED) {
    if (ban.re.test(summary)) {
      summary = summary.replace(ban.re, ban.replace);
      issues.push({ code: "BANNED_PHRASE", message: ban.replace });
    }
    ban.re.lastIndex = 0;
  }

  if (LIVE_CLAIM.test(summary) || LIVE_CLAIM.test(educationalNote)) {
    summary =
      "Esta respuesta se corrigió: Modo Mentor no realiza lecturas ni afirmaciones sobre el mercado en vivo. " +
      summary.replace(LIVE_CLAIM, "[afirmación en vivo removida]");
    warnings.push("Se bloqueó una afirmación incompatible con el modo educativo (sin mercado en vivo).");
    issues.push({ code: "LIVE_MARKET_CLAIM", message: "live claim blocked" });
  }

  // unique refs
  const seenRef = new Set<string>();
  refs = refs.filter((r) => {
    if (!r?.id || seenRef.has(r.id)) return false;
    seenRef.add(r.id);
    return true;
  });

  // coverage coherence: if limited and no obs, ensure warning
  const coverage = response.coverage ?? "limited";
  if (coverage !== "limited" && observations.length === 0) {
    issues.push({ code: "COVERAGE_OBS", message: "coverage without observations" });
  }
  if (observations.length > 0 && refs.length === 0) {
    // synthesize refs from observations ids if missing
    refs = observations.map((o) => ({
      id: o.id,
      title: o.title,
      kind: String(o.kind).toUpperCase(),
      category: "unknown",
    }));
    issues.push({ code: "REFS_SYNTH", message: "refs synthesized from observations" });
  }

  const mandatory = [
    "GoodTrading AI Modo Mentor — contenido educativo únicamente.",
    "Sin lectura de mercado en vivo, Bookmap, DOM, heatmap, gamma/orderflow live ni ejecución automática.",
  ];
  for (const m of mandatory) {
    if (!warnings.some((w) => w.includes("educativo") || w.includes("mercado en vivo") || w === m)) {
      // ensure at least educational warnings present
    }
  }
  for (const m of mandatory) {
    if (!warnings.includes(m)) warnings.unshift(m);
  }

  // dedupe warnings
  const warnOut: string[] = [];
  const ws = new Set<string>();
  for (const w of warnings) {
    const t = w.trim();
    if (!t || ws.has(t)) continue;
    ws.add(t);
    warnOut.push(t);
  }

  if (!educationalNote.trim()) {
    educationalNote =
      "Respuesta educativa de Modo Mentor. No es asesoramiento financiero personalizado ni un análisis del mercado en vivo.";
  }

  const out: GoodTradingAIChatResponse = {
    ...response,
    summary: summary.trim(),
    educationalNote: educationalNote.trim(),
    warnings: warnOut.slice(0, 20),
    observations: observations.slice(0, 20),
    knowledgeReferences: refs.slice(0, 20),
    coverage,
  };

  const ok =
    out.summary.length > 0 &&
    out.educationalNote.length > 0 &&
    out.warnings.length > 0 &&
    !LIVE_CLAIM.test(out.summary);

  return { ok, response: out, issues };
}
