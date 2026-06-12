/** Shared runtime env helpers for deploy-safe behavior (Railway, local, etc.). */

export const isProduction = process.env.NODE_ENV === "production";
export const isDev = !isProduction;

export function envBool(key: string, fallback = false): boolean {
  const v = process.env[key];
  if (v == null || v === "") return fallback;
  return v === "true" || v === "1";
}

export function isHeatmapEnabled(): boolean {
  return envBool("HEATMAP_ENABLED", true);
}

export function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  if (v == null || v === "") return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Loopback base URL for server-to-server calls in the same process/container. */
export function getInternalApiBaseUrl(): string {
  const explicit =
    process.env.INTERNAL_API_BASE_URL?.trim() ||
    process.env.API_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const port = process.env.PORT || "5000";
  return `http://127.0.0.1:${port}`;
}

/** Known production frontends — merged with CORS_ALLOWED_ORIGINS and RAILWAY_PUBLIC_DOMAIN. */
const PRODUCTION_CORS_DEFAULTS = [
  "https://terminalv1-production.up.railway.app",
  "https://app-movil-production-5e55.up.railway.app",
];

export function getAllowedCorsOrigins(): string[] {
  const fromEnv = (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (isProduction) {
    const origins = new Set<string>([...PRODUCTION_CORS_DEFAULTS, ...fromEnv]);
    const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
    if (railwayDomain) {
      origins.add(`https://${railwayDomain}`);
    }
    return [...origins];
  }

  const devDefaults = [
    "http://localhost:5000",
    "http://localhost:8081",
    "http://localhost:8082",
    "http://localhost:8083",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:19006",
    "http://127.0.0.1:5000",
    "http://127.0.0.1:8081",
    "http://127.0.0.1:8082",
    "http://127.0.0.1:8083",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
  ];
  return [...new Set([...devDefaults, ...fromEnv])];
}

export function shouldEnableReplitPush(): boolean {
  return envBool("ENABLE_REPLIT_PUSH", false);
}

export function shouldEnableBookmapRailwayDiag(): boolean {
  if (!isProduction) return envBool("ENABLE_BOOKMAP_RAILWAY_DIAG", true);
  return envBool("ENABLE_BOOKMAP_RAILWAY_DIAG", false);
}

export function logBootEnvPresence(): void {
  if (isProduction) {
    console.log("[ENV] boot", {
      nodeEnv: process.env.NODE_ENV,
      port: process.env.PORT ?? "(default 5000)",
      database: Boolean(process.env.DATABASE_URL),
      jwt: Boolean(process.env.JWT_SECRET || process.env.SAAS_JWT_SECRET),
      openai: Boolean(process.env.OPENAI_API_KEY),
      heatmapEnabled: isHeatmapEnabled(),
      corsOrigins: getAllowedCorsOrigins().length,
      railwayDomain: process.env.RAILWAY_PUBLIC_DOMAIN ?? null,
    });
    console.log("[ENV] HEATMAP_ENABLED:", isHeatmapEnabled());
    return;
  }

  console.log("[ENV] cwd:", process.cwd());
  console.log("[ENV] OPENAI key exists:", !!process.env.OPENAI_API_KEY);
  console.log("[ENV] DATABASE_URL exists:", !!process.env.DATABASE_URL);
  console.log("[ENV] SESSION_SECRET exists:", !!process.env.SESSION_SECRET);
  console.log("[ENV] JWT_SECRET exists:", !!process.env.JWT_SECRET);
  console.log("[ENV] HEATMAP_ENABLED:", isHeatmapEnabled());
}
