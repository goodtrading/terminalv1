import { isDesktopBuild } from "@/lib/desktopStorage";
import { openExternalUrl } from "@/lib/openExternalUrl";

export const WEB_FORGOT_PASSWORD_URL = "https://goodtrading.up.railway.app/forgot-password";

/** Desktop uses Railway web for password recovery (local server has no Resend). */
export function isDesktopWebPasswordRecovery(): boolean {
  return isDesktopBuild;
}

export function openWebForgotPassword(): void {
  void openExternalUrl(WEB_FORGOT_PASSWORD_URL, {
    source: "desktop_password_recovery",
  }).catch((error) => {
    console.error("[auth] failed to open web password recovery", error);
  });
}
