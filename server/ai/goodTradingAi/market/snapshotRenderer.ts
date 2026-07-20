import type { MarketSnapshot } from "@shared/goodTradingAiMarket";

/**
 * Human-readable renderer for admin debug (never Bookmap/DOM panes).
 */
export function renderMarketSnapshot(snapshot: MarketSnapshot): {
  headline: string;
  sections: Array<{ title: string; body: string }>;
  markdown: string;
} {
  const headline = `${snapshot.symbol} · régimen ${snapshot.marketRegime.label} · conf ${snapshot.scores.marketConfidence}/100 · calidad ${snapshot.scores.snapshotQuality}/100`;

  const sections = [
    {
      title: "Régimen",
      body: `${snapshot.marketRegime.summary} (${snapshot.marketRegime.direction}/${snapshot.marketRegime.strength})`,
    },
    {
      title: "Precio (contexto)",
      body: snapshot.price.summary,
    },
    {
      title: "Gamma",
      body: `${snapshot.gamma.summary} · flip G/L ${snapshot.gamma.globalFlipBias}/${snapshot.gamma.localFlipBias} · walls ${snapshot.gamma.wallContext}`,
    },
    {
      title: "Order Flow",
      body: `${snapshot.orderFlow.summary} · abs ${snapshot.orderFlow.absorption} · agg ${snapshot.orderFlow.aggression} · acc ${snapshot.orderFlow.acceptance}`,
    },
    {
      title: "Liquidez",
      body: `${snapshot.liquidity.summary} · wall ${snapshot.liquidity.wallIntegrity} · spoof ${snapshot.liquidity.spoofingHypothesis} · sweep ${snapshot.liquidity.sweepContext}`,
    },
    {
      title: "Open Interest",
      body: `${snapshot.openInterest.summary} · trend ${snapshot.openInterest.oiTrend} · vs price ${snapshot.openInterest.withPrice}`,
    },
    {
      title: "Footprint",
      body: `${snapshot.footprint.summary} · imb ${snapshot.footprint.imbalance} · exh ${snapshot.footprint.exhaustionHint}`,
    },
    {
      title: "Estructura",
      body: `${snapshot.marketStructure.summary} · ${snapshot.marketStructure.structure} · nivel ${snapshot.marketStructure.keyLevelRelation}`,
    },
    {
      title: "Confluencia",
      body: `${snapshot.confluence.summary} · score ${snapshot.confluence.score}`,
    },
    {
      title: "Riesgos",
      body:
        snapshot.risks.length === 0
          ? "Sin riesgos metodológicos destacados."
          : snapshot.risks.map((r) => `[${r.severity}] ${r.code}: ${r.message}`).join("\n"),
    },
    {
      title: "Evidence",
      body: snapshot.evidence
        .slice(0, 12)
        .map((e) => `· (${e.provider} w=${e.weight}) ${e.claim}`)
        .join("\n"),
    },
    {
      title: "Scores",
      body: `confidence=${snapshot.scores.marketConfidence} confluence=${snapshot.scores.confluence} risk=${snapshot.scores.risk} quality=${snapshot.scores.snapshotQuality} · buildMs=${snapshot.buildMs}`,
    },
  ];

  const markdown = [`# Market Snapshot — ${snapshot.symbol}`, "", `> ${headline}`, "", ...sections.flatMap((s) => [`## ${s.title}`, s.body, ""])].join(
    "\n",
  );

  return { headline, sections, markdown };
}

/** Compact JSON-safe view for admin (strip nothing critical; already normalized). */
export function toAdminPayload(snapshot: MarketSnapshot): {
  snapshot: MarketSnapshot;
  rendered: ReturnType<typeof renderMarketSnapshot>;
} {
  return {
    snapshot,
    rendered: renderMarketSnapshot(snapshot),
  };
}
