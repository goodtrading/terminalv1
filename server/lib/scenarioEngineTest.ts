import { scenarioEngine, TerminalSignals } from "./scenarioEngine";

// Test the scenario engine with different market conditions
export function testScenarioEngine(): void {
  console.log("🧪 Testing Scenario Engine");

  // Test Case 1: LONG GAMMA + COMPRESSION
  console.log("\n=== TEST 1: LONG GAMMA + COMPRESSION ===");
  const signals1: TerminalSignals = {
    gammaRegime: "LONG GAMMA",
    gammaFlip: 65000,
    gammaMagnets: [64950, 65050],
    callWall: 65200,
    putWall: 64800,
    pressure: "BALANCED",
    vacuumRisk: "MEDIUM",
    vacuumType: "COMPRESSION",
    vacuumDirection: "NEUTRAL",
    vacuumProximity: "NEAR",
    thinLiquidity: { price: 64980, direction: "ABOVE" }
  };

  const scenarios1 = scenarioEngine.generateScenarios(signals1);
  console.log("Result:", JSON.stringify(scenarios1, null, 2));

  // Test Case 2: SHORT GAMMA + DIRECTIONAL DOWN
  console.log("\n=== TEST 2: SHORT GAMMA + DIRECTIONAL DOWN ===");
  const signals2: TerminalSignals = {
    gammaRegime: "SHORT GAMMA",
    gammaFlip: 65000,
    gammaMagnets: [64950, 65050],
    callWall: 65200,
    putWall: 64800,
    pressure: "BID_HEAVY",
    vacuumRisk: "HIGH",
    vacuumType: "DIRECTIONAL",
    vacuumDirection: "DOWN",
    vacuumProximity: "IMMEDIATE",
    thinLiquidity: { price: 64920, direction: "BELOW" }
  };

  const scenarios2 = scenarioEngine.generateScenarios(signals2);
  console.log("Result:", JSON.stringify(scenarios2, null, 2));

  // Verify probabilities total 100
  const checkProbabilities = (scenarios: any, testName: string) => {
    const total = scenarios.baseCase.probability + scenarios.altCase.probability + scenarios.volCase.probability;
    console.log(`${testName} - Total Probability: ${total}% (should be 100)`);
    if (total !== 100) {
      console.error(`❌ Probability error in ${testName}`);
    } else {
      console.log(`✅ Probabilities correct in ${testName}`);
    }
  };

  checkProbabilities(scenarios1, "LONG GAMMA + COMPRESSION");
  checkProbabilities(scenarios2, "SHORT GAMMA + DIRECTIONAL DOWN");

  console.log("\n🏁 Scenario Engine Test Complete");
}
