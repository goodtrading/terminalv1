import { MarketState, OptionsPositioning, KeyLevels, TradingScenario, DealerExposure } from "@shared/schema";

export function generateDynamicScenarios(
  market: MarketState,
  positioning: OptionsPositioning,
  levels: KeyLevels,
  dealer: DealerExposure
): TradingScenario[] {
  const isLongGamma = market.gammaRegime === "LONG GAMMA";
  const magnets = levels.gammaMagnets.map(m => `${(m / 1000).toFixed(0)}k`);
  const firstMagnet = magnets[0] || "Target";
  const flip = market.gammaFlip.toLocaleString();
  const callWall = positioning.callWall.toLocaleString();
  const putWall = positioning.putWall.toLocaleString();
  
  const isVannaBullish = dealer.vannaBias === "BULLISH";
  const isCharmBullish = dealer.charmBias === "BULLISH";

  const scenarios: TradingScenario[] = [];

  // 1. BASE CASE
  if (isLongGamma) {
    const thesis = isVannaBullish && isCharmBullish 
      ? `Mean Reversion toward ${firstMagnet} with strong vanna/charm support`
      : `Range-bound mean reversion toward ${firstMagnet} magnet`;
      
    scenarios.push({
      id: 1,
      type: "BASE",
      probability: 60,
      thesis,
      levels: magnets,
      confirmation: ["Absorption at key magnets", "Delta divergence", "Implied vol crush"],
      invalidation: `Price acceptance below flip level of ${flip}`,
      timestamp: new Date()
    });
  } else {
    scenarios.push({
      id: 1,
      type: "BASE",
      probability: 55,
      thesis: "Volatility Expansion into Short Gamma Pocket",
      levels: [flip, `${(levels.shortGammaPocketStart / 1000).toFixed(1)}k`],
      confirmation: ["Increasing realized volatility", "Aggressive delta selling", "Spot price leading IV spike"],
      invalidation: `Sustained recovery and acceptance back above ${flip}`,
      timestamp: new Date()
    });
  }

  // 2. ALT CASE
  scenarios.push({
    id: 2,
    type: "ALT",
    probability: 25,
    thesis: isLongGamma 
      ? `Upside Range Extension to ${callWall} wall`
      : `Liquidity Sweep of ${putWall} followed by mean reversion`,
    levels: isLongGamma ? [callWall] : [putWall, flip],
    confirmation: ["Wall defended on volume", "OI growth at strikes"],
    invalidation: `Clean break of ${isLongGamma ? callWall : putWall} without rejection`,
    timestamp: new Date()
  });

  // 3. VOL CASE
  scenarios.push({
    id: 3,
    type: "VOL",
    probability: 15,
    thesis: "Tail Risk Acceleration / Gamma Squeeze Event",
    levels: [`${(levels.deepRiskPocketStart / 1000).toFixed(1)}k`, "Extreme OTM levels"],
    confirmation: ["Massive wall pulling", "DVOL spike > 10%", "Bid/Ask spread expansion"],
    invalidation: "Orderflow stabilization and volatility mean reversion",
    timestamp: new Date()
  });

  return scenarios;
}
