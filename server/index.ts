import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path from "path";

console.log("[BOOT] Starting server initialization...");

dotenv.config({
  path: path.resolve(process.cwd(), ".env"),
});

console.log("[ENV] cwd:", process.cwd());
console.log("[ENV] OPENAI key exists:", !!process.env.OPENAI_API_KEY);
console.log("[ENV] DATABASE_URL exists:", !!process.env.DATABASE_URL);
console.log("[ENV] DATABASE_URL length:", process.env.DATABASE_URL?.length || 0);

const rawKey = process.env.OPENAI_API_KEY || "";
const visiblePrefix = rawKey ? rawKey.slice(0, 8) : "";
console.log("[ENV] OPENAI key prefix:", visiblePrefix);
console.log("[ENV] OPENAI key length:", rawKey.length);

console.log("[BOOT] Creating Express app and HTTP server...");
const app = express();
const httpServer = createServer(app);
console.log("[BOOT] Express app and HTTP server created");

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      // Avoid stringifying large JSON payloads for successful requests (prevents memory spikes/OOM).
      if (capturedJsonResponse && res.statusCode >= 400) {
        try {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        } catch {
          // ignore
        }
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  console.log("[BOOT] Runtime entrypoint: server/index.ts");
  
  console.log("[BOOT] Importing routes and endpoints...");
  const { registerRoutes } = await import("./routes");
  const { serveStatic } = await import("./static");
  const { setupMobileDirectEndpoint } = await import("./mobile-direct-endpoint");
  console.log("[BOOT] Routes and endpoints imported");

  // Register ALL API routes FIRST - before any Vite middleware
  console.log("[BOOT] Registering API routes...");
  await registerRoutes(httpServer, app);
  setupMobileDirectEndpoint(app);
  console.log("[BOOT] API routes registered");
  
  // Log all registered routes for debugging
  console.log("[Server] Registered API routes:");
  if (app._router && app._router.stack) {
    app._router.stack.forEach((middleware: any) => {
      if (middleware.route) {
        console.log(`  ${Object.keys(middleware.route.methods).join(',').toUpperCase()} ${middleware.route.path}`);
      }
    });
  }

  const hasOpenaiKey = !!process.env.OPENAI_API_KEY;
  console.log("OPENAI key loaded:", hasOpenaiKey);

  if (!hasOpenaiKey) {
    console.error("[OPENAI] OPENAI_API_KEY is missing. The /api/ai/chat endpoint will return { error: \"OPENAI_API_KEY_MISSING\" }.");
  }
  console.log("[BOOT] API key validation complete");

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  console.log("[BOOT] Setting up Vite/Static middleware...");
  if (process.env.NODE_ENV === "production") {
    console.log("[BOOT] Production mode - serving static files");
    serveStatic(app);
  } else {
    console.log("[BOOT] Development mode - setting up Vite...");
    const { setupVite } = await import("./vite");
    console.log("[BOOT] Calling setupVite...");
    await setupVite(httpServer, app);
    console.log("[BOOT] Vite setup complete");
  }
  console.log("[BOOT] Middleware setup complete");

  // Health check endpoint
  console.log("[BOOT] Registering health endpoint...");
  app.get("/health", (_req, res) => {
    console.log("[Server] Health endpoint hit");
    res.status(200).json({
      status: "ok",
      message: "GoodTrading backend is running",
      timestamp: new Date().toISOString(),
    });
  });
  console.log("[BOOT] Health endpoint registered");

  const port = parseInt(process.env.PORT || "5000", 10);
  console.log(`[BOOT] Starting server on port ${port}...`);

  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `[BOOT] Port ${port} is already in use. Stop the other dev server (Get-NetTCPConnection -LocalPort ${port}) and run npm run dev again.`,
      );
      process.exit(1);
    }
    throw err;
  });

  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
    },
    () => {
      console.log(`[BOOT] Server listening on port ${port}`);
      log(`serving on port ${port}`);
    },
  );

  void (async () => {
    console.log("[BOOT] Starting mobile state cache...");
    const { startMobileCache } = await import("./mobile-cache");
    startMobileCache();
    console.log("[BOOT] Mobile cache started");

    console.log("[BOOT] Starting Replit push service...");
    try {
      const { replitPushService } = await import("./replit-push");
      console.log("[BOOT] Replit push service imported successfully");
      replitPushService.start();
      console.log("[BOOT] Replit push service start() called");
    } catch (error) {
      console.error("[BOOT] Failed to start Replit push service:", error);
    }
  })();
})();
