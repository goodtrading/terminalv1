/** Compact observability — never log full telemetry payload. */
export function logTelemetryObs(meta: {
  event: "ingest" | "reject" | "live_merge";
  userId?: number;
  symbol?: string;
  sequence?: number;
  reason?: string;
  bytes?: number;
  storeSize?: number;
}): void {
  console.info(
    `[ai-market-telemetry] event=${meta.event} user=${meta.userId ?? "-"} symbol=${meta.symbol ?? "-"} seq=${meta.sequence ?? "-"} reason=${meta.reason ?? "-"} bytes=${meta.bytes ?? "-"} store=${meta.storeSize ?? "-"}`,
  );
}
