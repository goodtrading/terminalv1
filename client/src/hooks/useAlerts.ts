import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { AlertEvent, AlertStreamEnvelope } from "@shared/alerts";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  connectAlertStream,
  fetchAlertPreferences,
  fetchAlerts,
  fetchUnreadAlertCount,
  setAlertStatus,
} from "@/lib/alertsClient";
import { deliverDesktopNativeAlert } from "@/lib/alertDelivery";
import { presentAlert } from "@/lib/alertPresentation";

const ALERTS_QUERY_KEY = ["/api/alerts"];
const ALERT_COUNT_QUERY_KEY = ["/api/alerts/unread-count"];
const ALERT_PREFS_QUERY_KEY = ["/api/alerts/preferences"];
const ALERT_BC_NAME = "gt-alert-events";
const ALERT_LEADER_KEY = "gt-alert-sse-leader";
const ALERT_LEADER_TTL_MS = 10_000;

function toastTone(alert: AlertEvent): "default" | "destructive" {
  return alert.severity === "P0" || alert.severity === "P1" ? "destructive" : "default";
}

export function useAlerts(filters: Record<string, string | number | boolean | undefined> = {}) {
  return useQuery({
    queryKey: [...ALERTS_QUERY_KEY, filters],
    queryFn: () => fetchAlerts(filters),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

export function useUnreadAlertCount() {
  return useQuery({
    queryKey: ALERT_COUNT_QUERY_KEY,
    queryFn: fetchUnreadAlertCount,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

export function useAlertPreferences() {
  return useQuery({
    queryKey: ALERT_PREFS_QUERY_KEY,
    queryFn: fetchAlertPreferences,
    staleTime: 60_000,
  });
}

export function useAlertActions() {
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "read" | "acknowledge" | "dismiss" }) =>
      setAlertStatus(id, action),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ALERTS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ALERT_COUNT_QUERY_KEY });
    },
  });
}

export function useAlertRealtime() {
  const { toast } = useToast();
  const preferences = useAlertPreferences();
  const shownRef = useRef(new Set<string>());
  const tabIdRef = useRef(`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
  const prefValue = preferences.data;

  useEffect(() => {
    let cleanupStream: (() => void) | null = null;
    let stopped = false;
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(ALERT_BC_NAME) : null;

    const isLeader = () => {
      try {
        const now = Date.now();
        const raw = localStorage.getItem(ALERT_LEADER_KEY);
        const current = raw ? (JSON.parse(raw) as { id?: string; expiresAt?: number }) : null;
        if (current?.id && current.expiresAt && current.expiresAt > now && current.id !== tabIdRef.current) return false;
        localStorage.setItem(ALERT_LEADER_KEY, JSON.stringify({ id: tabIdRef.current, expiresAt: now + ALERT_LEADER_TTL_MS }));
        return true;
      } catch (error) {
        console.warn("[alerts] leader election fallback", error);
        return true;
      }
    };

    const handleEnvelope = (envelope: AlertStreamEnvelope, canNotify: boolean) => {
      if (envelope.event.startsWith("alert.")) {
        void queryClient.invalidateQueries({ queryKey: ALERTS_QUERY_KEY });
        void queryClient.invalidateQueries({ queryKey: ALERT_COUNT_QUERY_KEY });
      }
      if (envelope.event !== "alert.created") return;
      const alert = envelope.data as AlertEvent;
      if (!alert?.id || shownRef.current.has(alert.id)) return;
      shownRef.current.add(alert.id);
      const presented = presentAlert(alert);
      if (canNotify && ["P0", "P1", "P2"].includes(alert.severity)) {
        toast({
          title: presented.title,
          description: presented.shortMessage,
          variant: toastTone(alert),
        });
      }
      if (canNotify) void deliverDesktopNativeAlert(alert, prefValue);
    };

    if (channel) {
      channel.onmessage = (message) => handleEnvelope(message.data as AlertStreamEnvelope, false);
    }

    const ensureLeaderStream = () => {
      if (stopped || cleanupStream || !isLeader()) return;
      cleanupStream = connectAlertStream((envelope) => {
        handleEnvelope(envelope, true);
        channel?.postMessage(envelope);
      });
    };

    ensureLeaderStream();
    const timer = window.setInterval(() => {
      if (cleanupStream) {
        try {
          localStorage.setItem(ALERT_LEADER_KEY, JSON.stringify({ id: tabIdRef.current, expiresAt: Date.now() + ALERT_LEADER_TTL_MS }));
        } catch (error) {
          console.warn("[alerts] leader heartbeat failed", error);
        }
        return;
      }
      ensureLeaderStream();
    }, 4_000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      cleanupStream?.();
      channel?.close();
      try {
        const raw = localStorage.getItem(ALERT_LEADER_KEY);
        const current = raw ? (JSON.parse(raw) as { id?: string }) : null;
        if (current?.id === tabIdRef.current) localStorage.removeItem(ALERT_LEADER_KEY);
      } catch (error) {
        console.warn("[alerts] leader cleanup failed", error);
      }
    };
  }, [prefValue, toast]);
}

export function useLatestAlerts(limit = 6) {
  const filters = useMemo(() => ({ limit }), [limit]);
  return useAlerts(filters);
}
