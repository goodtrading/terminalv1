import { isDesktopApp } from "@/lib/desktopRuntime";
import { writeDesktopLog } from "@/lib/desktopStorage";

export type OpenExternalUrlOptions = {
  source?: string;
  currentVersion?: string;
  latestVersion?: string;
};

async function logExternal(event: string, payload: Record<string, unknown>): Promise<void> {
  try {
    await writeDesktopLog(event, payload);
  } catch {
    // Best-effort logging only.
  }
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

function openWithWindow(url: string): void {
  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (!popup) {
    throw new Error("No se pudo abrir el navegador. Comprueba bloqueadores de ventanas emergentes.");
  }
}

export async function openExternalUrl(
  url: string | null | undefined,
  options: OpenExternalUrlOptions = {},
): Promise<void> {
  const { source = "unknown", currentVersion, latestVersion } = options;
  const normalizedUrl = url?.trim() ?? "";

  await logExternal("desktop_external_link_click", {
    source,
    url: normalizedUrl,
    currentVersion,
    latestVersion,
  });

  if (!normalizedUrl) {
    await logExternal("desktop_external_link_missing_url", { source });
    throw new Error("No hay URL configurada.");
  }

  if (!isHttpUrl(normalizedUrl)) {
    await logExternal("desktop_external_link_blocked", {
      source,
      url: normalizedUrl,
    });
    throw new Error("URL externa no permitida.");
  }

  if (isDesktopApp()) {
    try {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(normalizedUrl);
      await logExternal("desktop_external_link_opened", {
        source,
        url: normalizedUrl,
        method: "tauri-shell",
      });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await logExternal("desktop_external_link_error", {
        source,
        url: normalizedUrl,
        method: "tauri-shell",
        error: message,
      });

      try {
        openWithWindow(normalizedUrl);
        await logExternal("desktop_external_link_fallback", {
          source,
          url: normalizedUrl,
          method: "window.open",
        });
        await logExternal("desktop_external_link_opened", {
          source,
          url: normalizedUrl,
          method: "window.open",
        });
        return;
      } catch (fallbackError) {
        const fallbackMessage =
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        await logExternal("desktop_external_link_error", {
          source,
          url: normalizedUrl,
          method: "window.open",
          error: fallbackMessage,
        });
        throw fallbackError instanceof Error ? fallbackError : new Error(fallbackMessage);
      }
    }
  }

  try {
    openWithWindow(normalizedUrl);
    await logExternal("desktop_external_link_opened", {
      source,
      url: normalizedUrl,
      method: "window.open",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logExternal("desktop_external_link_error", {
      source,
      url: normalizedUrl,
      method: "window.open",
      error: message,
    });
    throw error instanceof Error ? error : new Error(message);
  }
}
