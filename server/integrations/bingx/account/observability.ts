import { redactForLog } from "./redact";

/** Compact observability — never log credentials, signatures, or full PnL dumps. */
export function logBingxAccount(
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const safe = redactForLog(fields) as Record<string, unknown>;
  // Strip heavy numeric dumps
  if ("pnl" in safe) delete safe.pnl;
  if ("balances" in safe) safe.balances = `[n=${Array.isArray(fields.balances) ? fields.balances.length : "?"}]`;
  if ("positions" in safe) safe.positions = `[n=${Array.isArray(fields.positions) ? fields.positions.length : "?"}]`;
  console.log(
    `[bingx-account] ${event}`,
    JSON.stringify({
      ...safe,
      ts: new Date().toISOString(),
    }),
  );
}
