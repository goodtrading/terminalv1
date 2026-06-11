import { apiUrl } from "@/lib/apiBase";
import { appVersion } from "@/lib/appVersion";
import { isDesktopApp } from "@/lib/desktopRuntime";
import { writeDesktopLog } from "@/lib/desktopStorage";

const DEFAULT_DESKTOP_API_BASE = "https://goodtrading.up.railway.app";
const DESKTOP_UPDATE_PATH = "/api/desktop/update";
const DESKTOP_UPDATE_FETCH_TIMEOUT_MS = 15_000;
const DESKTOP_UPDATE_MAX_ATTEMPTS = 3;
const DESKTOP_UPDATE_RETRY_DELAY_MS = 2_000;

export function desktopUpdateEndpoint(): string {
  const resolved = apiUrl(DESKTOP_UPDATE_PATH);
  if (/^https?:\/\//i.test(resolved)) return resolved;
  return `${DEFAULT_DESKTOP_API_BASE}${DESKTOP_UPDATE_PATH}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export type DesktopUpdateStatus =
  | "idle"
  | "checking"
  | "up_to_date"
  | "optional_update"
  | "required_update"
  | "error";

export type DesktopUpdateResponse = {
  latestVersion: string;
  minSupportedVersion: string;
  mandatory: boolean;
  downloadUrl: string;
  releaseNotes: string[];
  publishedAt: string | null;
};

export type DesktopUpdateState = {
  currentVersion: string;
  latestVersion: string | null;
  minSupportedVersion: string | null;
  mandatory: boolean | null;
  downloadUrl: string | null;
  releaseNotes: string[];
  publishedAt: string | null;
  updateStatus: DesktopUpdateStatus;
  lastUpdateCheck: string | null;
  lastUpdateError: string | null;
};

export const defaultDesktopUpdateState: DesktopUpdateState = {
  currentVersion: appVersion,
  latestVersion: null,
  minSupportedVersion: null,
  mandatory: null,
  downloadUrl: null,
  releaseNotes: [],
  publishedAt: null,
  updateStatus: isDesktopApp() ? "idle" : "up_to_date",
  lastUpdateCheck: null,
  lastUpdateError: null,
};

function normalizeVersion(version: string | null | undefined): number[] {
  return String(version ?? "")
    .trim()
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

export function compareVersions(left: string, right: string): number {
  const a = normalizeVersion(left);
  const b = normalizeVersion(right);
  const len = Math.max(a.length, b.length, 3);
  for (let i = 0; i < len; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

function normalizeUpdateResponse(value: DesktopUpdateResponse): DesktopUpdateResponse {
  return {
    latestVersion: value.latestVersion || appVersion,
    minSupportedVersion: value.minSupportedVersion || "0.1.0",
    mandatory: value.mandatory === true,
    downloadUrl: value.downloadUrl || "",
    releaseNotes: Array.isArray(value.releaseNotes) ? value.releaseNotes.map(String).filter(Boolean) : [],
    publishedAt: value.publishedAt || null,
  };
}

export function resolveDesktopUpdateStatus(
  update: DesktopUpdateResponse,
  currentVersion = appVersion,
): Exclude<DesktopUpdateStatus, "idle" | "checking" | "error"> {
  if (update.mandatory || compareVersions(currentVersion, update.minSupportedVersion) < 0) {
    return "required_update";
  }
  if (compareVersions(currentVersion, update.latestVersion) < 0) {
    return "optional_update";
  }
  return "up_to_date";
}

async function fetchDesktopUpdatePayload(): Promise<DesktopUpdateResponse> {
  const endpoint = desktopUpdateEndpoint();
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= DESKTOP_UPDATE_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      DESKTOP_UPDATE_FETCH_TIMEOUT_MS,
    );

    try {
      const res = await fetch(endpoint, {
        method: "GET",
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        throw new Error(`desktop_update:${res.status}`);
      }

      return normalizeUpdateResponse((await res.json()) as DesktopUpdateResponse);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < DESKTOP_UPDATE_MAX_ATTEMPTS) {
        await sleep(DESKTOP_UPDATE_RETRY_DELAY_MS * attempt);
      }
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  throw lastError ?? new Error("desktop_update:fetch_failed");
}

export async function checkDesktopUpdate(): Promise<DesktopUpdateState> {
  const checkedAt = new Date().toISOString();
  const endpoint = desktopUpdateEndpoint();
  await writeDesktopLog("desktop_update_check_start", {
    currentVersion: appVersion,
    endpoint,
  });

  try {
    const update = await fetchDesktopUpdatePayload();
    const updateStatus = resolveDesktopUpdateStatus(update, appVersion);

    await writeDesktopLog("desktop_update_check_success", {
      currentVersion: appVersion,
      latestVersion: update.latestVersion,
      minSupportedVersion: update.minSupportedVersion,
      mandatory: update.mandatory,
      updateStatus,
    });

    if (updateStatus === "required_update") {
      await writeDesktopLog("desktop_update_required", {
        currentVersion: appVersion,
        latestVersion: update.latestVersion,
        minSupportedVersion: update.minSupportedVersion,
      });
    } else if (updateStatus === "optional_update") {
      await writeDesktopLog("desktop_update_available", {
        currentVersion: appVersion,
        latestVersion: update.latestVersion,
      });
    } else {
      await writeDesktopLog("desktop_update_up_to_date", {
        currentVersion: appVersion,
        latestVersion: update.latestVersion,
      });
    }

    return {
      currentVersion: appVersion,
      latestVersion: update.latestVersion,
      minSupportedVersion: update.minSupportedVersion,
      mandatory: update.mandatory,
      downloadUrl: update.downloadUrl,
      releaseNotes: update.releaseNotes,
      publishedAt: update.publishedAt,
      updateStatus,
      lastUpdateCheck: checkedAt,
      lastUpdateError: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeDesktopLog("desktop_update_check_error", {
      currentVersion: appVersion,
      error: message,
    });
    return {
      ...defaultDesktopUpdateState,
      updateStatus: "error",
      lastUpdateCheck: checkedAt,
      lastUpdateError: message,
    };
  }
}

export async function openDesktopUpdateDownload(
  downloadUrl: string | null | undefined,
  meta?: { latestVersion?: string | null },
): Promise<void> {
  const url = downloadUrl?.trim();
  const latestVersion = meta?.latestVersion?.trim() ?? null;

  await writeDesktopLog("desktop_update_download_click", {
    currentVersion: appVersion,
    latestVersion,
    downloadUrl: url ?? "",
  });

  if (!url) {
    await writeDesktopLog("desktop_update_download_missing_url", { currentVersion: appVersion });
    throw new Error("No hay URL de descarga configurada.");
  }

  if (isDesktopApp()) {
    try {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(url);
      await writeDesktopLog("desktop_update_download_opened", {
        currentVersion: appVersion,
        latestVersion,
        downloadUrl: url,
        method: "shell",
      });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await writeDesktopLog("desktop_update_download_error", {
        currentVersion: appVersion,
        latestVersion,
        downloadUrl: url,
        error: message,
        stage: "shell",
      });
    }
  }

  try {
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (!popup) {
      throw new Error("No se pudo abrir el navegador. Comprueba bloqueadores de ventanas emergentes.");
    }
    await writeDesktopLog("desktop_update_download_fallback", {
      currentVersion: appVersion,
      latestVersion,
      downloadUrl: url,
    });
    await writeDesktopLog("desktop_update_download_opened", {
      currentVersion: appVersion,
      latestVersion,
      downloadUrl: url,
      method: "window.open",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeDesktopLog("desktop_update_download_error", {
      currentVersion: appVersion,
      latestVersion,
      downloadUrl: url,
      error: message,
      stage: "fallback",
    });
    throw error instanceof Error ? error : new Error(message);
  }
}
