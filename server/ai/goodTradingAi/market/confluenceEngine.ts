import type {
  ConfluenceSnapshot,
  EvidenceItem,
  MarketProviderId,
  SignalDirection,
} from "@shared/goodTradingAiMarket";
import { evidenceDirectionBias } from "./snapshotEvidence";
import type { MarketProviderBundle, ProviderLensInput } from "./snapshotContracts";

function dirOf(lens?: ProviderLensInput): SignalDirection | null {
  return lens?.direction ?? null;
}

/**
 * Confluence across normalized lenses — educational alignment, not a trade signal.
 */
export function computeConfluence(
  bundle: MarketProviderBundle,
  evidence: EvidenceItem[],
): ConfluenceSnapshot {
  const lenses: Array<{ id: MarketProviderId; dir: SignalDirection }> = [];
  const pairs: Array<[MarketProviderId, ProviderLensInput | undefined]> = [
    ["gamma", bundle.gamma],
    ["orderFlow", bundle.orderFlow],
    ["liquidity", bundle.liquidity],
    ["openInterest", bundle.openInterest],
    ["footprint", bundle.footprint],
    ["marketStructure", bundle.marketStructure],
  ];
  for (const [id, lens] of pairs) {
    const d = dirOf(lens);
    if (d && d !== "unknown") lenses.push({ id, dir: d });
  }

  const bias = evidenceDirectionBias(evidence);
  const aligned: MarketProviderId[] = [];
  const conflicting: MarketProviderId[] = [];

  if (bias.dominant === "bullish" || bias.dominant === "bearish") {
    for (const l of lenses) {
      if (l.dir === bias.dominant) aligned.push(l.id);
      else if (l.dir === "mixed") {
        /* skip */
      } else if (
        (bias.dominant === "bullish" && l.dir === "bearish") ||
        (bias.dominant === "bearish" && l.dir === "bullish")
      ) {
        conflicting.push(l.id);
      } else if (l.dir === "neutral") {
        /* neutral doesn't conflict hard */
      } else {
        conflicting.push(l.id);
      }
    }
  } else if (bias.dominant === "mixed") {
    for (const l of lenses) {
      if (l.dir === "bullish" || l.dir === "bearish") conflicting.push(l.id);
      else aligned.push(l.id);
    }
  } else {
    for (const l of lenses) aligned.push(l.id);
  }

  const n = Math.max(1, lenses.length);
  const alignPct = aligned.length / n;
  const conflictPct = conflicting.length / n;
  let score = Math.round(Math.max(0, Math.min(100, alignPct * 85 - conflictPct * 55 + 15)));
  if (bias.dominant === "unknown") score = Math.min(score, 40);
  if (bias.dominant === "mixed") score = Math.min(score, 45);

  const summary =
    conflicting.length === 0
      ? `Confluencia ${bias.dominant}: ${aligned.length}/${n} lentes alineadas (educativo, no señal).`
      : `Confluencia parcial (${bias.dominant}): ${aligned.length} alineadas, ${conflicting.length} en tensión — priorizar contexto e invalidación.`;

  return {
    score,
    alignedProviders: Array.from(new Set(aligned)).slice(0, 12),
    conflictingProviders: Array.from(new Set(conflicting)).slice(0, 12),
    summary: summary.slice(0, 320),
    direction: bias.dominant,
  };
}
