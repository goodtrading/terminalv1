/**
 * Mobile API Endpoint - Exposes terminal state for mobile app
 * Route: GET /api/mobile/terminal-state
 */

import { getTerminalState } from "./terminal-state";
import { createMobileEndpoint } from "./mobile-adapter";

export function setupMobileEndpoint(app: any) {
  app.get("/api/mobile/terminal-state", async (_req: any, res: any) => {
    try {
      console.log("[Mobile API] Request received for terminal state");
      
      // Get the full terminal state
      const terminalState = await getTerminalState();
      
      // Convert to mobile-friendly format
      const mobileResponse = createMobileEndpoint(terminalState);
      
      console.log("[Mobile API] Response sent", {
        timestamp: mobileResponse.timestamp,
        spot: mobileResponse.data.market.spot,
        bias: mobileResponse.data.bias.type,
        alertsCount: mobileResponse.data.alerts.length
      });
      
      res.json(mobileResponse);
    } catch (error) {
      console.error("[Mobile API] Error:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to fetch terminal state",
        timestamp: Date.now()
      });
    }
  });
  
  // Health check endpoint
  app.get("/api/mobile/health", (_req: any, res: any) => {
    res.json({
      status: "healthy",
      service: "terminal-mobile-api",
      timestamp: Date.now()
    });
  });
  
  console.log("[Mobile API] Endpoints registered:");
  console.log("  GET /api/mobile/terminal-state - Full terminal state for mobile");
  console.log("  GET /api/mobile/health - Health check");
}
