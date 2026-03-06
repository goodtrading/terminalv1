import { MarketState, OptionsPositioning, KeyLevels, TradingScenario } from "@shared/schema";

export function generateDynamicScenarios(
  market: MarketState,
  positioning: OptionsPositioning,
  levels: KeyLevels
): TradingScenario[] {
  const isLongGamma = market.gammaRegime === "LONG GAMMA";
  const magnets = levels.gammaMagnets.map(m => `${(m / 1000).toFixed(0)}k`);
  const firstMagnet = magnets[0] || "Target";
  const flip = market.gammaFlip.toLocaleString();
  const callWall = positioning.callWall.toLocaleString();
  const putWall = positioning.putWall.toLocaleString();

  const scenarios: TradingScenario[] = [];

  // 1. BASE CASE
  if (isLongGamma) {
    scenarios.push({
      id: 1,
      type: "BASE",
      probability: 60,
      thesis: `Mean Reversion toward ${firstMagnet} magnet`,
      levels: magnets,
      confirmation: ["Absorption at key strikes", "Delta divergence", "Decreasing volatility"],
      invalidation: `Price acceptance below flip level of ${flip}`,
      timestamp: new Date()
    });
  } else {
    scenarios.push({
      id: 1,
      type: "BASE",
      probability: 55,
      thesis: "Volatility Expansion & Gamma Squeeze",
      levels: [flip, `${(levels.shortGammaPocketStart / 1000).toFixed(1)}k`],
      confirmation: ["Increasing realized volatility", "Vanna-fueled selling", "Aggressive delta selling"],
      invalidation: `Recovery and acceptance back above ${flip}`,
      timestamp: new Date()
    });
  }

  // 2. ALT CASE
  scenarios.push({
    id: 2,
    type: "ALT",
    probability: 25,
    thesis: isLongGamma ? "Range Extension to Call Wall" : "Liquidity Sweep & Mean Reversion",
    levels: isLongGamma ? [callWall] : [putWall, flip],
    confirmation: ["Breakout of local range", "OI expansion at walls"],
    invalidation: `Failure to hold ${isLongGamma ? callWall : putWall}`,
    timestamp: new Date()
  });

  // 3. VOL CASE
  scenarios.push({
    id: 3,
    type: "VOL",
    probability: 15,
    thesis: "Tail Risk Event / Gamma Acceleration",
    levels: [`${(levels.deepRiskPocketStart / 1000).toFixed(1)}k`, "Extreme OTM strikes"],
    confirmation: ["Volatility spike (VIX/DVOL)", "Massive wall pulling", "Deep risk pocket penetration"],
    invalidation: "Volatility stabilization",
    timestamp: new Date()
  });

  return scenarios;
}
