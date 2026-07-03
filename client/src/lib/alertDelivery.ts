import type { AlertEvent, AlertPreferences } from "@shared/alerts";
import { isDesktopApp, isTauriRuntime } from "@/lib/desktopRuntime";
import { writeDesktopLog } from "@/lib/desktopStorage";
import { presentAlert } from "@/lib/alertPresentation";

export type NotificationPermissionState = "granted" | "denied" | "prompt" | "unsupported";

export interface AlertDeliveryResult {
  ok: boolean;
  provider: "tauri_native" | "web_notification" | "noop";
  reason?: string;
}

export interface AlertNotificationAdapter {
  isSupported(): Promise<boolean>;
  getPermissionState(): Promise<NotificationPermissionState>;
  requestPermission(): Promise<boolean>;
  deliver(alert: AlertEvent, preferences?: AlertPreferences): Promise<AlertDeliveryResult>;
}

const OWNER_KEY = "gt-alert-native-owner";
const OWNER_TTL_MS = 12_000;
const OWNER_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
let actionListenerReady = false;

function isAppForeground(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "visible" && document.hasFocus();
}

function shouldDeliverNative(alert: AlertEvent, preferences?: AlertPreferences): boolean {
  if (!preferences?.channelsBySeverity[alert.severity]?.includes("desktop_native")) return false;
  if (alert.severity === "P0") return true;
  if (alert.severity === "P1") return !isAppForeground() || preferences.desktopNativeWhenForeground;
  if (alert.severity === "P2") return preferences.channelsBySeverity.P2?.includes("desktop_native") === true;
  return false;
}

function ownsNativeDelivery(): boolean {
  try {
    const now = Date.now();
    const raw = localStorage.getItem(OWNER_KEY);
    const current = raw ? (JSON.parse(raw) as { id?: string; expiresAt?: number }) : null;
    if (current?.id && current.expiresAt && current.expiresAt > now && current.id !== OWNER_ID) return false;
    localStorage.setItem(OWNER_KEY, JSON.stringify({ id: OWNER_ID, expiresAt: now + OWNER_TTL_MS }));
    return true;
  } catch {
    return true;
  }
}

function notificationId(alert: AlertEvent): number {
  let hash = 0;
  for (let i = 0; i < alert.id.length; i += 1) {
    hash = (hash * 31 + alert.id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash || Date.now()) % 2_147_483_647;
}

export function queueAlertAction(alert: AlertEvent): void {
  try {
    sessionStorage.setItem("gt-alert-pending-action", JSON.stringify(alert));
  } catch {
    // Best effort only; the in-memory event still covers mounted React.
  }
  window.dispatchEvent(new CustomEvent("gt-alert-open", { detail: alert }));
}

async function focusTauriWindow(): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    await win.unminimize().catch(() => undefined);
    await win.show().catch(() => undefined);
    await win.setFocus().catch(() => undefined);
  } catch (error) {
    void writeDesktopLog("alert_window_focus_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function ensureTauriActionListener(): Promise<void> {
  if (actionListenerReady || !isTauriRuntime()) return;
  actionListenerReady = true;
  try {
    const { onAction } = await import("@tauri-apps/plugin-notification");
    await onAction(async (notification) => {
      await focusTauriWindow();
      const extra = notification.extra as Record<string, unknown> | undefined;
      const rawAlert = extra?.alert;
      if (rawAlert && typeof rawAlert === "object") {
        queueAlertAction(rawAlert as AlertEvent);
      }
    });
  } catch (error) {
    void writeDesktopLog("alert_notification_action_listener_failed", {
      error: error instanceof Error ? error.message : String(error),
      limitation: "Desktop click events may not be delivered consistently by the notification plugin on all OSes.",
    });
  }
}

export class TauriNativeAlertAdapter implements AlertNotificationAdapter {
  async isSupported(): Promise<boolean> {
    return isDesktopApp() && isTauriRuntime();
  }

  async getPermissionState(): Promise<NotificationPermissionState> {
    if (!(await this.isSupported())) return "unsupported";
    try {
      const { isPermissionGranted } = await import("@tauri-apps/plugin-notification");
      return (await isPermissionGranted()) ? "granted" : "prompt";
    } catch {
      return "unsupported";
    }
  }

  async requestPermission(): Promise<boolean> {
    if (!(await this.isSupported())) return false;
    const { isPermissionGranted, requestPermission } = await import("@tauri-apps/plugin-notification");
    if (await isPermissionGranted()) return true;
    return (await requestPermission()) === "granted";
  }

  async deliver(alert: AlertEvent, preferences?: AlertPreferences): Promise<AlertDeliveryResult> {
    if (!(await this.isSupported())) return { ok: false, provider: "tauri_native", reason: "unsupported" };
    if (!shouldDeliverNative(alert, preferences)) return { ok: false, provider: "tauri_native", reason: "policy_suppressed" };
    if (!ownsNativeDelivery()) return { ok: false, provider: "tauri_native", reason: "not_owner" };
    const allowed = await this.requestPermission();
    if (!allowed) return { ok: false, provider: "tauri_native", reason: "permission_denied" };
    try {
      await ensureTauriActionListener();
      const { sendNotification } = await import("@tauri-apps/plugin-notification");
      const presented = presentAlert(alert);
      sendNotification({
        id: notificationId(alert),
        title: presented.title,
        body: presented.shortMessage,
        group: alert.domain,
        autoCancel: true,
        silent: !preferences?.soundBySeverity[alert.severity],
        extra: { alert },
      });
      void writeDesktopLog("alert_tauri_native_delivered", {
        alertId: alert.id,
        type: alert.type,
        severity: alert.severity,
      });
      return { ok: true, provider: "tauri_native" };
    } catch (error) {
      void writeDesktopLog("alert_tauri_native_failed", {
        alertId: alert.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return { ok: false, provider: "tauri_native", reason: "delivery_failed" };
    }
  }
}

export class WebNotificationAlertAdapter implements AlertNotificationAdapter {
  async isSupported(): Promise<boolean> {
    return typeof window !== "undefined" && "Notification" in window;
  }

  async getPermissionState(): Promise<NotificationPermissionState> {
    if (!(await this.isSupported())) return "unsupported";
    if (Notification.permission === "default") return "prompt";
    return Notification.permission;
  }

  async requestPermission(): Promise<boolean> {
    if (!(await this.isSupported())) return false;
    return (Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission) === "granted";
  }

  async deliver(alert: AlertEvent, preferences?: AlertPreferences): Promise<AlertDeliveryResult> {
    if (import.meta.env.VITE_ALERTS_WEB_NOTIFICATIONS_ENABLED !== "true") {
      return { ok: false, provider: "web_notification", reason: "feature_disabled" };
    }
    if (!preferences?.channelsBySeverity[alert.severity]?.includes("web_notification")) {
      return { ok: false, provider: "web_notification", reason: "channel_disabled" };
    }
    if (!(await this.requestPermission())) return { ok: false, provider: "web_notification", reason: "permission_denied" };
    const presented = presentAlert(alert);
    const notification = new Notification(presented.title, {
      body: presented.shortMessage,
      tag: alert.deduplicationKey,
      requireInteraction: alert.requiresAcknowledgement,
      silent: !preferences.soundBySeverity[alert.severity],
    });
    notification.onclick = () => {
      window.focus();
      queueAlertAction(alert);
      notification.close();
    };
    return { ok: true, provider: "web_notification" };
  }
}

export class NoopAlertAdapter implements AlertNotificationAdapter {
  async isSupported(): Promise<boolean> {
    return true;
  }
  async getPermissionState(): Promise<NotificationPermissionState> {
    return "unsupported";
  }
  async requestPermission(): Promise<boolean> {
    return false;
  }
  async deliver(): Promise<AlertDeliveryResult> {
    return { ok: false, provider: "noop", reason: "noop" };
  }
}

export async function selectAlertNotificationAdapter(): Promise<AlertNotificationAdapter> {
  const tauri = new TauriNativeAlertAdapter();
  if (await tauri.isSupported()) return tauri;
  const web = new WebNotificationAlertAdapter();
  if (await web.isSupported()) return web;
  return new NoopAlertAdapter();
}

export async function deliverDesktopNativeAlert(
  alert: AlertEvent,
  preferences: AlertPreferences | undefined,
): Promise<AlertDeliveryResult> {
  const adapter = await selectAlertNotificationAdapter();
  return adapter.deliver(alert, preferences);
}
