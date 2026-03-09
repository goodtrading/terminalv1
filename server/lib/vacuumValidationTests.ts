import { liquidityVacuumEngine, VacuumEngineInput } from "./liquidityVacuumEngine";

export class VacuumValidationTests {
  
  /**
   * Scenario A: Balanced orderbook / no real vacuum
   */
  static async testScenarioA(): Promise<void> {
    console.log("\n=== VALIDATION SCENARIO A: BALANCED ORDERBOOK ===");
    
    const input: VacuumEngineInput = {
      spotPrice: 65000,
      bids: [
        { price: 64999, size: 100 },
        { price: 64998, size: 150 },
        { price: 64997, size: 120 },
        { price: 64996, size: 180 },
        { price: 64995, size: 140 },
        { price: 64994, size: 160 },
        { price: 64993, size: 130 },
        { price: 64992, size: 170 },
        { price: 64991, size: 110 },
        { price: 64990, size: 190 }
      ],
      asks: [
        { price: 65001, size: 95 },
        { price: 65002, size: 145 },
        { price: 65003, size: 115 },
        { price: 65004, size: 175 },
        { price: 65005, size: 135 },
        { price: 65006, size: 155 },
        { price: 65007, size: 125 },
        { price: 65008, size: 165 },
        { price: 65009, size: 105 },
        { price: 65010, size: 185 }
      ],
      spread: 2,
      // No confluence factors
      liquiditySweepRisk: { risk: "LOW", direction: "NEUTRAL", confidence: 0.1 },
      dealerHedgingFlow: { direction: "NEUTRAL", intensity: 0.1 },
      volatility: 0.01
    };

    console.log("RAW INPUTS SUMMARY:", {
      scenario: "Balanced orderbook",
      spotPrice: input.spotPrice,
      bidAskRatio: input.bids.reduce((sum, b) => sum + b.size, 0) / input.asks.reduce((sum, a) => sum + a.size, 0),
      spread: input.spread,
      confluence: "None"
    });

    const result = liquidityVacuumEngine.analyze(input);
    
    console.log("FINAL CLASSIFICATION:", {
      vacuumRisk: result.vacuumRisk,
      vacuumScore: result.vacuumScore,
      vacuumType: result.vacuumType,
      vacuumDirection: result.vacuumDirection,
      confirmedVacuumActive: result.confirmedVacuumActive,
      activeZonesCount: result.activeZones.length
    });

    console.log("WHY CLASSIFICATION IS CORRECT:", [
      "Balanced bid/ask sizes should result in LOW risk",
      "No significant liquidity gaps should exist",
      "No directional bias expected with neutral confluence",
      "Confirmed vacuum should be false due to lack of thin regions",
      "Vacuum type should be NONE with low score"
    ]);

    // Validation checks
    const validation = {
      passed: result.vacuumRisk === "LOW" && result.vacuumScore < 30 && !result.confirmedVacuumActive && result.vacuumType === "NONE",
      expectedRisk: "LOW",
      actualRisk: result.vacuumRisk,
      expectedScoreRange: "< 30",
      actualScore: result.vacuumScore,
      expectedConfirmed: false,
      actualConfirmed: result.confirmedVacuumActive,
      expectedType: "NONE",
      actualType: result.vacuumType
    };

    console.log("SCENARIO A VALIDATION:", validation);
    if (!validation.passed) {
      console.error("❌ SCENARIO A FAILED");
    } else {
      console.log("✅ SCENARIO A PASSED");
    }
  }

  /**
   * Scenario B: Downside thin liquidity with ask-heavy pressure
   */
  static async testScenarioB(): Promise<void> {
    console.log("\n=== VALIDATION SCENARIO B: DOWNSIDE THIN LIQUIDITY + ASK PRESSURE ===");
    
    const input: VacuumEngineInput = {
      spotPrice: 65000,
      bids: [
        { price: 64999, size: 50 },   // Thin bids below spot
        { price: 64998, size: 30 },
        { price: 64997, size: 20 },
        { price: 64996, size: 15 },
        { price: 64995, size: 10 },
        { price: 64994, size: 200 },  // Strong support far below
        { price: 64993, size: 180 },
        { price: 64992, size: 160 },
        { price: 64991, size: 140 },
        { price: 64990, size: 120 }
      ],
      asks: [
        { price: 65001, size: 200 },  // Heavy asks above spot
        { price: 65002, size: 180 },
        { price: 65003, size: 160 },
        { price: 65004, size: 140 },
        { price: 65005, size: 120 },
        { price: 65006, size: 100 },
        { price: 65007, size: 90 },
        { price: 65008, size: 80 },
        { price: 65009, size: 70 },
        { price: 65010, size: 60 }
      ],
      spread: 2,
      liquiditySweepRisk: { risk: "HIGH", direction: "DOWN", confidence: 0.8 },
      dealerHedgingFlow: { direction: "SELLING", intensity: 0.7 },
      volatility: 0.025
    };

    console.log("RAW INPUTS SUMMARY:", {
      scenario: "Downside thin liquidity + ask pressure",
      spotPrice: input.spotPrice,
      bidAskRatio: input.bids.reduce((sum, b) => sum + b.size, 0) / input.asks.reduce((sum, a) => sum + a.size, 0),
      spread: input.spread,
      confluence: "Downward sweep risk + selling dealer flow"
    });

    const result = liquidityVacuumEngine.analyze(input);
    
    console.log("FINAL CLASSIFICATION:", {
      vacuumRisk: result.vacuumRisk,
      vacuumScore: result.vacuumScore,
      vacuumType: result.vacuumType,
      vacuumDirection: result.vacuumDirection,
      vacuumProximity: result.vacuumProximity,
      confirmedVacuumActive: result.confirmedVacuumActive,
      activeZonesCount: result.activeZones.length
    });

    console.log("WHY CLASSIFICATION IS CORRECT:", [
      "Thin bid liquidity below spot should create downside vacuum",
      "Heavy ask pressure reinforces downward bias",
      "Sweep risk and dealer flow alignment should boost acceleration score",
      "Proximity should be NEAR due to thin regions adjacent to spot",
      "Vacuum type should be DIRECTIONAL due to one-sided weakness"
    ]);

    // Validation checks
    const validation = {
      passed: result.vacuumDirection === "DOWN" && result.vacuumScore >= 50 && result.vacuumProximity !== "FAR" && result.vacuumType === "DIRECTIONAL",
      expectedDirection: "DOWN",
      actualDirection: result.vacuumDirection,
      expectedMinScore: 50,
      actualScore: result.vacuumScore,
      expectedProximityNotFar: true,
      actualProximity: result.vacuumProximity,
      expectedType: "DIRECTIONAL",
      actualType: result.vacuumType
    };

    console.log("SCENARIO B VALIDATION:", validation);
    if (!validation.passed) {
      console.error("❌ SCENARIO B FAILED");
    } else {
      console.log("✅ SCENARIO B PASSED");
    }
  }

  /**
   * Scenario C: Visual void but opposing liquidity cluster nearby
   */
  static async testScenarioC(): Promise<void> {
    console.log("\n=== VALIDATION SCENARIO C: VISUAL VOID + OPPOSING CLUSTER ===");
    
    const input: VacuumEngineInput = {
      spotPrice: 65000,
      bids: [
        { price: 64999, size: 10 },   // Very thin bids
        { price: 64998, size: 5 },
        { price: 64997, size: 3 },
        { price: 64996, size: 2 },
        { price: 64995, size: 1 },
        { price: 64994, size: 500 },  // Strong opposing cluster
        { price: 64993, size: 450 },
        { price: 64992, size: 400 },
        { price: 64991, size: 350 },
        { price: 64990, size: 300 }
      ],
      asks: [
        { price: 65001, size: 80 },
        { price: 65002, size: 90 },
        { price: 65003, size: 100 },
        { price: 65004, size: 110 },
        { price: 65005, size: 120 },
        { price: 65006, size: 130 },
        { price: 65007, size: 140 },
        { price: 65008, size: 150 },
        { price: 65009, size: 160 },
        { price: 65010, size: 170 }
      ],
      spread: 2,
      nearestBookClusters: {
        above: [65050],
        below: [64994]  // Strong cluster just below the void
      },
      liquiditySweepRisk: { risk: "LOW", direction: "NEUTRAL", confidence: 0.2 },
      dealerHedgingFlow: { direction: "BUYING", intensity: 0.6 }, // Opposing flow
      volatility: 0.015
    };

    console.log("RAW INPUTS SUMMARY:", {
      scenario: "Visual void + opposing cluster",
      spotPrice: input.spotPrice,
      thinRegion: "64995-64999 (very thin)",
      opposingCluster: "64994 (strong support)",
      confluence: "Buying dealer flow opposes downward pressure"
    });

    const result = liquidityVacuumEngine.analyze(input);
    
    console.log("FINAL CLASSIFICATION:", {
      vacuumRisk: result.vacuumRisk,
      vacuumScore: result.vacuumScore,
      vacuumDirection: result.vacuumDirection,
      confirmedVacuumActive: result.confirmedVacuumActive,
      activeZonesCount: result.activeZones.length,
      nearestCluster: input.nearestBookClusters?.below[0]
    });

    console.log("WHY CLASSIFICATION IS CORRECT:", [
      "Void exists but strong opposing cluster should prevent confirmed vacuum",
      "Buying dealer flow should reduce downward acceleration",
      "Risk should be elevated due to thin liquidity, but not confirmed active",
      "Direction may be NEUTRAL due to conflicting signals"
    ]);

    // Validation checks
    const validation = {
      passed: !result.confirmedVacuumActive && result.vacuumScore >= 25,
      expectedConfirmed: false,
      actualConfirmed: result.confirmedVacuumActive,
      expectedMinScore: 25,
      actualScore: result.vacuumScore,
      hasThinRegions: result.activeZones.length > 0,
      actualZones: result.activeZones.length
    };

    console.log("SCENARIO C VALIDATION:", validation);
    if (!validation.passed) {
      console.error("❌ SCENARIO C FAILED");
    } else {
      console.log("✅ SCENARIO C PASSED");
    }
  }

  /**
   * Scenario D: Strong confluence alignment
   */
  static async testScenarioD(): Promise<void> {
    console.log("\n=== VALIDATION SCENARIO D: STRONG CONFLUENCE ALIGNMENT ===");
    
    const input: VacuumEngineInput = {
      spotPrice: 65000,
      bids: [
        { price: 64999, size: 8 },    // Extremely thin bids
        { price: 64998, size: 5 },
        { price: 64997, size: 3 },
        { price: 64996, size: 2 },
        { price: 64995, size: 1 },
        { price: 64994, size: 15 },
        { price: 64993, size: 10 },
        { price: 64992, size: 8 },
        { price: 64991, size: 6 },
        { price: 64990, size: 4 }
      ],
      asks: [
        { price: 65001, size: 250 },  // Heavy asks
        { price: 65002, size: 200 },
        { price: 65003, size: 180 },
        { price: 65004, size: 160 },
        { price: 65005, size: 140 },
        { price: 65006, size: 120 },
        { price: 65007, size: 100 },
        { price: 65008, size: 90 },
        { price: 65009, size: 80 },
        { price: 65010, size: 70 }
      ],
      spread: 2,
      nearestBookClusters: {
        above: [65100],
        below: [64980]  // Far support
      },
      liquiditySweepRisk: { risk: "EXTREME", direction: "DOWN", confidence: 0.95 },
      dealerHedgingFlow: { direction: "SELLING", intensity: 0.9 },
      volatility: 0.04
    };

    console.log("RAW INPUTS SUMMARY:", {
      scenario: "Strong confluence alignment",
      spotPrice: input.spotPrice,
      thinRegion: "64995-64999 (extremely thin)",
      confluence: "Extreme downward sweep + strong selling flow + high volatility",
      askPressure: "Heavy",
      bidWeakness: "Severe"
    });

    const result = liquidityVacuumEngine.analyze(input);
    
    console.log("FINAL CLASSIFICATION:", {
      vacuumRisk: result.vacuumRisk,
      vacuumScore: result.vacuumScore,
      vacuumDirection: result.vacuumDirection,
      vacuumProximity: result.vacuumProximity,
      confirmedVacuumActive: result.confirmedVacuumActive,
      activeZonesCount: result.activeZones.length
    });

    console.log("WHY CLASSIFICATION IS CORRECT:", [
      "Extreme confluence should produce HIGH/EXTREME risk",
      "All factors aligned downward should give clear DOWN direction",
      "Thin regions adjacent to spot should give NEAR/IMMEDIATE proximity",
      "Strong alignment should result in confirmed active vacuum",
      "Acceleration score should be maximized by confluence"
    ]);

    // Validation checks
    const validation = {
      passed: (result.vacuumRisk === "HIGH" || result.vacuumRisk === "EXTREME") && 
                result.vacuumDirection === "DOWN" && 
                result.confirmedVacuumActive &&
                result.vacuumScore >= 70,
      expectedRisk: "HIGH/EXTREME",
      actualRisk: result.vacuumRisk,
      expectedDirection: "DOWN",
      actualDirection: result.vacuumDirection,
      expectedConfirmed: true,
      actualConfirmed: result.confirmedVacuumActive,
      expectedMinScore: 70,
      actualScore: result.vacuumScore
    };

    console.log("SCENARIO D VALIDATION:", validation);
    if (!validation.passed) {
      console.error("❌ SCENARIO D FAILED");
    } else {
      console.log("✅ SCENARIO D PASSED");
    }
  }

  /**
   * Scenario E: Compression vacuum (two-sided thin liquidity)
   */
  static async testScenarioE(): Promise<void> {
    console.log("\n=== VALIDATION SCENARIO E: COMPRESSION VACUUM ===");
    
    const input: VacuumEngineInput = {
      spotPrice: 65000,
      bids: [
        { price: 64999, size: 8 },    // Thin bids below spot
        { price: 64998, size: 5 },
        { price: 64997, size: 3 },
        { price: 64996, size: 2 },
        { price: 64995, size: 1 },
        { price: 64994, size: 15 },
        { price: 64993, size: 10 },
        { price: 64992, size: 8 },
        { price: 64991, size: 6 },
        { price: 64990, size: 4 }
      ],
      asks: [
        { price: 65001, size: 7 },    // Thin asks above spot
        { price: 65002, size: 5 },
        { price: 65003, size: 3 },
        { price: 65004, size: 2 },
        { price: 65005, size: 1 },
        { price: 65006, size: 12 },
        { price: 65007, size: 10 },
        { price: 65008, size: 8 },
        { price: 65009, size: 6 },
        { price: 65010, size: 4 }
      ],
      spread: 2,
      nearestBookClusters: {
        above: [65100],
        below: [64980]  // Far support and resistance
      },
      liquiditySweepRisk: { risk: "MEDIUM", direction: "NEUTRAL", confidence: 0.4 },
      dealerHedgingFlow: { direction: "NEUTRAL", intensity: 0.3 },
      volatility: 0.02
    };

    console.log("RAW INPUTS SUMMARY:", {
      scenario: "Compression vacuum",
      spotPrice: input.spotPrice,
      thinRegionBelow: "64995-64999 (very thin)",
      thinRegionAbove: "65001-65005 (very thin)",
      confluence: "Neutral sweep risk + neutral dealer flow",
      pressureState: "Balanced"
    });

    const result = liquidityVacuumEngine.analyze(input);
    
    console.log("FINAL CLASSIFICATION:", {
      vacuumRisk: result.vacuumRisk,
      vacuumScore: result.vacuumScore,
      vacuumType: result.vacuumType,
      vacuumDirection: result.vacuumDirection,
      vacuumProximity: result.vacuumProximity,
      confirmedVacuumActive: result.confirmedVacuumActive,
      activeZonesCount: result.activeZones.length
    });

    console.log("WHY CLASSIFICATION IS CORRECT:", [
      "Two-sided thin liquidity should create COMPRESSION vacuum",
      "Neutral confluence should prevent directional bias",
      "Direction should be forced to NEUTRAL by safety rule",
      "Risk should be elevated due to thin regions on both sides",
      "Compression indicates volatility pocket potential"
    ]);

    // Validation checks
    const validation = {
      passed: result.vacuumType === "COMPRESSION" && 
                result.vacuumDirection === "NEUTRAL" && 
                result.vacuumScore >= 50 &&
                result.activeZones.length >= 2, // Should have zones on both sides
      expectedType: "COMPRESSION",
      actualType: result.vacuumType,
      expectedDirection: "NEUTRAL",
      actualDirection: result.vacuumDirection,
      expectedMinScore: 50,
      actualScore: result.vacuumScore,
      expectedMinZones: 2,
      actualZones: result.activeZones.length
    };

    console.log("SCENARIO E VALIDATION:", validation);
    if (!validation.passed) {
      console.error("❌ SCENARIO E FAILED");
    } else {
      console.log("✅ SCENARIO E PASSED");
    }
  }

  /**
   * Run all validation tests
   */
  static async runAllTests(): Promise<void> {
    console.log("🧪 STARTING VACUUM ENGINE VALIDATION TESTS");
    
    try {
      await this.testScenarioA();
      await this.testScenarioB();
      await this.testScenarioC();
      await this.testScenarioD();
      await this.testScenarioE(); // New compression vacuum test
      
      console.log("\n🏁 VALIDATION TESTS COMPLETE");
      console.log("Check individual scenario results above for any failures");
      
    } catch (error) {
      console.error("❌ VALIDATION TESTS FAILED WITH ERROR:", error);
    }
  }
}
