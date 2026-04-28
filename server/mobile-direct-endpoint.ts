/**
 * Mobile Direct State Endpoint
 * GET /api/mobile/state
 * 
 * Direct real-time state from terminal without intermediaries
 */

import { getTerminalState } from "./terminal-state";
import { adaptTerminalStateForMobile } from "./mobile-adapter";

export function setupMobileDirectEndpoint(app: any) {
  app.get("/api/mobile/state", async (_req: any, res: any) => {
    try {
      console.log("[Mobile Direct] Request received for real-time terminal state");
      
      // 1. Get real-time terminal state directly
      const terminalState = await getTerminalState();
      
      // 2. Adapt for mobile consumption
      const mobileState = adaptTerminalStateForMobile(terminalState);
      
      // 3. Return direct response
      const response = {
        status: "success",
        data: mobileState,
        timestamp: Date.now(),
        source: "real-time-terminal"
      };
      
      console.log("[Mobile Direct] Real-time state sent", {
        timestamp: response.timestamp,
        spot: mobileState.market.spot,
        bias: mobileState.bias.type,
        regime: mobileState.market.gammaRegime,
        alertsCount: mobileState.alerts.length,
        scenariosCount: mobileState.scenarios.length
      });
      
      res.json(response);
      
    } catch (error) {
      console.error("[Mobile Direct] Error:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to fetch real-time terminal state",
        timestamp: Date.now(),
        source: "real-time-terminal"
      });
    }
  });
  
  console.log("[Mobile Direct] Endpoint registered: GET /api/mobile/state");
}
