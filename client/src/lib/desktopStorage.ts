export const isDesktopBuild = import.meta.env.VITE_PLATFORM === "desktop";

export const DESKTOP_STORAGE_BUCKETS = [
  "config",
  "cache",
  "data",
  "logs",
  "sessions",
  "heatmap",
  "temp",
] as const;

export type DesktopStorageBucket = (typeof DESKTOP_STORAGE_BUCKETS)[number];
export type DesktopStorageMode = "tauri" | "browser-fallback";
export type DesktopStorageOpenTarget = "appData" | "logs" | "sessions" | "heatmap";

export type DesktopStoragePaths = {
  mode: DesktopStorageMode;
  baseDir: string;
  config: string;
  cache: string;
  data: string;
  logs: string;
  sessions: string;
  heatmap: string;
  temp: string;
  settingsFile: string;
  logFile: string;
};

export type DesktopSettings = {
  appVersion: string;
  createdAt: string;
  lastLaunchAt: string;
  selectedAsset: string;
  preferredSource: "spot" | "perp";
  heatmapPersistence: boolean;
  localDepth: number;
  diagnosticsEnabled: boolean;
};

export type DesktopLogEventName =
  | "app_start"
  | "storage_initialized"
  | "desktop_feed_connected"
  | "desktop_feed_error"
  | "desktop_feed_reconnect"
  | "desktop_bookmap_first_data"
  | "desktop_bookmap_first_trade"
  | "desktop_bookmap_no_data_timeout"
  | "desktop_bookmap_heartbeat"
  | "app_shutdown"
  | string;

export type HeatmapSessionMetadata = {
  symbol: string;
  source: string;
  startedAt: string;
  endedAt?: string;
  bucketMs?: number;
  depth?: number;
};

const APP_VERSION = "0.1.0";
const LOCAL_STORAGE_PREFIX = "goodtrading.desktop";
const FALLBACK_BASE = "browser-fallback://GoodTrading Terminal";

let cachedPaths: DesktopStoragePaths | null = null;
let initPromise: Promise<DesktopStoragePaths> | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function defaultSettings(existing?: Partial<DesktopSettings>): DesktopSettings {
  const createdAt = existing?.createdAt ?? nowIso();
  return {
    appVersion: existing?.appVersion ?? APP_VERSION,
    createdAt,
    lastLaunchAt: nowIso(),
    selectedAsset: existing?.selectedAsset ?? "BTCUSDT",
    preferredSource: existing?.preferredSource ?? "spot",
    heatmapPersistence: existing?.heatmapPersistence ?? true,
    localDepth: existing?.localDepth ?? 1000,
    diagnosticsEnabled: existing?.diagnosticsEnabled ?? true,
  };
}

function fallbackPaths(): DesktopStoragePaths {
  return {
    mode: "browser-fallback",
    baseDir: FALLBACK_BASE,
    config: `${FALLBACK_BASE}/Config`,
    cache: `${FALLBACK_BASE}/Cache`,
    data: `${FALLBACK_BASE}/Data`,
    logs: `${FALLBACK_BASE}/Logs`,
    sessions: `${FALLBACK_BASE}/Sessions`,
    heatmap: `${FALLBACK_BASE}/Heatmap`,
    temp: `${FALLBACK_BASE}/Temp`,
    settingsFile: `${FALLBACK_BASE}/Config/settings.json`,
    logFile: `${FALLBACK_BASE}/Logs/desktop.log`,
  };
}

function storageKey(key: string): string {
  return `${LOCAL_STORAGE_PREFIX}:${key}`;
}

async function invokeDesktop<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

function readFallbackJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(storageKey(key));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeFallbackJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(value));
  } catch {
    // Browser fallback is best-effort only.
  }
}

function appendFallbackLog(event: string, payload: Record<string, unknown> = {}): void {
  const line = { ts: nowIso(), event, payload };
  const current = readFallbackJson<unknown[]>("logs:desktop", []);
  writeFallbackJson("logs:desktop", [...current.slice(-499), line]);
}

export function getCachedDesktopStoragePaths(): DesktopStoragePaths | null {
  return cachedPaths;
}

export async function getDesktopStoragePaths(): Promise<DesktopStoragePaths> {
  if (cachedPaths) return cachedPaths;
  if (!isDesktopBuild) {
    cachedPaths = fallbackPaths();
    return cachedPaths;
  }
  try {
    cachedPaths = await invokeDesktop<DesktopStoragePaths>("get_desktop_storage_paths");
    return cachedPaths;
  } catch {
    cachedPaths = fallbackPaths();
    return cachedPaths;
  }
}

export async function initDesktopStorage(): Promise<DesktopStoragePaths> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const existing = await readDesktopConfig();
    const settings = defaultSettings(existing as Partial<DesktopSettings>);

    if (!isDesktopBuild) {
      cachedPaths = fallbackPaths();
      writeFallbackJson("config:settings", settings);
      appendFallbackLog("app_start", { mode: cachedPaths.mode });
      appendFallbackLog("storage_initialized", { baseDir: cachedPaths.baseDir, mode: cachedPaths.mode });
      return cachedPaths;
    }

    try {
      cachedPaths = await invokeDesktop<DesktopStoragePaths>("init_desktop_storage", { settings });
      await writeDesktopLog("app_start", { mode: cachedPaths.mode });
      await writeDesktopLog("storage_initialized", {
        baseDir: cachedPaths.baseDir,
        mode: cachedPaths.mode,
      });
      return cachedPaths;
    } catch (error) {
      cachedPaths = fallbackPaths();
      writeFallbackJson("config:settings", settings);
      appendFallbackLog("app_start", { mode: cachedPaths.mode });
      appendFallbackLog("storage_initialized", {
        baseDir: cachedPaths.baseDir,
        mode: cachedPaths.mode,
        fallbackReason: error instanceof Error ? error.message : String(error),
      });
      return cachedPaths;
    }
  })();

  return initPromise;
}

export async function writeDesktopLog(
  event: DesktopLogEventName,
  payload: Record<string, unknown> = {},
): Promise<void> {
  if (!isDesktopBuild) {
    appendFallbackLog(event, payload);
    return;
  }
  try {
    await invokeDesktop<void>("write_desktop_log", {
      entry: { ts: nowIso(), event, payload },
    });
  } catch {
    appendFallbackLog(event, payload);
  }
}

export async function readDesktopLogTail(lines = 300): Promise<string> {
  if (!isDesktopBuild) {
    const entries = readFallbackJson<unknown[]>("logs:desktop", []);
    return entries.slice(-lines).map((entry) => JSON.stringify(entry)).join("\n");
  }
  try {
    return await invokeDesktop<string>("read_desktop_log_tail", { input: { lines } });
  } catch {
    const entries = readFallbackJson<unknown[]>("logs:desktop", []);
    return entries.slice(-lines).map((entry) => JSON.stringify(entry)).join("\n");
  }
}

export async function openDesktopStoragePath(
  target: DesktopStorageOpenTarget,
): Promise<void> {
  if (!isDesktopBuild) return;
  await invokeDesktop<void>("open_desktop_storage_path", { input: { target } });
}

export async function readDesktopConfig(): Promise<Partial<DesktopSettings>> {
  if (!isDesktopBuild) {
    return readFallbackJson<Partial<DesktopSettings>>("config:settings", {});
  }
  try {
    return await invokeDesktop<Partial<DesktopSettings>>("read_desktop_config");
  } catch {
    return readFallbackJson<Partial<DesktopSettings>>("config:settings", {});
  }
}

export async function writeDesktopConfig(
  configPatch: Partial<DesktopSettings>,
): Promise<Partial<DesktopSettings>> {
  if (!isDesktopBuild) {
    const current = readFallbackJson<Partial<DesktopSettings>>("config:settings", {});
    const next = { ...current, ...configPatch };
    writeFallbackJson("config:settings", next);
    return next;
  }
  try {
    return await invokeDesktop<Partial<DesktopSettings>>("write_desktop_config", { configPatch });
  } catch {
    const current = readFallbackJson<Partial<DesktopSettings>>("config:settings", {});
    const next = { ...current, ...configPatch };
    writeFallbackJson("config:settings", next);
    return next;
  }
}

export async function writeMarketDataCache(
  key: string,
  payload: Record<string, unknown>,
): Promise<string | null> {
  if (!isDesktopBuild) {
    writeFallbackJson(`market-data:${key}`, payload);
    return null;
  }
  try {
    return await invokeDesktop<string>("write_market_data_cache", { input: { key, payload } });
  } catch {
    writeFallbackJson(`market-data:${key}`, payload);
    return null;
  }
}

export async function writeHeatmapCache(
  key: string,
  day: string,
  payload: Record<string, unknown>,
): Promise<string | null> {
  if (!isDesktopBuild) {
    writeFallbackJson(`heatmap:${day}:${key}`, payload);
    return null;
  }
  try {
    return await invokeDesktop<string>("write_heatmap_cache", { input: { key, day, payload } });
  } catch {
    writeFallbackJson(`heatmap:${day}:${key}`, payload);
    return null;
  }
}

export async function clearTempCache(): Promise<void> {
  if (!isDesktopBuild) {
    writeFallbackJson("temp", {});
    return;
  }
  try {
    await invokeDesktop<void>("clear_temp_cache");
  } catch {
    writeFallbackJson("temp", {});
  }
}

export async function writeHeatmapSessionMetadata(
  metadata: HeatmapSessionMetadata,
): Promise<string | null> {
  if (!isDesktopBuild) {
    writeFallbackJson(`sessions:${metadata.startedAt}`, metadata);
    return null;
  }
  try {
    return await invokeDesktop<string>("write_heatmap_session_metadata", { metadata });
  } catch {
    writeFallbackJson(`sessions:${metadata.startedAt}`, metadata);
    return null;
  }
}
