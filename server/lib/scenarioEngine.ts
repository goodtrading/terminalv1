// Structural Scenario Engine
// Generates dynamic scenarios based on terminal intelligence signals

export interface Scenario {
  probability: number;
  title: string;
  summary: string;
  regime: string;
  trigger: string;
  target: string;
  invalidation: string;
  bias: "BULLISH" | "BEARISH" | "NEUTRAL";
  triggerLevel: number | null;
  targetLevel: number | null;
}

export interface MarketScenarios {
  marketRegime: string;
  baseCase: Scenario;
  altCase: Scenario;
  volCase: Scenario;
}

export interface TerminalSignals {
  gammaRegime?: string;
  gammaFlip?: number;
  gammaMagnets?: number[];
  callWall?: number;
  putWall?: number;
  pressure?: string;
  vacuumRisk?: string;
  vacuumType?: string;
  vacuumDirection?: string;
  vacuumProximity?: string;
  thinLiquidity?: { price: number; direction: string } | null;
}

export class ScenarioEngine {
  
  /**
   * Determine numeric level for a scenario based on available signals
   */
  private determineLevel(
    target: string, 
    signals: TerminalSignals, 
    scenarioType: "BASE" | "ALT" | "VOL"
  ): number | null {
    // Priority order for different scenario types
    if (scenarioType === "BASE") {
      // Base case prefers gamma magnets
      if (signals.gammaMagnets && signals.gammaMagnets.length > 0) {
        return signals.gammaMagnets[0];
      }
      // Fallback to gamma flip
      if (signals.gammaFlip) {
        return signals.gammaFlip;
      }
    }
    
    if (scenarioType === "ALT") {
      // Alt case prefers directional walls
      if (target.toLowerCase().includes("up") || target.toLowerCase().includes("bull")) {
        return signals.callWall || null;
      }
      if (target.toLowerCase().includes("down") || target.toLowerCase().includes("bear")) {
        return signals.putWall || null;
      }
      // Fallback to gamma flip
      if (signals.gammaFlip) {
        return signals.gammaFlip;
      }
    }
    
    if (scenarioType === "VOL") {
      // Vol case uses flip or next significant level
      if (signals.gammaFlip) {
        return signals.gammaFlip;
      }
      // Fallback to magnets
      if (signals.gammaMagnets && signals.gammaMagnets.length > 0) {
        return signals.gammaMagnets[0];
      }
    }
    
    return null;
  }

  /**
   * Generate structural scenarios based on terminal signals
   */
  generateScenarios(signals: TerminalSignals): MarketScenarios {
    const marketRegime = this.determineMarketRegime(signals);
    
    // Base probability anchors
    let baseProb = 60;
    let altProb = 25;
    let volProb = 15;

    // Adjust probabilities based on conditions
    const probAdjustments = this.calculateProbabilityAdjustments(signals);
    baseProb += probAdjustments.base;
    altProb += probAdjustments.alt;
    volProb += probAdjustments.vol;

    // Clamp and normalize to 100%
    baseProb = Math.max(45, Math.min(70, baseProb));
    altProb = Math.max(20, Math.min(35, altProb));
    volProb = Math.max(10, Math.min(25, volProb));
    
    const total = baseProb + altProb + volProb;
    baseProb = Math.round((baseProb / total) * 100);
    altProb = Math.round((altProb / total) * 100);
    volProb = 100 - baseProb - altProb; // Ensure exact 100 total

    // Generate scenarios based on regime and conditions
    const scenarios = this.generateScenarioContent(signals, marketRegime);

    return {
      marketRegime,
      baseCase: { ...scenarios.baseCase, probability: baseProb },
      altCase: { ...scenarios.altCase, probability: altProb },
      volCase: { ...scenarios.volCase, probability: volProb }
    };
  }

  /**
   * Determine overall market regime
   */
  private determineMarketRegime(signals: TerminalSignals): string {
    const gammaRegime = signals.gammaRegime || "UNKNOWN";
    const vacuumRisk = signals.vacuumRisk || "LOW";
    const vacuumType = signals.vacuumType || "NONE";

    if (gammaRegime === "LONG GAMMA") {
      if (vacuumType === "COMPRESSION") {
        return "LONG GAMMA COMPRESSION";
      } else if (vacuumRisk === "HIGH" || vacuumRisk === "EXTREME") {
        return "LONG GAMMA ELEVATED RISK";
      }
      return "LONG GAMMA MEAN REVERSION";
    } else if (gammaRegime === "SHORT GAMMA") {
      if (vacuumType === "DIRECTIONAL") {
        return "SHORT GAMMA DIRECTIONAL";
      } else if (vacuumRisk === "HIGH" || vacuumRisk === "EXTREME") {
        return "SHORT GAMMA ACCELERATION";
      }
      return "SHORT GAMMA EXPANSION";
    }

    return "NEUTRAL MARKET STRUCTURE";
  }

  /**
   * Calculate probability adjustments based on conditions
   */
  private calculateProbabilityAdjustments(signals: TerminalSignals): { base: number; alt: number; vol: number } {
    let baseAdj = 0;
    let altAdj = 0;
    let volAdj = 0;

    const gammaRegime = signals.gammaRegime;
    const vacuumRisk = signals.vacuumRisk;
    const vacuumProximity = signals.vacuumProximity;
    const vacuumType = signals.vacuumType;
    const vacuumDirection = signals.vacuumDirection;
    const pressure = signals.pressure;

    // SHORT GAMMA + HIGH vacuum risk + NEAR/IMMEDIATE proximity
    if (gammaRegime === "SHORT GAMMA" && 
        (vacuumRisk === "HIGH" || vacuumRisk === "EXTREME") && 
        (vacuumProximity === "NEAR" || vacuumProximity === "IMMEDIATE")) {
      baseAdj -= 10;
      volAdj += 10;
    }

    // LONG GAMMA + BALANCED pressure + COMPRESSION
    if (gammaRegime === "LONG GAMMA" && 
        pressure === "BALANCED" && 
        vacuumType === "COMPRESSION") {
      baseAdj += 5;
      volAdj -= 5;
    }

    // DIRECTIONAL vacuum aligns strongly with pressure
    if (vacuumType === "DIRECTIONAL" && vacuumDirection) {
      if ((vacuumDirection === "UP" && pressure === "ASK_HEAVY") ||
          (vacuumDirection === "DOWN" && pressure === "BID_HEAVY")) {
        altAdj += 5;
        baseAdj -= 5;
      }
    }

    return { base: baseAdj, alt: altAdj, vol: volAdj };
  }

  /**
   * Generate scenario content based on regime and conditions
   */
  private generateScenarioContent(signals: TerminalSignals, marketRegime: string): {
    baseCase: Omit<Scenario, 'probability'>;
    altCase: Omit<Scenario, 'probability'>;
    volCase: Omit<Scenario, 'probability'>;
  } {
    const gammaRegime = signals.gammaRegime || "UNKNOWN";
    const vacuumType = signals.vacuumType || "NONE";
    const vacuumDirection = signals.vacuumDirection;
    const pressure = signals.pressure || "BALANCED";
    const callWall = signals.callWall;
    const putWall = signals.putWall;
    const gammaMagnets = signals.gammaMagnets || [];

    if (gammaRegime === "LONG GAMMA") {
      return this.generateLongGammaScenarios(signals, marketRegime);
    } else if (gammaRegime === "SHORT GAMMA") {
      return this.generateShortGammaScenarios(signals, marketRegime);
    } else {
      return this.generateNeutralScenarios(signals, marketRegime);
    }
  }

  /**
   * Generate LONG GAMMA scenarios
   */
  private generateLongGammaScenarios(signals: TerminalSignals, marketRegime: string): {
    baseCase: Omit<Scenario, 'probability'>;
    altCase: Omit<Scenario, 'probability'>;
    volCase: Omit<Scenario, 'probability'>;
  } {
    const vacuumType = signals.vacuumType || "NONE";
    const pressure = signals.pressure || "BALANCED";
    const callWall = signals.callWall;
    const putWall = signals.putWall;
    const gammaMagnets = signals.gammaMagnets || [];

    const magnetTarget = gammaMagnets.length > 0 ? gammaMagnets[0] : "gamma magnet";
    const wallTarget = callWall || putWall || "liquidity wall";

    if (vacuumType === "COMPRESSION") {
      const magnetLevel = this.determineLevel(magnetTarget.toString(), signals, "BASE");
      const wallLevel = this.determineLevel(wallTarget.toString(), signals, "ALT");
      const expansionLevel = this.determineLevel("expansion", signals, "VOL");

      return {
        baseCase: {
          title: "Compression Mean Reversion",
          summary: "Energy build-up within compression zone favors magnet reversion",
          regime: "Long gamma compression",
          trigger: magnetLevel ? `Acceptance below ${(magnetLevel / 1000).toFixed(1)}k` : "Magnet rejection",
          target: magnetLevel ? `${(magnetLevel / 1000).toFixed(1)}k magnet` : "Gamma magnet",
          invalidation: magnetLevel ? `Break above ${(magnetLevel / 1000).toFixed(1)}k` : "Magnet breach",
          bias: "NEUTRAL",
          triggerLevel: null,
          targetLevel: magnetLevel
        },
        altCase: {
          title: "Controlled Range Extension",
          summary: "Measured extension toward nearest liquidity wall under balanced pressure",
          regime: "Long gamma expansion",
          trigger: wallLevel ? `Acceptance above ${(wallLevel / 1000).toFixed(1)}k` : "Wall breach",
          target: wallLevel ? `${(wallLevel / 1000).toFixed(1)}k wall` : "Liquidity wall",
          invalidation: wallLevel ? `Loss of ${(wallLevel / 1000).toFixed(1)}k` : "Wall rejection",
          bias: pressure === "ASK_HEAVY" ? "BULLISH" : pressure === "BID_HEAVY" ? "BEARISH" : "NEUTRAL",
          triggerLevel: null,
          targetLevel: wallLevel
        },
        volCase: {
          title: "Compression Breakout Expansion",
          summary: "Compression failure triggers rapid expansion through thin liquidity",
          regime: "Volatility expansion",
          trigger: expansionLevel ? `Break below ${(expansionLevel / 1000).toFixed(1)}k` : "Compression breach",
          target: expansionLevel ? `${(expansionLevel / 1000).toFixed(1)}k expansion` : "Next structural level",
          invalidation: expansionLevel ? `Reclaim above ${(expansionLevel / 1000).toFixed(1)}k` : "Expansion failure",
          bias: "NEUTRAL",
          triggerLevel: null,
          targetLevel: expansionLevel
        }
      };
    }

    // Default LONG GAMMA scenarios
    const magnetLevel = this.determineLevel(magnetTarget.toString(), signals, "BASE");
    const wallLevel = this.determineLevel(wallTarget.toString(), signals, "ALT");
    const expansionLevel = this.determineLevel("expansion", signals, "VOL");

    return {
      baseCase: {
        title: "Range Mean Reversion",
        summary: "Long gamma environment favors mean reversion toward magnetic levels",
        regime: "Long gamma mean reversion",
        trigger: magnetLevel ? `Acceptance below ${(magnetLevel / 1000).toFixed(1)}k` : "Magnet rejection",
        target: magnetLevel ? `${(magnetLevel / 1000).toFixed(1)}k magnet` : "Gamma magnet",
        invalidation: magnetLevel ? `Break above ${(magnetLevel / 1000).toFixed(1)}k` : "Magnet breach",
        bias: "NEUTRAL",
        triggerLevel: null,
        targetLevel: magnetLevel
      },
      altCase: {
        title: "Controlled Upside Extension",
        summary: "Measured upside progression into call wall liquidity under buying pressure",
        regime: "Long gamma expansion",
        trigger: wallLevel ? `Acceptance above ${(wallLevel / 1000).toFixed(1)}k` : "Wall breach",
        target: wallLevel ? `${(wallLevel / 1000).toFixed(1)}k call wall` : "Call wall",
        invalidation: wallLevel ? `Loss of ${(wallLevel / 1000).toFixed(1)}k` : "Wall rejection",
        bias: "BULLISH",
        triggerLevel: null,
        targetLevel: wallLevel
      },
      volCase: {
        title: "Accelerated Expansion Event",
        summary: "Low-probability expansion through thin liquidity if vacuum risk materializes",
        regime: "Volatility expansion",
        trigger: expansionLevel ? `Break below ${(expansionLevel / 1000).toFixed(1)}k` : "Vacuum activation",
        target: expansionLevel ? `${(expansionLevel / 1000).toFixed(1)}k expansion` : "Next resistance cluster",
        invalidation: expansionLevel ? `Reclaim above ${(expansionLevel / 1000).toFixed(1)}k` : "Expansion failure",
        bias: pressure === "ASK_HEAVY" ? "BULLISH" : pressure === "BID_HEAVY" ? "BEARISH" : "NEUTRAL",
        triggerLevel: null,
        targetLevel: expansionLevel
      }
    };
  }

  /**
   * Generate SHORT GAMMA scenarios
   */
  private generateShortGammaScenarios(signals: TerminalSignals, marketRegime: string): {
    baseCase: Omit<Scenario, 'probability'>;
    altCase: Omit<Scenario, 'probability'>;
    volCase: Omit<Scenario, 'probability'>;
  } {
    const vacuumType = signals.vacuumType || "NONE";
    const vacuumDirection = signals.vacuumDirection;
    const pressure = signals.pressure || "BALANCED";
    const callWall = signals.callWall;
    const putWall = signals.putWall;
    const gammaFlip = signals.gammaFlip;

    if (vacuumType === "DIRECTIONAL") {
      const directionalBias = vacuumDirection === "UP" ? "BULLISH" : vacuumDirection === "DOWN" ? "BEARISH" : "NEUTRAL";
      const targetWall = vacuumDirection === "UP" ? callWall : vacuumDirection === "DOWN" ? putWall : undefined;
      
      const continuationLevel = this.determineLevel(targetWall?.toString() || "continuation", signals, "BASE");
      const pullbackLevel = this.determineLevel("pullback", signals, "ALT");
      const squeezeLevel = this.determineLevel("squeeze", signals, "VOL");

      return {
        baseCase: {
          title: "Directional Continuation",
          summary: `Short gamma environment with ${vacuumDirection ? vacuumDirection.toLowerCase() : 'directional'} vacuum favors directional continuation`,
          regime: "Short gamma directional",
          trigger: continuationLevel ? `Acceptance ${(vacuumDirection === "UP" ? "above" : "below")} ${(continuationLevel / 1000).toFixed(1)}k` : "Vacuum maintenance",
          target: continuationLevel ? `${(continuationLevel / 1000).toFixed(1)}k continuation` : `Continuation ${vacuumDirection ? vacuumDirection.toLowerCase() : 'directional'}`,
          invalidation: continuationLevel ? `Loss of ${(continuationLevel / 1000).toFixed(1)}k` : "Vacuum failure",
          bias: directionalBias,
          triggerLevel: null,
          targetLevel: continuationLevel
        },
        altCase: {
          title: "Failed Expansion Pullback",
          summary: "Counter-trend move into gamma flip or magnet on directional failure",
          regime: "Short gamma reversal",
          trigger: pullbackLevel ? `Acceptance ${(vacuumDirection === "UP" ? "below" : "above")} ${(pullbackLevel / 1000).toFixed(1)}k` : "Reversal trigger",
          target: pullbackLevel ? `${(pullbackLevel / 1000).toFixed(1)}k pullback` : gammaFlip ? `${(gammaFlip / 1000).toFixed(1)}k flip` : "Magnetic support",
          invalidation: pullbackLevel ? `Reclaim ${(vacuumDirection === "UP" ? "above" : "below")} ${(pullbackLevel / 1000).toFixed(1)}k` : "Reversal failure",
          bias: directionalBias === "BULLISH" ? "BEARISH" : directionalBias === "BEARISH" ? "BULLISH" : "NEUTRAL",
          triggerLevel: null,
          targetLevel: pullbackLevel
        },
        volCase: {
          title: "Squeeze Acceleration Event",
          summary: "Directional vacuum triggers squeeze through thin liquidity zone",
          regime: "Squeeze acceleration",
          trigger: squeezeLevel ? `Break ${(vacuumDirection === "UP" ? "below" : "above")} ${(squeezeLevel / 1000).toFixed(1)}k` : "Squeeze trigger",
          target: squeezeLevel ? `${(squeezeLevel / 1000).toFixed(1)}k squeeze` : `Accelerated move ${vacuumDirection ? vacuumDirection.toLowerCase() : 'directional'}`,
          invalidation: squeezeLevel ? `Reclaim ${(vacuumDirection === "UP" ? "below" : "above")} ${(squeezeLevel / 1000).toFixed(1)}k` : "Squeeze failure",
          bias: directionalBias,
          triggerLevel: null,
          targetLevel: squeezeLevel
        }
      };
    }

    // Default SHORT GAMMA scenarios
    const expansionLevel = this.determineLevel("expansion", signals, "BASE");
    const reversalLevel = this.determineLevel("reversal", signals, "ALT");
    const squeezeLevel = this.determineLevel("squeeze", signals, "VOL");

    return {
      baseCase: {
        title: "Short Gamma Expansion",
        summary: "Short gamma environment favors directional expansion and range extension",
        regime: "Short gamma expansion",
        trigger: expansionLevel ? `Break above ${(expansionLevel / 1000).toFixed(1)}k` : "Range breakout",
        target: expansionLevel ? `${(expansionLevel / 1000).toFixed(1)}k expansion` : callWall ? "Call wall" : putWall ? "Put wall" : "Range extension",
        invalidation: expansionLevel ? `Loss of ${(expansionLevel / 1000).toFixed(1)}k` : "Expansion failure",
        bias: pressure === "ASK_HEAVY" ? "BULLISH" : pressure === "BID_HEAVY" ? "BEARISH" : "NEUTRAL",
        triggerLevel: null,
        targetLevel: expansionLevel
      },
      altCase: {
        title: "Failed Expansion Reversal",
        summary: "Expansion failure leads to pullback into gamma flip or magnetic support",
        regime: "Short gamma reversal",
        trigger: reversalLevel ? `Acceptance ${(reversalLevel / 1000).toFixed(1)}k` : "Reversal trigger",
        target: reversalLevel ? `${(reversalLevel / 1000).toFixed(1)}k reversal` : gammaFlip ? `${(gammaFlip / 1000).toFixed(1)}k flip` : "Magnetic support",
        invalidation: reversalLevel ? `Break above ${(reversalLevel / 1000).toFixed(1)}k` : "Reversal failure",
        bias: pressure === "ASK_HEAVY" ? "BEARISH" : pressure === "BID_HEAVY" ? "BULLISH" : "NEUTRAL",
        triggerLevel: null,
        targetLevel: reversalLevel
      },
      volCase: {
        title: "Squeeze Event",
        summary: "Rapid price acceleration through thin liquidity on momentum surge",
        regime: "Squeeze acceleration",
        trigger: squeezeLevel ? `Break below ${(squeezeLevel / 1000).toFixed(1)}k` : "Vacuum activation",
        target: squeezeLevel ? `${(squeezeLevel / 1000).toFixed(1)}k squeeze` : "Next liquidity barrier",
        invalidation: squeezeLevel ? `Reclaim above ${(squeezeLevel / 1000).toFixed(1)}k` : "Squeeze failure",
        bias: pressure === "ASK_HEAVY" ? "BULLISH" : pressure === "BID_HEAVY" ? "BEARISH" : "NEUTRAL",
        triggerLevel: null,
        targetLevel: squeezeLevel
      }
    };
  }

  /**
   * Generate NEUTRAL scenarios
   */
  private generateNeutralScenarios(signals: TerminalSignals, marketRegime: string): {
    baseCase: Omit<Scenario, 'probability'>;
    altCase: Omit<Scenario, 'probability'>;
    volCase: Omit<Scenario, 'probability'>;
  } {
    const pressure = signals.pressure || "BALANCED";
    const callWall = signals.callWall;
    const putWall = signals.putWall;
    const gammaMagnets = signals.gammaMagnets || [];

    const magnetTarget = gammaMagnets.length > 0 ? gammaMagnets[0] : "magnetic level";

    const magnetLevel = this.determineLevel(magnetTarget.toString(), signals, "BASE");
    const pressureLevel = this.determineLevel("pressure", signals, "ALT");
    const breakoutLevel = this.determineLevel("breakout", signals, "VOL");

    return {
      baseCase: {
        title: "Neutral Range Trading",
        summary: "Balanced market structure favors range-bound trading around magnets",
        regime: "Neutral range",
        trigger: magnetLevel ? `Acceptance below ${(magnetLevel / 1000).toFixed(1)}k` : "Range test",
        target: magnetLevel ? `${(magnetLevel / 1000).toFixed(1)}k magnet` : "Mean reversion",
        invalidation: magnetLevel ? `Break above ${(magnetLevel / 1000).toFixed(1)}k` : "Range breach",
        bias: "NEUTRAL",
        triggerLevel: null,
        targetLevel: magnetLevel
      },
      altCase: {
        title: "Pressure-Driven Extension",
        summary: `${pressure.toLowerCase().replace('_', ' ')} pressure drives extension toward liquidity wall`,
        regime: "Pressure expansion",
        trigger: pressureLevel ? `Acceptance ${pressure === "ASK_HEAVY" ? "above" : "below"} ${(pressureLevel / 1000).toFixed(1)}k` : "Pressure imbalance",
        target: pressureLevel ? `${(pressureLevel / 1000).toFixed(1)}k extension` : 
               pressure === "ASK_HEAVY" && callWall ? `${(callWall / 1000).toFixed(1)}k call wall` : 
               pressure === "BID_HEAVY" && putWall ? `${(putWall / 1000).toFixed(1)}k put wall` : 
               "Pressure-aligned wall",
        invalidation: pressureLevel ? `Loss of ${(pressureLevel / 1000).toFixed(1)}k` : "Pressure failure",
        bias: pressure === "ASK_HEAVY" ? "BULLISH" : pressure === "BID_HEAVY" ? "BEARISH" : "NEUTRAL",
        triggerLevel: null,
        targetLevel: pressureLevel
      },
      volCase: {
        title: "Structure Breakout",
        summary: "Range breakout on volume surge and momentum shift",
        regime: "Breakout expansion",
        trigger: breakoutLevel ? `Break above ${(breakoutLevel / 1000).toFixed(1)}k` : "Range break",
        target: breakoutLevel ? `${(breakoutLevel / 1000).toFixed(1)}k breakout` : "Next structural level",
        invalidation: breakoutLevel ? `Loss of ${(breakoutLevel / 1000).toFixed(1)}k` : "Breakout failure",
        bias: pressure === "ASK_HEAVY" ? "BULLISH" : pressure === "BID_HEAVY" ? "BEARISH" : "NEUTRAL",
        triggerLevel: null,
        targetLevel: breakoutLevel
      }
    };
  }

  /**
   * Create low-quality result when insufficient data is available
   */
  private createLowQualityResult(reason: string): MarketScenarios {
    return {
      marketRegime: "UNKNOWN",
      baseCase: {
        probability: 60,
        title: "Analysis Unavailable",
        summary: reason,
        regime: "Unknown",
        trigger: "N/A",
        target: "No levels available",
        invalidation: "N/A",
        bias: "NEUTRAL",
        triggerLevel: null,
        targetLevel: null
      },
      altCase: {
        probability: 25,
        title: "Analysis Unavailable",
        summary: reason,
        regime: "Unknown",
        trigger: "N/A",
        target: "No levels available",
        invalidation: "N/A",
        bias: "NEUTRAL",
        triggerLevel: null,
        targetLevel: null
      },
      volCase: {
        probability: 15,
        title: "Analysis Unavailable",
        summary: reason,
        regime: "Unknown",
        trigger: "N/A",
        target: "No levels available",
        invalidation: "N/A",
        bias: "NEUTRAL",
        triggerLevel: null,
        targetLevel: null
      }
    };
  }
}

// Export singleton instance
export const scenarioEngine = new ScenarioEngine();
