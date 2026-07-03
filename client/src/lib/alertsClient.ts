import type { AlertEvent, AlertPreferences, AlertStreamEnvelope } from "@shared/alerts";
import { apiRequest } from "@/lib/queryClient";
import { apiUrl } from "@/lib/apiBase";

export async function fetchAlerts(params: Record<string, string | number | boolean | undefined> = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null) query.set(key, String(value));
  }
  const res = await apiRequest(`/api/alerts${query.size ? `?${query.toString()}` : ""}`);
  return (await res.json()) as { alerts: AlertEvent[]; nextCursor?: string };
}

export async function fetchUnreadAlertCount() {
  const res = await apiRequest("/api/alerts/unread-count");
  return (await res.json()) as { count: number };
}

export async function fetchAlertPreferences() {
  const res = await apiRequest("/api/alerts/preferences");
  return (await res.json()) as AlertPreferences;
}

export async function saveAlertPreferences(preferences: AlertPreferences) {
  const res = await apiRequest("/api/alerts/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(preferences),
  });
  return (await res.json()) as AlertPreferences;
}

export async function setAlertStatus(id: string, action: "read" | "acknowledge" | "dismiss") {
  const res = await apiRequest(`/api/alerts/${encodeURIComponent(id)}/${action}`, {
    method: "POST",
  });
  return (await res.json()) as AlertEvent;
}

export function connectAlertStream(
  onEvent: (event: AlertStreamEnvelope) => void,
  onError?: (error: Event) => void,
): () => void {
  const url = new URL(apiUrl("/api/alerts/stream"), window.location.origin);
  const source = new EventSource(url.toString(), { withCredentials: true });
  const events: AlertStreamEnvelope["event"][] = [
    "alert.created",
    "alert.updated",
    "alert.read",
    "alert.acknowledged",
    "alert.dismissed",
    "preferences.updated",
    "source.health_changed",
    "heartbeat",
  ];
  for (const eventName of events) {
    source.addEventListener(eventName, (message) => {
      try {
        onEvent(JSON.parse((message as MessageEvent).data));
      } catch {
        // ignore malformed stream messages
      }
    });
  }
  if (onError) source.onerror = onError;
  return () => source.close();
}
