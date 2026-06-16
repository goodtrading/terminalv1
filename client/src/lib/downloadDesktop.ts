import { DESKTOP_INSTALLER_URL, DESKTOP_RELEASE_PAGE } from "@/lib/platformAccess";

/** Opens the v0.1.7 installer directly; falls back to the release page. */
export function openDesktopDownload(_source: string): void {
  const popup = window.open(DESKTOP_INSTALLER_URL, "_blank", "noopener,noreferrer");
  if (!popup) {
    window.open(DESKTOP_RELEASE_PAGE, "_blank", "noopener,noreferrer");
  }
}
