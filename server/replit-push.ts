/**
 * Replit Push Integration - Real-time terminal state to Replit backend
 * Pushes state every 3 seconds with deduplication and error handling
 */

import { getTerminalState } from "./terminal-state";

interface ReplitMarketState {
  bias: string;
  gamma: string;
  zone: string;
  scenario: string;
  setup: string;
  probability: number;
  outlook?: string;
  timeframe?: string;
  gammaLevel?: number;
  netGamma?: string;
}

interface ReplitAlert {
  id: string;
  text: string;
  status: "active" | "executed";
  type: "price" | "gamma" | "zone" | "absorption" | "scenario";
}

interface ReplitZone {
  label: string;
  price: string;
  type: "resistance" | "support" | "current";
  distance: string;
}

interface ReplitPayload {
  marketState: ReplitMarketState;
  alerts: ReplitAlert[];
  zones: ReplitZone[];
}

class ReplitPushService {
  private lastPayload: string | null = null;
  private lastVisualPayload: string | null = null;
  private interval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly REPLIT_URL = "https://c813f257-1316-4114-9d3f-82ebf0011163-00-2vbfcbfkjn2ef.kirk.replit.dev/api/terminal/push";
  private readonly REPLIT_KEY = "gt_9f2c1d7a4b6e8f1c3a5d9e2b7f4a6c1d";
  private pushCount = 0;
  private skipCount = 0;
  private errorCount = 0;
  private heartbeatCount = 0;
  private lastPushTime = 0;

  private resolveSpot(terminalState: any): number | null {
    const market = terminalState.market || {};
    const sp = market.spotPrice ?? terminalState.ticker?.price ?? terminalState.options?.spot;
    return typeof sp === "number" && Number.isFinite(sp) && sp > 0 ? sp : null;
  }

  /** ZONA: solo gamma flip numérico real → $X,XXX; si no hay → — */
  private formatZoneFromGammaFlip(gammaFlip: number | null | undefined): string {
    if (gammaFlip != null && typeof gammaFlip === "number" && Number.isFinite(gammaFlip) && gammaFlip > 0) {
      return `$${gammaFlip.toLocaleString("en-US")}`;
    }
    return "—";
  }

  private pickGammaFlip(market: any, stored: { gammaFlip?: number | null } | null | undefined): number | null {
    const m = market?.gammaFlip;
    if (m != null && typeof m === "number" && Number.isFinite(m) && m > 0) return m;
    const s = stored?.gammaFlip;
    if (s != null && typeof s === "number" && Number.isFinite(s) && s > 0) return s;
    return null;
  }

  /** SETUP: solo texto real del motor; placeholders / pruebas → — */
  private resolveSetup(terminalState: any): string {
    const raw = terminalState.positioning?.scenarioEngine?.activeSetup;
    if (raw == null) return "—";
    const s = typeof raw === "string" ? raw.trim() : String(raw).trim();
    if (!s) return "—";
    if (/setup_test/i.test(s) || /^setup_test_/i.test(s)) return "—";
    if (/^(no\s*)?definido\.?$/i.test(s)) return "—";
    if (s === "ANÁLISIS EN PROGRESO" || s === "ANALISIS EN PROGRESO") return "—";
    return s;
  }

  /**
   * Zonas clave: callWall, putWall, dealerPivot, gammaMagnets (positioning + levels)
   */
  private buildZones(terminalState: any): ReplitZone[] {
    const positioning = terminalState.positioning || {};
    const levels = terminalState.levels || {};
    const spot = this.resolveSpot(terminalState);
    const hasSpot = spot != null;

    const magnetsFromPos = (positioning as { gammaMagnets?: unknown }).gammaMagnets;
    const magnetsRaw = Array.isArray(magnetsFromPos) && magnetsFromPos.length
      ? magnetsFromPos
      : levels.gammaMagnets ?? [];

    const callWall = positioning.callWall;
    const putWall = positioning.putWall;
    const dealerPivot = positioning.dealerPivot;

    const calcDistance = (price: number): string => {
      if (!hasSpot || !Number.isFinite(price)) return "—";
      const dist = ((price - spot!) / spot!) * 100;
      return dist >= 0 ? `+${dist.toFixed(1)}%` : `${dist.toFixed(1)}%`;
    };

    const fmtPrice = (price: number): string =>
      Number.isFinite(price) ? price.toLocaleString("en-US") : "—";

    const zones: ReplitZone[] = [];
    const seen = new Set<number>();

    const addLevel = (label: string, price: unknown, type: ReplitZone["type"]) => {
      if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return;
      const key = Math.round(price * 100) / 100;
      if (seen.has(key)) return;
      seen.add(key);
      zones.push({
        label,
        price: fmtPrice(price),
        type,
        distance: calcDistance(price),
      });
    };

    if (hasSpot) {
      zones.push({
        label: "PRECIO ACTUAL",
        price: fmtPrice(spot!),
        type: "current",
        distance: "0.0%",
      });
    }

    addLevel("CALL WALL", callWall, "resistance");
    addLevel("PUT WALL", putWall, "support");
    const pivotType: ReplitZone["type"] =
      hasSpot && typeof dealerPivot === "number" && Number.isFinite(dealerPivot)
        ? dealerPivot > spot!
          ? "resistance"
          : "support"
        : "current";
    addLevel("DEALER PIVOT", dealerPivot, pivotType);

    for (const m of magnetsRaw) {
      if (typeof m !== "number" || !Number.isFinite(m) || m <= 0) continue;
      const t: ReplitZone["type"] =
        hasSpot ? (m > spot! ? "resistance" : "support") : "current";
      addLevel("GAMMA MAGNET", m, t);
    }

    if (zones.length === 0) {
      return [];
    }

    return zones
      .sort((a, b) => {
        const distA = Math.abs(parseFloat(a.distance.replace("%", "").replace("+", "")) || 0);
        const distB = Math.abs(parseFloat(b.distance.replace("%", "").replace("+", "")) || 0);
        return distA - distB;
      })
      .slice(0, 12);
  }

  /**
   * Adapt terminal state to Replit contract
   */
  private async adaptTerminalStateToReplit(terminalState: any): Promise<ReplitPayload> {
    const positioning = terminalState.positioning || {};
    const market = terminalState.market || {};
    const scenarios = terminalState.scenarios || [];
    const alertEngine = positioning.alertEngine || {};
    
    // Extract bias from institutional bias engine
    const biasEngine = positioning.institutionalBiasEngine || {};
    const biasType = biasEngine.institutionalBias || "NEUTRAL_CHOP";
    
    // Map bias types to Replit format
    const biasMap: Record<string, string> = {
      "BULLISH_COMPRESSION": "BULLISH",
      "BEARISH_COMPRESSION": "BEARISH", 
      "BULLISH_EXPANSION": "BULLISH",
      "BEARISH_EXPANSION": "BEARISH",
      "FRAGILE_TRANSITION": "NEUTRAL",
      "SQUEEZE_SETUP": "BULLISH",
      "NEUTRAL_CHOP": "NEUTRAL"
    };
    
    // Extract gamma regime from storage (real source of truth)
    const { storage } = await import("./storage.js");
    const realMarketState = await storage.getMarketState();
    
    // Use real gamma regime from storage
    const realGammaRegime = realMarketState?.gammaRegime || "NEUTRAL";
    
    // Map gamma regimes to Replit format
    const gammaMap: Record<string, string> = {
      "LONG GAMMA": "LONG",
      "SHORT GAMMA": "SHORT",
      "TRANSITION": "NEUTRAL",
      "NEUTRAL": "NEUTRAL"
    };
    
    const gammaFlip = this.pickGammaFlip(market, realMarketState);
    const zone = this.formatZoneFromGammaFlip(gammaFlip);
    const setup = this.resolveSetup(terminalState);
    const zones = this.buildZones(terminalState);

    // Get top scenario
    const topScenario = scenarios.length > 0 
      ? scenarios.sort((a: any, b: any) => (b.probability || 0) - (a.probability || 0))[0]
      : null;
    
    const marketState: ReplitMarketState = {
      bias: biasMap[biasType] || "NEUTRAL",
      gamma: gammaMap[realGammaRegime] || "NEUTRAL",
      zone,
      scenario: topScenario?.thesis || "—",
      setup,
      probability: Math.round(topScenario?.probability || 50),
      outlook: biasEngine.biasHorizon === "INTRADAY" ? "INTRADAY" : "SWING",
      timeframe: "15M - 1H",
      gammaLevel: realMarketState?.totalGex ? Math.round(realMarketState.totalGex / 1000000) : 0,
      netGamma: realMarketState?.totalGex ? `$${(realMarketState.totalGex / 1000000000).toFixed(1)}B` : "—"
    };
    
    // Build alerts
    const alerts: ReplitAlert[] = [];
    const activeAlerts = alertEngine.activeAlerts || [];
    
    // Add scenario alert if high probability
    if (topScenario && topScenario.probability > 70) {
      alerts.push({
        id: `scenario-${topScenario.id}`,
        text: topScenario.thesis,
        status: "active",
        type: "scenario"
      });
    }
    
    // Add gamma flip proximity alert
    const distanceToFlip = realMarketState?.distanceToFlip;
    const spot = this.resolveSpot(terminalState) ?? 0;
    const distanceToFlipPct = spot && distanceToFlip ? (distanceToFlip / spot) * 100 : 0;
    if (distanceToFlipPct > 0 && distanceToFlipPct < 5) {
      alerts.push({
        id: "gamma-flip-proximity",
        text: `Precio dentro del ${distanceToFlipPct.toFixed(1)}% del gamma flip`,
        status: "active",
        type: "gamma"
      });
    }
    
    // Add cascade risk alert
    const cascadeEngine = positioning.liquidityCascadeEngine || {};
    if (cascadeEngine.cascadeRisk === "HIGH" || cascadeEngine.cascadeRisk === "EXTREME") {
      alerts.push({
        id: "cascade-risk",
        text: `Riesgo de cascada: ${cascadeEngine.cascadeRisk}`,
        status: "active", 
        type: "price"
      });
    }
    
    return {
      marketState,
      alerts,
      zones
    };
  }

  /**
   * Send payload to Replit backend
   */
  private async sendPayload(payload: ReplitPayload): Promise<void> {
    try {
      console.log("[SENDER PUSH FINAL]", payload);
      const timestamp = new Date().toISOString();
      console.log(`[PUSH SENT] #${this.pushCount + 1} to ${this.REPLIT_URL}`);
      console.log(`[PUSH SENT] Timestamp: ${timestamp}`);
      console.log(`[PUSH SENT] Full payload:`, {
        timestamp,
        marketState: {
          bias: payload.marketState.bias,
          gamma: payload.marketState.gamma,
          zone: payload.marketState.zone,
          scenario: payload.marketState.scenario,
          setup: payload.marketState.setup,
          probability: payload.marketState.probability,
          outlook: payload.marketState.outlook,
          timeframe: payload.marketState.timeframe,
          gammaLevel: payload.marketState.gammaLevel,
          netGamma: payload.marketState.netGamma
        },
        alerts: payload.alerts,
        zones: payload.zones
      });
      
      const response = await fetch(this.REPLIT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Terminal-Key": this.REPLIT_KEY
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      if (response.status === 200) {
        this.pushCount++;
        console.log(`[PUSH SUCCESS] #${this.pushCount} - Response 200 OK`);
        return;
      }

      // Handle error responses
      const responseText = await response.text();
      this.errorCount++;
      
      switch (response.status) {
        case 401:
          console.error(`[PUSH ERROR] #${this.errorCount} - 401 Invalid API key`);
          break;
        case 400:
          console.error(`[PUSH ERROR] #${this.errorCount} - 400 Invalid payload:`, responseText);
          break;
        case 503:
          console.error(`[PUSH ERROR] #${this.errorCount} - 503 Push not configured`);
          break;
        default:
          console.error(`[PUSH ERROR] #${this.errorCount} - ${response.status} Unexpected:`, responseText);
      }
    } catch (error) {
      this.errorCount++;
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          console.error(`[PUSH ERROR] #${this.errorCount} - Timeout exceeded 10 seconds`);
        } else if (error.message.includes("ENOTFOUND") || error.message.includes("ECONNREFUSED")) {
          console.error(`[PUSH ERROR] #${this.errorCount} - Network error: ${error.message}`);
        } else {
          console.error(`[PUSH ERROR] #${this.errorCount} - Unexpected: ${error.message}`);
        }
      } else {
        console.error(`[PUSH ERROR] #${this.errorCount} - Unknown:`, error);
      }
    }
  }

  /**
   * Check if payload changed from last sent (visual fields only)
   */
  private hasVisualPayloadChanged(payload: ReplitPayload): boolean {
    // Only compare fields that are visually relevant for the app
    const visualPayload = {
      bias: payload.marketState.bias,
      gamma: payload.marketState.gamma,
      zone: payload.marketState.zone,
      scenario: payload.marketState.scenario,
      setup: payload.marketState.setup,
      probability: payload.marketState.probability,
      outlook: payload.marketState.outlook,
      timeframe: payload.marketState.timeframe,
      gammaLevel: payload.marketState.gammaLevel,
      netGamma: payload.marketState.netGamma,
      alerts: payload.alerts,
      zones: payload.zones
    };
    
    const visualString = JSON.stringify(visualPayload);
    if (this.lastVisualPayload === null) {
      this.lastVisualPayload = visualString;
      return true;
    }
    
    if (visualString === this.lastVisualPayload) {
      return false;
    }
    
    this.lastVisualPayload = visualString;
    return true;
  }

  /**
   * Check if payload changed from last sent (all fields)
   */
  private hasPayloadChanged(payload: ReplitPayload): boolean {
    const payloadString = JSON.stringify(payload);
    if (this.lastPayload === null) {
      this.lastPayload = payloadString;
      return true;
    }
    
    if (payloadString === this.lastPayload) {
      return false;
    }
    
    this.lastPayload = payloadString;
    return true;
  }

  /**
   * Check if heartbeat should trigger (60 seconds since last push)
   */
  private shouldHeartbeat(): boolean {
    const now = Date.now();
    const timeSinceLastPush = now - this.lastPushTime;
    return timeSinceLastPush >= 60000; // 60 seconds
  }

  /**
   * Push current terminal state to Replit
   */
  private async pushCurrentState(): Promise<void> {
    try {
      console.log(`[PUSH TICK] Checking for state changes...`);
      
      // Get current terminal state
      const terminalState = await getTerminalState();
      
      if (!terminalState) {
        console.log(`[PUSH TICK] No terminal state available`);
        return;
      }
      
      // Adapt to Replit format
      const payload = await this.adaptTerminalStateToReplit(terminalState);
      
      // Check if visual data changed
      const visualChanged = this.hasVisualPayloadChanged(payload);
      const shouldHeartbeat = this.shouldHeartbeat();
      
      if (!visualChanged && !shouldHeartbeat) {
        this.skipCount++;
        console.log(`[PUSH SKIPPED NO CHANGE] #${this.skipCount} - State unchanged`);
        return;
      }
      
      if (visualChanged) {
        console.log(`[PUSH TICK] Visual state changed, sending push...`);
      } else if (shouldHeartbeat) {
        this.heartbeatCount++;
        console.log(`[PUSH HEARTBEAT] #${this.heartbeatCount} - 60s safety push...`);
      }
      
      // Send to Replit
      await this.sendPayload(payload);
      this.lastPushTime = Date.now();
      
    } catch (error) {
      console.error("[PUSH TICK] Failed to get terminal state:", error);
    }
  }

  /**
   * Start automatic pushing every 3 seconds
   */
  start(): void {
    if (this.interval) {
      console.log("[PUSH BOOT] Service already running");
      return; // Already running
    }
    
    console.log("[PUSH BOOT] Starting Replit push service...");
    console.log(`[PUSH BOOT] Target URL: ${this.REPLIT_URL}`);
    console.log(`[PUSH BOOT] API Key: ${this.REPLIT_KEY.substring(0, 10)}...`);
    
    // Initial push
    this.pushCurrentState();
    
    // Schedule every 3 seconds
    this.interval = setInterval(() => {
      this.pushCurrentState();
    }, 3000);
    
    console.log("[PUSH BOOT] Service started - interval 3000ms");
  }

  /**
   * Manual test method for debugging
   */
  async sendTestPush(): Promise<void> {
    console.log("[PUSH TEST] Manual test push starting...");
    
    // Reset last payload to force send
    this.lastPayload = null;
    
    const testPayload: ReplitPayload = {
      marketState: {
        bias: "NEUTRAL",
        gamma: "NEUTRAL",
        zone: "—",
        scenario: "—",
        setup: "—",
        probability: 0,
        outlook: "—",
        timeframe: "—",
        gammaLevel: 0,
        netGamma: "—"
      },
      alerts: [],
      zones: []
    };
    
    await this.sendPayload(testPayload);
  }

  /**
   * Force real terminal state push
   */
  async forceRealPush(): Promise<void> {
    console.log("[FORCE PUSH] Forcing real terminal state push...");
    
    // Reset both payloads to force send
    this.lastPayload = null;
    this.lastVisualPayload = null;
    this.lastPushTime = 0;
    
    await this.pushCurrentState();
  }

  /**
   * Stop automatic pushing
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      running: this.interval !== null,
      lastPayload: this.lastPayload ? JSON.parse(this.lastPayload) : null
    };
  }
}

// Global instance
export const replitPushService = new ReplitPushService();
