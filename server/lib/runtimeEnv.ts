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

function normalizeCorsOrigin(origin: string): string {
  const trimmed = origin.trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/+$/, "");
}

/** Parse comma-separated CORS origins from env (e.g. CORS_ALLOWED_ORIGINS). */
export function parseCorsOriginsFromEnv(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return Array.from(
    new Set(
      raw
        .split(",")
        .map(normalizeCorsOrigin)
        .filter(Boolean),
    ),
  );
}

function isRailwayDeploy(): boolean {
  return Boolean(
    process.env.RAILWAY_ENVIRONMENT ||
      process.env.RAILWAY_PUBLIC_DOMAIN ||
      process.env.RAILWAY_PROJECT_ID ||
      process.env.RAILWAY_SERVICE_ID,
  );
}

export function getAllowedCorsOrigins(): string[] {
  const fromEnv = parseCorsOriginsFromEnv(process.env.CORS_ALLOWED_ORIGINS);
  const useProductionDefaults = isProduction || isRailwayDeploy();

  if (useProductionDefaults) {
    const origins = new Set<string>([
      ...PRODUCTION_CORS_DEFAULTS.map(normalizeCorsOrigin),
      ...fromEnv,
    ]);
    const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
    if (railwayDomain) {
      origins.add(normalizeCorsOrigin(`https://${railwayDomain}`));
    }
    return Array.from(origins);
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
  return Array.from(new Set([...devDefaults.map(normalizeCorsOrigin), ...fromEnv]));
}

/** Boot-time log of resolved CORS allowlist (safe to print — public frontend URLs). */
export function logAllowedCorsOrigins(): void {
  const origins = getAllowedCorsOrigins();
  const fromEnv = parseCorsOriginsFromEnv(process.env.CORS_ALLOWED_ORIGINS);
  console.log("[BOOT] CORS configuration", {
    allowedCount: origins.length,
    fromEnvCount: fromEnv.length,
    productionDefaults: isProduction || isRailwayDeploy(),
    railwayPublicDomain: process.env.RAILWAY_PUBLIC_DOMAIN?.trim() ?? null,
    allowedOrigins: origins,
  });
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
      corsFromEnv: parseCorsOriginsFromEnv(process.env.CORS_ALLOWED_ORIGINS).length,
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
