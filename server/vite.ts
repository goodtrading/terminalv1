import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const viteLogger = createLogger();

export async function setupVite(server: Server, app: Express) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server, path: "/vite-hmr" },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use((req, res, next) => {
    // Skip "/health" requests - let Express handle them
    if (req.path === "/health") {
      return next();
    }
    // Pass other requests to Vite
    return vite.middlewares(req, res, next);
  });

  // Fallback to serve index.html for frontend routes
  app.use((req, res, next) => {
    // Skip API routes and health
    if (req.path.startsWith("/api") || req.path === "/health") {
      return next();
    }
    // Serve frontend HTML for all other routes
    return vite.transformIndexHtml(req.url, fs.readFileSync(path.resolve(__dirname, "../client/index.html"), "utf-8"))
      .then(html => res.send(html))
      .catch(next);
  });
}
