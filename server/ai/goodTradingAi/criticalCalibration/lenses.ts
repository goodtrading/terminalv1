import type { EvidenceLens } from "@shared/goodTradingAiCriticalCalibration";

export type LensMeta = { id: EvidenceLens; label: string; narrativeFragment: string; knowledgeKeywords: string[] };

export const ALL_LENSES: LensMeta[] = [
  { id: "GAMMA", label: "Gamma", narrativeFragment: "regimen gamma sintetico", knowledgeKeywords: ["gamma", "gex", "dealer gamma"] },
  { id: "FLIP", label: "Flip", narrativeFragment: "flip de estructura", knowledgeKeywords: ["flip", "cambio de regimen"] },
  { id: "DEALER", label: "Dealer", narrativeFragment: "posicion dealer", knowledgeKeywords: ["dealer", "market maker"] },
  { id: "LIQUIDITY", label: "Liquidity", narrativeFragment: "liquidez visible", knowledgeKeywords: ["liquidity", "liquidez", "wall"] },
  { id: "SPOOFING", label: "Spoofing", narrativeFragment: "spoofing potencial", knowledgeKeywords: ["spoof", "spoofing"] },
  { id: "ABSORPTION", label: "Absorption", narrativeFragment: "absorcion pasiva", knowledgeKeywords: ["absorption", "absorcion"] },
  { id: "DELTA", label: "Delta", narrativeFragment: "delta aislado", knowledgeKeywords: ["delta", "order flow delta"] },
  { id: "CVD", label: "CVD", narrativeFragment: "cvd acumulado", knowledgeKeywords: ["cvd", "cumulative delta"] },
  { id: "FOOTPRINT", label: "Footprint", narrativeFragment: "footprint sintetico", knowledgeKeywords: ["footprint", "imbalance"] },
  { id: "OI", label: "OI", narrativeFragment: "open interest", knowledgeKeywords: ["open interest", "oi"] },
  { id: "VOLATILITY", label: "Volatility", narrativeFragment: "volatilidad contextual", knowledgeKeywords: ["volatility", "volatilidad"] },
  { id: "ACCEPTANCE", label: "Acceptance", narrativeFragment: "aceptacion de nivel", knowledgeKeywords: ["acceptance", "aceptacion"] },
  { id: "REJECTION", label: "Rejection", narrativeFragment: "rechazo de nivel", knowledgeKeywords: ["rejection", "rechazo"] },
  { id: "INVALIDATION", label: "Invalidation", narrativeFragment: "invalidacion metodologica", knowledgeKeywords: ["invalidation", "invalidacion"] },
  { id: "DATA_QUALITY", label: "Data Quality", narrativeFragment: "calidad de datos", knowledgeKeywords: ["data quality", "calidad"] },
  { id: "STALENESS", label: "Staleness", narrativeFragment: "contexto stale", knowledgeKeywords: ["stale", "staleness"] },
  { id: "CONFLICTS", label: "Conflicts", narrativeFragment: "conflicto multi-lente", knowledgeKeywords: ["conflict", "conflicto"] },
  { id: "CONFIDENCE", label: "Confidence", narrativeFragment: "confianza metodologica", knowledgeKeywords: ["confidence", "confianza"] },
];

export function getLensMeta(lens: EvidenceLens): LensMeta {
  return ALL_LENSES.find((l) => l.id === lens) ?? ALL_LENSES[0]!;
}

export function lensNarrativeFragment(lens: EvidenceLens): string {
  return getLensMeta(lens).narrativeFragment;
}

export function lensKnowledgeKeywords(lens: EvidenceLens): string[] {
  return getLensMeta(lens).knowledgeKeywords;
}

export function lensesHintText(lenses: EvidenceLens[]): string {
  return lenses.map((l) => getLensMeta(l).label).join(", ");
}
