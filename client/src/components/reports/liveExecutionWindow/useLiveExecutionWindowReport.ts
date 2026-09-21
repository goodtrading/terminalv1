import { useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/apiBase";
import type {
  LiveExecutionReportApiResponse,
  LiveExecutionReportState,
  LiveExecutionTimestampPolicy,
} from "./liveExecutionWindowTypes";

export function serializeUtcInput(value: string): string {
  if (!value) throw new Error("LIVE_REPORT_INVALID_REQUEST");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("LIVE_REPORT_INVALID_REQUEST");
  return date.toISOString();
}

export function validateLiveReportInterval(start: string, end: string): void {
  const startDate = new Date(serializeUtcInput(start));
  const endDate = new Date(serializeUtcInput(end));
  if (startDate.getTime() >= endDate.getTime()) throw new Error("LIVE_REPORT_INVALID_REQUEST");
  if (endDate.getTime() - startDate.getTime() > 7 * 24 * 60 * 60 * 1000) {
    throw new Error("LIVE_REPORT_INTERVAL_TOO_LARGE");
  }
}

export async function fetchLiveExecutionWindowReport(
  startInclusive: string,
  endExclusive: string,
  timestampPolicy: LiveExecutionTimestampPolicy,
  signal: AbortSignal,
) {
  const params = new URLSearchParams({
    startInclusive: serializeUtcInput(startInclusive),
    endExclusive: serializeUtcInput(endExclusive),
    timestampPolicy,
  });
  const response = await fetch(apiUrl(`/api/reports/live-execution-window?${params}`), { credentials: "include", signal });
  const body = (await response.json()) as LiveExecutionReportApiResponse;
  if (!response.ok || !body.success) {
    throw new Error(body.success ? "LIVE_REPORT_FAILED" : body.code ?? "LIVE_REPORT_FAILED");
  }
  return body.report;
}

export function useLiveExecutionWindowReport() {
  const [state, setState] = useState<LiveExecutionReportState>({ status: "idle" });
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  async function submit(startInclusive: string, endExclusive: string, timestampPolicy: LiveExecutionTimestampPolicy) {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setState({ status: "loading" });
    try {
      validateLiveReportInterval(startInclusive, endExclusive);
      const report = await fetchLiveExecutionWindowReport(startInclusive, endExclusive, timestampPolicy, controller.signal);
      if (controller.signal.aborted) return;
      setState({ status: "success", report });
    } catch (error) {
      if (controller.signal.aborted) return;
      setState({ status: "error", code: error instanceof Error ? error.message : "LIVE_REPORT_FAILED" });
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  return { state, submit };
}
