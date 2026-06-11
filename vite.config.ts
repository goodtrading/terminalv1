import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import os from "os";
import fs from "fs";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { metaImagesPlugin } from "./vite-plugin-meta-images";

const projectRoot = import.meta.dirname;
const clientRoot = path.resolve(projectRoot, "client");
const onOneDrive = /OneDrive/i.test(projectRoot);
const tauriConfig = JSON.parse(
  fs.readFileSync(path.resolve(projectRoot, "src-tauri/tauri.conf.json"), "utf8"),
) as { version?: string };

/** Keep Vite cache outside synced folders (OneDrive breaks dep pre-bundling). */
const viteCacheDir =
  process.env.VITE_CACHE_DIR?.trim() ||
  path.join(os.tmpdir(), "goodtrading-vite-cache");

if (onOneDrive) {
  console.warn(
    "[Vite] Project is under OneDrive — move to C:\\Dev\\Terminal-Goodtrading-stable to avoid UNKNOWN read errors.",
  );
}

export default defineConfig({
  cacheDir: viteCacheDir,
  define: {
    __GOODTRADING_APP_VERSION__: JSON.stringify(tauriConfig.version ?? "0.1.0"),
  },
  plugins: [
    react(),
    runtimeErrorOverlay(),
    tailwindcss(),
    metaImagesPlugin(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(clientRoot, "src"),
      "@shared": path.resolve(projectRoot, "shared"),
      "@assets": path.resolve(projectRoot, "attached_assets"),
    },
  },
  optimizeDeps: onOneDrive
    ? { noDiscovery: true, include: [], holdUntilCrawlEnd: false }
    : {
        entries: [path.resolve(clientRoot, "index.html")],
        include: [
          "react",
          "react-dom",
          "react-dom/client",
          "react/jsx-dev-runtime",
          "@tanstack/react-query",
          "wouter",
        ],
        holdUntilCrawlEnd: false,
      },
  css: {
    postcss: {
      plugins: [],
    },
  },
  root: clientRoot,
  build: {
    outDir: path.resolve(projectRoot, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
    fs: {
      strict: false,
      allow: [projectRoot, clientRoot],
    },
    watch: {
      usePolling:
        process.env.VITE_USE_POLLING === "true" || process.platform === "win32",
    },
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:5000",
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('Vite proxy error:', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Vite proxy request:', req.method, req.url, '->', proxyReq.getHeader('host') + proxyReq.path);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Vite proxy response:', proxyRes.statusCode, req.method, req.url);
          });
        }
      }
    }
  },
});
