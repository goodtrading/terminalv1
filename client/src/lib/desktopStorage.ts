export const isDesktopBuild = import.meta.env.VITE_PLATFORM === "desktop";

export const DESKTOP_STORAGE_BUCKETS = [
  "config",
  "cache",
  "logs",
  "market-data",
  "heatmap",
  "sessions",
  "temp",
] as const;

export type DesktopStorageBucket = (typeof DESKTOP_STORAGE_BUCKETS)[number];

export type DesktopStorageMode = "tauri" | "browser-fallback";

export type DesktopStorageRoots = {
  mode: DesktopStorageMode;
  buckets: Record<DesktopStorageBucket, string>;
  appDataDir?: string;
  appCacheDir?: string;
  localStoragePrefix: string;
  indexedDbName: string;
};

const LOCAL_STORAGE_PREFIX = "goodtrading.desktop";
const INDEXED_DB_NAME = "goodtrading-desktop-storage";

function joinPath(root: string, child: string): string {
  return `${root.replace(/[\\/]+$/, "")}/${child}`;
}

function browserFallbackRoots(): DesktopStorageRoots {
  return {
    mode: "browser-fallback",
    buckets: {
      config: `${LOCAL_STORAGE_PREFIX}:config`,
      cache: `${LOCAL_STORAGE_PREFIX}:cache`,
      logs: `${LOCAL_STORAGE_PREFIX}:logs`,
      "market-data": `${LOCAL_STORAGE_PREFIX}:market-data`,
      heatmap: `${LOCAL_STORAGE_PREFIX}:heatmap`,
      sessions: `${LOCAL_STORAGE_PREFIX}:sessions`,
      temp: `${LOCAL_STORAGE_PREFIX}:temp`,
    },
    localStoragePrefix: LOCAL_STORAGE_PREFIX,
    indexedDbName: INDEXED_DB_NAME,
  };
}

export function desktopStorageKey(bucket: DesktopStorageBucket, key: string): string {
  return `${LOCAL_STORAGE_PREFIX}:${bucket}:${key}`;
}

export async function resolveDesktopStorageRoots(): Promise<DesktopStorageRoots> {
  if (!isDesktopBuild) return browserFallbackRoots();

  try {
    const tauriPath = await import("@tauri-apps/api/path");
    const [appDataDir, appCacheDir] = await Promise.all([
      tauriPath.appDataDir(),
      tauriPath.appCacheDir(),
    ]);

    return {
      mode: "tauri",
      appDataDir,
      appCacheDir,
      buckets: {
        config: joinPath(appDataDir, "config"),
        cache: joinPath(appCacheDir, "cache"),
        logs: joinPath(appDataDir, "logs"),
        "market-data": joinPath(appCacheDir, "market-data"),
        heatmap: joinPath(appCacheDir, "heatmap"),
        sessions: joinPath(appDataDir, "sessions"),
        temp: joinPath(appCacheDir, "temp"),
      },
      localStoragePrefix: LOCAL_STORAGE_PREFIX,
      indexedDbName: INDEXED_DB_NAME,
    };
  } catch {
    return browserFallbackRoots();
  }
}
