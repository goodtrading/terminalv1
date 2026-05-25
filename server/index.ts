import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path from "path";

function safeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function safeErrorStack(err: unknown): string | undefined {
  if (err instanceof Error) return err.stack;
  return undefined;
}

process.on("uncaughtException", (err) => {
  console.error("[process] uncaughtException", {
    message: safeErrorMessage(err),
    stack: safeErrorStack(err)?.split("\n").slice(0, 16).join("\n"),
  });
  if (process.env.NODE_ENV !== "production") {
    process.exit(1);
  }
});

process.on("unhandledRejection", (reason) => {
  console.error("[process] unhandledRejection", {
    message: safeErrorMessage(reason),
    stack: safeErrorStack(reason)?.split("\n").slice(0, 16).join("\n"),
  });
});

console.log("[startup] GoodTrading server starting");
console.log("[BOOT] Starting server initialization...");

dotenv.config({
  path: path.resolve(process.cwd(), ".env"),
});

console.log("[ENV] cwd:", process.cwd());
console.log("[ENV] OPENAI key exists:", !!process.env.OPENAI_API_KEY);
console.log("[ENV] DATABASE_URL exists:", !!process.env.DATABASE_URL);
console.log("[ENV] DATABASE_URL length:", process.env.DATABASE_URL?.length || 0);
console.log("[ENV] SESSION_SECRET exists:", !!process.env.SESSION_SECRET);
console.log("[ENV] JWT_SECRET exists:", !!process.env.JWT_SECRET);

// Log DATABASE_URL host hint (censored) for Railway debugging
if (process.env.DATABASE_URL) {
  try {
    const url = new URL(process.env.DATABASE_URL);
    const hostname = url.hostname;
    const censoredHostname = hostname.replace(/^[^.]+\./, "***.");
    console.log("[ENV] DATABASE_URL host hint:", censoredHostname);
  } catch {
    console.log("[ENV] DATABASE_URL host hint: (invalid URL format)");
  }
}

const bingxEncKey = process.env.BINGX_CREDENTIAL_ENCRYPTION_KEY?.trim() ?? "";
console.log(
  "[config] BingX encryption:",
  bingxEncKey.length >= 16 ? "configured" : "missing",
);
console.log("[config] live trading: locked (read-only / risk guard)");

const rawKey = process.env.OPENAI_API_KEY || "";
const visiblePrefix = rawKey ? rawKey.slice(0, 8) : "";
console.log("[ENV] OPENAI key prefix:", visiblePrefix);
console.log("[ENV] OPENAI key length:", rawKey.length);

function jsonApiNotFound(res: Response, method: string, path: string): void {
  res.status(404).type("application/json").json({
    success: false,
    code: "API_NOT_FOUND",
    message: `No API handler for ${method} ${path}`,
  });
}

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
  try {
  console.log("[BOOT] Runtime entrypoint: server/index.ts");
  
  console.log("[BOOT] Importing routes and endpoints...");
  const { registerRoutes } = await import("./routes");
  const { serveStatic } = await import("./static");
  const { setupMobileDirectEndpoint } = await import("./mobile-direct-endpoint");
  console.log("[BOOT] Routes and endpoints imported");

  try {
    const { logBootEnvSummary, logGoodTradingBuildStamp, warmupPaperStorage } =
      await import("./services/system/bootDiagnostics");
    logGoodTradingBuildStamp();
    logBootEnvSummary();
    warmupPaperStorage();
    const { readStorageWarmup } = await import("./services/system/auditLogService");
    readStorageWarmup();
    console.log("[storage] ready");
  } catch (storageErr) {
    console.warn(
      "[storage] audit warmup failed (non-fatal):",
      safeErrorMessage(storageErr),
    );
  }

  console.log("[BOOT] Registering live API routes (early)...");
  const { registerLiveRoutes } = await import("./routes/live.routes");
  registerLiveRoutes(app);

  // Health check endpoints - register IMMEDIATELY for Railway healthcheck
  console.log("[BOOT] Registering health endpoints...");
  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      message: "GoodTrading backend is running",
      timestamp: new Date().toISOString(),
    });
  });
  app.get("/api/healthz", (_req, res) => {
    res.status(200).json({
      ok: true,
      status: "healthy",
      service: "terminal",
      timestamp: new Date().toISOString(),
    });
  });
  console.log("[BOOT] Health endpoints registered");

  // Start listening IMMEDIATELY - Railway healthcheck needs this
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
      console.log(`[startup] listening on port ${port}`);
      console.log(`[BOOT] Server listening on port ${port}`);
      log(`serving on port ${port}`);
    },
  );

  // Continue with async initialization AFTER server is listening
  console.log("[BOOT] Registering API routes...");
  await registerRoutes(httpServer, app);
  setupMobileDirectEndpoint(app);
  console.log("[BOOT] API routes registered");

  app.use((req, res, next) => {
    if (res.headersSent) return next();
    const p = req.path ?? "";
    if (!p.startsWith("/api")) return next();
    jsonApiNotFound(res, req.method, p);
  });
  
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

  // Background services (start after server is listening)
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
  } catch (bootErr) {
    console.error("[fatal] server bootstrap failed:", safeErrorMessage(bootErr));
    const stack = safeErrorStack(bootErr);
    if (stack) console.error(stack.split("\n").slice(0, 16).join("\n"));
    process.exit(1);
  }
})();
