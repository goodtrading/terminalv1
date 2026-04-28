/**
 * Mobile Events - Push notification foundation
 * Critical events: gamma regime change, flip proximity, scenario triggers, sweeps/absorption
 */

export interface CriticalEvent {
  id: string;
  type: "GAMMA_REGIME_CHANGE" | "GAMMA_FLIP_PROXIMITY" | "SCENARIO_TRIGGER" | "LIQUIDITY_SWEEP" | "ABSORPTION";
  severity: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
  timestamp: number;
  data: {
    oldValue?: any;
    newValue?: any;
    threshold?: number;
    confidence?: number;
    message: string;
    actionable: boolean;
  };
}

export interface EventSubscription {
  userId?: string;
  deviceId?: string;
  eventTypes: CriticalEvent["type"][];
  minSeverity: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
  active: boolean;
}

export class MobileEventManager {
  private events: CriticalEvent[] = [];
  private subscriptions: EventSubscription[] = [];
  private lastState: any = null;

  /**
   * Process terminal state and emit critical events
   */
  processState(terminalState: any): CriticalEvent[] {
    const newEvents: CriticalEvent[] = [];
    const now = Date.now();

    // Check for gamma regime change
    const currentRegime = terminalState.positioning?.gammaExposure?.dealerRegime;
    const lastRegime = this.lastState?.positioning?.gammaExposure?.dealerRegime;
    
    if (currentRegime && currentRegime !== lastRegime) {
      newEvents.push({
        id: `regime_${now}`,
        type: "GAMMA_REGIME_CHANGE",
        severity: "HIGH",
        timestamp: now,
        data: {
          oldValue: lastRegime,
          newValue: currentRegime,
          message: `Gamma regime changed from ${lastRegime} to ${currentRegime}`,
          actionable: true
        }
      });
    }

    // Check for flip proximity (< 5%)
    const distanceToFlip = terminalState.positioning?.gammaExposure?.distanceToFlipPct;
    if (distanceToFlip !== null && distanceToFlip < 5) {
      newEvents.push({
        id: `flip_${now}`,
        type: "GAMMA_FLIP_PROXIMITY",
        severity: distanceToFlip < 2 ? "EXTREME" : "HIGH",
        timestamp: now,
        data: {
          threshold: distanceToFlip,
          message: `Price within ${distanceToFlip.toFixed(2)}% of gamma flip`,
          actionable: true
        }
      });
    }

    // Check for high-probability scenario triggers
    const scenarioEngine = terminalState.positioning?.scenarioEngine;
    const scenarios = scenarioEngine?.scenarios || [];
    const highProbScenarios = scenarios.filter((s: any) => s.probability > 0.7);
    
    highProbScenarios.forEach((scenario: any) => {
      newEvents.push({
        id: `scenario_${scenario.id}_${now}`,
        type: "SCENARIO_TRIGGER",
        severity: scenario.probability > 0.85 ? "HIGH" : "MEDIUM",
        timestamp: now,
        data: {
          newValue: scenario,
          confidence: scenario.probability,
          message: `High probability scenario: ${scenario.thesis}`,
          actionable: true
        }
      });
    });

    // Check for sweeps/absorption (placeholder - would need real detection logic)
    const orderFlow = terminalState.orderFlow;
    if (orderFlow?.largeSweeps) {
      newEvents.push({
        id: `sweep_${now}`,
        type: "LIQUIDITY_SWEEP",
        severity: "HIGH",
        timestamp: now,
        data: {
          newValue: orderFlow.largeSweeps,
          message: "Large liquidity sweep detected",
          actionable: true
        }
      });
    }

    // Store events and update last state
    this.events.push(...newEvents);
    this.lastState = terminalState;

    // Keep only last 100 events
    if (this.events.length > 100) {
      this.events = this.events.slice(-100);
    }

    return newEvents;
  }

  /**
   * Get recent events for a subscription
   */
  getEvents(subscription: EventSubscription, since?: number): CriticalEvent[] {
    let filtered = this.events;

    // Filter by time
    if (since) {
      filtered = filtered.filter(e => e.timestamp > since);
    }

    // Filter by subscription criteria
    filtered = filtered.filter(e => 
      subscription.eventTypes.includes(e.type) &&
      this.compareSeverity(e.severity, subscription.minSeverity) >= 0
    );

    return filtered;
  }

  /**
   * Add event subscription
   */
  addSubscription(subscription: EventSubscription): void {
    this.subscriptions.push(subscription);
  }

  /**
   * Remove subscription
   */
  removeSubscription(subscriptionId: string): void {
    this.subscriptions = this.subscriptions.filter(s => s.userId === subscriptionId || s.deviceId === subscriptionId);
  }

  /**
   * Compare severity levels
   */
  private compareSeverity(a: string, b: string): number {
    const levels = { LOW: 1, MEDIUM: 2, HIGH: 3, EXTREME: 4 };
    return (levels[a as keyof typeof levels] || 0) - (levels[b as keyof typeof levels] || 0);
  }

  /**
   * Get event statistics
   */
  getEventStats(since?: number) {
    let events = this.events;
    if (since) {
      events = events.filter(e => e.timestamp > since);
    }

    return {
      total: events.length,
      byType: events.reduce((acc, e) => {
        acc[e.type] = (acc[e.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      bySeverity: events.reduce((acc, e) => {
        acc[e.severity] = (acc[e.severity] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    };
  }
}

// Global event manager instance
export const eventManager = new MobileEventManager();
