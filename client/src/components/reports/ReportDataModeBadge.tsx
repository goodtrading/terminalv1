import { ReportBadge } from "./ReportBadge";
import type { SessionReportDataMode } from "./session/sessionReportTypes";

/** Session tab / snapshot data source badge. */
export function SessionDataModeBadge({ mode }: { mode: SessionReportDataMode }) {
  switch (mode) {
    case "live":
      return <ReportBadge variant="live-data">Session Live</ReportBadge>;
    case "partial":
      return <ReportBadge variant="partial-data">Partial Session Data</ReportBadge>;
    case "mock":
      return <ReportBadge variant="mock">Mock Fallback</ReportBadge>;
  }
}

export function OtherTabsMockBadge({ executionLive }: { executionLive?: boolean }) {
  if (executionLive) {
    return <ReportBadge variant="partial-data">Edge · Playbook · Intel Mock</ReportBadge>;
  }
  return <ReportBadge variant="mock">Other Tabs Mock</ReportBadge>;
}

export function TabMockDataBadge() {
  return <ReportBadge variant="mock">Mock Data</ReportBadge>;
}
