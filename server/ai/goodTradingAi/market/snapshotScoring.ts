import type {
  ConfluenceSnapshot,
  EvidenceItem,
  RiskItem,
  SnapshotScores,
} from "@shared/goodTradingAiMarket";
import type { MarketProviderBundle } from "./snapshotContracts";
import { riskScore } from "./riskEngine";

function clamp100(n: number): number {
  return Math.round(Math.min(100, Math.max(0, n)));
}

/**
 * Scores 0–100: Market Confidence, Confluence, Risk, Snapshot Quality.
 */
export function computeSnapshotScores(params: {
  bundle: MarketProviderBundle;
  evidence: EvidenceItem[];
  confluence: ConfluenceSnapshot;
  risks: RiskItem[];
}): SnapshotScores {
  const { bundle, evidence, confluence, risks } = params;

  const lenses = [
    bundle.gamma,
    bundle.orderFlow,
    bundle.liquidity,
    bundle.openInterest,
    bundle.footprint,
    bundle.marketStructure,
  ].filter(Boolean);
  const avgConf =
    lenses.length === 0
      ? 0
      : lenses.reduce((s, l) => s + (l!.confidence ?? 0), 0) / lenses.length;
  const avgQuality =
    lenses.length === 0
      ? 0
      : lenses.reduce((s, l) => {
          const q = l!.quality === "high" ? 1 : l!.quality === "medium" ? 0.65 : 0.3;
          return s + q;
        }, 0) / lenses.length;

  const evidenceWeight =
    evidence.length === 0
      ? 0
      : evidence.reduce((s, e) => s + e.weight * e.confidence, 0) / evidence.length;

  const marketConfidence = clamp100(
    avgConf * 55 + evidenceWeight * 25 + (confluence.score / 100) * 20,
  );

  const risk = riskScore(risks);

  const coverage = Math.min(1, lenses.length / 5);
  const conflictPenalty = Math.min(30, confluence.conflictingProviders.length * 8);
  const snapshotQuality = clamp100(
    avgQuality * 40 + coverage * 35 + (confluence.score / 100) * 25 - conflictPenalty - risk * 0.15,
  );

  return {
    marketConfidence,
    confluence: confluence.score,
    risk,
    snapshotQuality,
  };
}
