import { useEffect } from "react";
import { useDesktopUpdateCheck } from "@/hooks/useDesktopUpdateCheck";
import { isDesktopApp, isDesktopBuildFlag, isTauriRuntime } from "@/lib/desktopRuntime";
import { initDesktopStorage, writeDesktopLog } from "@/lib/desktopStorage";

/**
 * Ensures update check runs once storage is ready, on every desktop cold start.
 * Mounted at app root (inside DesktopUpdateProvider).
 */
export function DesktopUpdateStartup() {
  const { checkNow } = useDesktopUpdateCheck();

  useEffect(() => {
    if (!isDesktopApp()) return;

    void writeDesktopLog("desktop_update_provider_mounted", {
      vitePlatform: import.meta.env.VITE_PLATFORM ?? null,
      isDesktopBuild: isDesktopBuildFlag(),
      isTauriRuntime: isTauriRuntime(),
    });

    let cancelled = false;

    void initDesktopStorage().then(() => {
      if (cancelled) return;
      void writeDesktopLog("desktop_update_check_scheduled", { source: "startup" });
      void checkNow();
    });

    const retryTimer = window.setTimeout(() => {
      if (cancelled) return;
      void writeDesktopLog("desktop_update_check_scheduled", { source: "startup_retry_5s" });
      void checkNow();
    }, 5_000);

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible" || cancelled) return;
      void checkNow();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [checkNow]);

  return null;
}
