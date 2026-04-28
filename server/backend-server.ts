/**
 * Backend Server - Express API independiente
 * Puerto 5001 - Sin Vite middleware
 * Solo rutas API puras
 */

import express, { type Request, Response } from "express";
import { createServer } from "http";
import { getTerminalState } from "./terminal-state";
import { adaptTerminalStateForMobile } from "./mobile-adapter";

const app = express();
const httpServer = createServer(app);

// Middleware básico - SIN VITE
app.use((req, res, next) => {
  // CORS manual para desarrollo
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      console.log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

// API Routes

// Mobile endpoint - Estado adaptado para mobile
app.get("/api/mobile/state", async (req: Request, res: Response) => {
  try {
    console.log("[Backend API] Mobile endpoint hit:", req.method, req.path);
    
    // 1. Get real-time terminal state
    const terminalState = await getTerminalState();
    
    // 2. Adapt for mobile consumption
    const mobileState = adaptTerminalStateForMobile(terminalState);
    
    // 3. Return mobile-compatible response
    const response = {
      status: "success",
      data: mobileState,
      timestamp: Date.now(),
      source: "real-time-terminal"
    };
    
    console.log("[Backend API] Mobile state sent", {
      timestamp: response.timestamp,
      spot: mobileState.market.spot,
      bias: mobileState.bias.type,
      regime: mobileState.market.gammaRegime,
      alertsCount: mobileState.alerts.length,
      scenariosCount: mobileState.scenarios.length
    });
    
    res.json(response);
    
  } catch (error) {
    console.error("[Backend API] Mobile endpoint error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch mobile terminal state",
      timestamp: Date.now(),
      source: "real-time-terminal"
    });
  }
});

// Terminal endpoint - Estado completo del terminal
app.get("/api/terminal/state", async (req: Request, res: Response) => {
  try {
    console.log("[Backend API] Terminal endpoint hit:", req.method, req.path);
    
    const terminalState = await getTerminalState();
    
    console.log("[Backend API] Terminal state sent", {
      timestamp: Date.now(),
      spot: terminalState.ticker?.price,
      regime: terminalState.market?.gammaRegime,
      totalGex: terminalState.market?.totalGex
    });
    
    res.json(terminalState);
    
  } catch (error) {
    console.error("[Backend API] Terminal endpoint error:", error);
    res.status(500).json({
      error: "Failed to fetch terminal state",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// Health check
app.get("/api/health", (req: Request, res: Response) => {
  res.json({
    status: "healthy",
    service: "terminal-backend-api",
    timestamp: Date.now(),
    port: 5001
  });
});

// Error handling
app.use((err: any, _req: Request, res: Response, next: any) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  console.error("[Backend API] Error:", err);

  if (res.headersSent) {
    return next(err);
  }

  return res.status(status).json({ 
    status: "error", 
    message,
    timestamp: Date.now()
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({
      status: "error",
      message: `API endpoint not found: ${req.method} ${req.path}`,
      timestamp: Date.now()
    });
  }
  
  // No servir frontend - este es solo backend
  res.status(404).json({
    status: "error", 
    message: "Backend API only - no frontend served here",
    timestamp: Date.now()
  });
});

// Start server
const PORT = 5002;
httpServer.listen(
  {
    port: PORT,
    host: "0.0.0.0",
  },
  () => {
    console.log(`[Backend API] Server running on port ${PORT}`);
    console.log(`[Backend API] Available endpoints:`);
    console.log(`  GET http://localhost:${PORT}/api/mobile/state`);
    console.log(`  GET http://localhost:${PORT}/api/terminal/state`);
    console.log(`  GET http://localhost:${PORT}/api/health`);
    console.log(`[Backend API] Pure Express - No Vite middleware interference`);
  }
);

export { app, httpServer };
