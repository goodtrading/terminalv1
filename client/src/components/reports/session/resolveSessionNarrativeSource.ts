import { loadBrokerSession } from "@/components/terminal/execution/brokerSessionState";
import type { ExecutionReportSource } from "../execution/executionReportTypes";

/** Align session narrative source with active broker (paper vs BingX read-only). */
export function resolveSessionNarrativeSource(): ExecutionReportSource {
  const s = loadBrokerSession();
  if (s.connectionMode === "paper" && s.connected && s.exchange === "paper") {
    return "paper";
  }
  if (s.exchange === "bingx" && s.connected) {
    return "bingx";
  }
  return "paper";
}
