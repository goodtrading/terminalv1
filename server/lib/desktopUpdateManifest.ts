import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export type DesktopUpdateConfig = {
  latestVersion: string;
  minSupportedVersion: string;
  mandatory: boolean;
  downloadUrl: string;
  releaseNotes: string[];
  publishedAt: string | null;
};

const DEFAULT_DESKTOP_UPDATE_CONFIG: DesktopUpdateConfig = {
  latestVersion: "0.1.0",
  minSupportedVersion: "0.1.0",
  mandatory: false,
  downloadUrl: "",
  releaseNotes: [],
  publishedAt: null,
};

function resolveManifestPaths(): string[] {
  const cwd = process.cwd();
  const paths = new Set<string>();

  paths.add(path.join(cwd, "dist", "public", "desktop-update.json"));
  paths.add(path.join(cwd, "client", "public", "desktop-update.json"));
  paths.add(path.join(cwd, "public", "desktop-update.json"));

  try {
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    paths.add(path.join(moduleDir, "..", "public", "desktop-update.json"));
    paths.add(path.join(moduleDir, "..", "..", "client", "public", "desktop-update.json"));
  } catch {
    // CJS bundle: __dirname is dist/
    if (typeof __dirname !== "undefined") {
      paths.add(path.join(__dirname, "public", "desktop-update.json"));
    }
  }

  return [...paths];
}

export function parseDesktopUpdateMandatory(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return false;
}

export function parseDesktopReleaseNotes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      // Supports newline/pipe env vars without requiring JSON.
    }
    return raw
      .split(/\r?\n|\|/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

export function normalizeDesktopUpdateManifest(raw: unknown): DesktopUpdateConfig | null {
  if (!raw || typeof raw !== "object") return null;

  const obj = raw as Record<string, unknown>;
  const latestVersion =
    typeof obj.latestVersion === "string" ? obj.latestVersion.trim() : "";
  if (!latestVersion) return null;

  const minSupportedVersion =
    typeof obj.minSupportedVersion === "string" && obj.minSupportedVersion.trim()
      ? obj.minSupportedVersion.trim()
      : DEFAULT_DESKTOP_UPDATE_CONFIG.minSupportedVersion;

  const publishedAtRaw =
    typeof obj.publishedAt === "string" ? obj.publishedAt.trim() : "";

  return {
    latestVersion,
    minSupportedVersion,
    mandatory: parseDesktopUpdateMandatory(obj.mandatory),
    downloadUrl: typeof obj.downloadUrl === "string" ? obj.downloadUrl.trim() : "",
    releaseNotes: parseDesktopReleaseNotes(obj.releaseNotes),
    publishedAt: publishedAtRaw || null,
  };
}

export function loadDesktopUpdateManifest(): DesktopUpdateConfig | null {
  let sawFile = false;

  for (const manifestPath of resolveManifestPaths()) {
    try {
      if (!fs.existsSync(manifestPath)) continue;
      sawFile = true;

      const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown;
      const normalized = normalizeDesktopUpdateManifest(raw);
      if (normalized) return normalized;

      console.warn("[desktop-update] invalid manifest shape:", manifestPath);
    } catch (error) {
      sawFile = true;
      const message = error instanceof Error ? error.message : String(error);
      console.warn("[desktop-update] failed to read manifest:", manifestPath, message);
    }
  }

  if (!sawFile) {
    console.warn("[desktop-update] manifest not found; using defaults");
  }

  return null;
}

/** Env vars override manifest; manifest overrides safe defaults. */
export function buildDesktopUpdatePayload(): DesktopUpdateConfig {
  const manifest = loadDesktopUpdateManifest();
  const base = manifest ?? DEFAULT_DESKTOP_UPDATE_CONFIG;

  return {
    latestVersion:
      process.env.DESKTOP_LATEST_VERSION?.trim() || base.latestVersion,
    minSupportedVersion:
      process.env.DESKTOP_MIN_SUPPORTED_VERSION?.trim() || base.minSupportedVersion,
    mandatory:
      process.env.DESKTOP_UPDATE_MANDATORY !== undefined
        ? parseDesktopUpdateMandatory(process.env.DESKTOP_UPDATE_MANDATORY)
        : base.mandatory,
    downloadUrl:
      process.env.DESKTOP_UPDATE_DOWNLOAD_URL?.trim() || base.downloadUrl,
    releaseNotes:
      process.env.DESKTOP_UPDATE_RELEASE_NOTES !== undefined
        ? parseDesktopReleaseNotes(process.env.DESKTOP_UPDATE_RELEASE_NOTES)
        : base.releaseNotes,
    publishedAt:
      process.env.DESKTOP_UPDATE_PUBLISHED_AT?.trim() || base.publishedAt,
  };
}
