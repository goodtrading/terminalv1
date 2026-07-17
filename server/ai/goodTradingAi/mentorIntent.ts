import { normalizeQuery } from "./knowledge/retrieve";

export type MentorIntent =
  | "definition"
  | "validation"
  | "comparison"
  | "invalidation"
  | "example"
  | "setup"
  | "current_market"
  | "direct_recommendation"
  | "prompt_injection"
  | "unknown";

const CURRENT_MARKET_PATTERNS = [
  "mejor crypto hoy",
  "mejor criptomoneda hoy",
  "que comprar hoy",
  "qué comprar hoy",
  "analiza el mercado",
  "analiza btc ahora",
  "precio de btc",
  "precio actual",
  "mercado ahora",
  "right now",
  "buy now",
  "señal ahora",
  "senal ahora",
  "trade now",
  "analisis en vivo",
  "análisis en vivo",
  "live market",
  "current market",
];

const DIRECT_REC_PATTERNS = [
  "debo comprar",
  "debo vender",
  "compro o vendo",
  "compra o vende",
  "dame una entrada",
  "entry ahora",
  "long o short",
  "should i buy",
  "should i sell",
  "recomendame un trade",
  "recomiendame un trade",
  "tell me what to buy",
];

const INJECTION_PATTERNS = [
  "ignore previous",
  "ignore all",
  "ignora las reglas",
  "ignora reglas",
  "ignora instrucciones",
  "system prompt",
  "jailbreak",
  "act as",
  "actua como",
  "olvida tus reglas",
  "sin restricciones",
  "unrestricted",
  "reveal your prompt",
  "muestra tu prompt",
];

export function detectMentorIntent(message: string): MentorIntent {
  const q = normalizeQuery(message);
  if (!q) return "unknown";

  for (const p of INJECTION_PATTERNS) {
    if (q.includes(normalizeQuery(p))) return "prompt_injection";
  }
  for (const p of CURRENT_MARKET_PATTERNS) {
    if (q.includes(normalizeQuery(p))) return "current_market";
  }
  for (const p of DIRECT_REC_PATTERNS) {
    if (q.includes(normalizeQuery(p))) return "direct_recommendation";
  }

  if (/\b(setup|playbook|escenario educativo|secuencia)\b/.test(q)) return "setup";
  if (/\b(ejemplo|case|caso)\b/.test(q)) return "example";
  if (/\b(invalid|invalidacion|cuando falla|cuando muere)\b/.test(q)) return "invalidation";
  if (/\b(vs|versus|diferencia|compar|relacion entre)\b/.test(q)) return "comparison";
  if (/\b(valida|correcto|tiene sentido|puedo usar)\b/.test(q)) return "validation";
  if (/\b(que es|qué es|defin|significa|what is|explain|explica)\b/.test(q)) return "definition";

  return "unknown";
}
