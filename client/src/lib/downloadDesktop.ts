import { DESKTOP_INSTALLER_URL, DESKTOP_RELEASE_PAGE } from "@/lib/platformAccess";
import { openExternalUrl } from "@/lib/openExternalUrl";

/** Opens the v0.1.7 installer directly; falls back to the release page. */
export function openDesktopDownload(source: string): void {
  void openExternalUrl(DESKTOP_INSTALLER_URL, { source }).catch(() => {
    window.open(DESKTOP_RELEASE_PAGE, "_blank", "noopener,noreferrer");
  });
}
