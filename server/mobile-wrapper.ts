/**
 * Mobile Wrapper - Uses existing /api/terminal/state and adapts for mobile
 * Temporary solution while Vite catch-all issue is resolved
 */

import { adaptTerminalStateForMobile } from "./mobile-adapter";

export function setupMobileWrapperEndpoint(app: any) {
  app.get("/api/mobile/state", async (_req: any, res: any) => {
    try {
      console.log("[Mobile Wrapper] Request received - using terminal/state endpoint");
      
      // Get the existing terminal state (this endpoint works)
      const terminalStateResponse = await fetch("http://localhost:5000/api/terminal/state");
      const terminalState = await terminalStateResponse.json();
      
      // Adapt for mobile consumption
      const mobileState = adaptTerminalStateForMobile(terminalState);
      
      // Return mobile-compatible response
      const response = {
        status: "success",
        data: mobileState,
        timestamp: Date.now(),
        source: "real-time-terminal"
      };
      
      console.log("[Mobile Wrapper] Mobile state sent", {
        timestamp: response.timestamp,
        spot: mobileState.market.spot,
        bias: mobileState.bias.type,
        regime: mobileState.market.gammaRegime,
        alertsCount: mobileState.alerts.length,
        scenariosCount: mobileState.scenarios.length
      });
      
      res.json(response);
      
    } catch (error) {
      console.error("[Mobile Wrapper] Error:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to fetch mobile terminal state",
        timestamp: Date.now(),
        source: "real-time-terminal"
      });
    }
  });
  
  console.log("[Mobile Wrapper] Endpoint registered: GET /api/mobile/state (wrapper approach)");
}
