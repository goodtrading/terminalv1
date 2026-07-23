import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";
import { injectPublicSeoHtml } from "./seo/injectPublicSeoHtml";

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
        const text = typeof msg === "string" ? msg : String(msg);
        if (
          text.includes("error while updating dependencies") ||
          text.includes("UNKNOWN: unknown error, read") ||
          text.includes("import-analysis")
        ) {
          console.warn(
            "[Vite] Non-fatal dev error (OneDrive/sync). Run: npm run dev:clean && npm run dev",
          );
          return;
        }
        console.error("[Vite] Fatal error — server stays up; fix and refresh browser.");
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use((req, res, next) => {
    if (req.path === "/health" || req.path.startsWith("/api")) {
      return next();
    }
    return vite.middlewares(req, res, next);
  });

  app.use((req, res, next) => {
    if (req.path.startsWith("/api") || req.path === "/health") {
      if (!res.headersSent) {
        res.status(404).type("application/json").json({
          success: false,
          code: "API_NOT_FOUND",
          message: `No API handler for ${req.method} ${req.path}`,
        });
      }
      return;
    }
    return vite
      .transformIndexHtml(
        req.url,
        fs.readFileSync(path.resolve(__dirname, "../client/index.html"), "utf-8"),
      )
      .then((html) => {
        const withSeo = injectPublicSeoHtml(html, req.path);
        res.type("html").send(withSeo);
      })
      .catch(next);
  });
}
