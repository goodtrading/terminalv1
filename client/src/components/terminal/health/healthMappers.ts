import type { HealthTone } from "./healthUi";
import type {
  RiskMirrorHealthStatus,
  RiskMirrorSystemHealth,
  SystemHealthOverallStatus,
} from "./systemHealthTypes";

export function overallHealthTone(
  overall: SystemHealthOverallStatus | undefined,
): HealthTone {
  if (overall === "healthy") return "ok";
  if (overall === "degraded") return "warn";
  if (overall === "error") return "error";
  return "neutral";
}

export function riskMirrorStatusTone(
  status: RiskMirrorHealthStatus | undefined,
): HealthTone {
  switch (status) {
    case "healthy":
      return "ok";
    case "degraded":
      return "warn";
    case "error":
      return "error";
    case "inactive":
      return "off";
    default:
      return "neutral";
  }
}

export function riskMirrorScoreTone(
  score: RiskMirrorSystemHealth["scoreStatus"] | undefined,
): HealthTone {
  switch (score) {
    case "aligned":
      return "ok";
    case "neutral":
    case "unknown":
      return "neutral";
    case "conflicted":
      return "warn";
    case "danger":
      return "error";
    default:
      return "off";
  }
}

export function riskMirrorGlobalBadgeLabel(
  rm: RiskMirrorSystemHealth | undefined,
): string {
  if (!rm || !rm.active || rm.exchange === "none") return "Risk: OFF";
  if (rm.scoreStatus === "danger" || rm.dangerWarningsCount > 0) {
    return "Risk: DANGER";
  }
  if (rm.scoreStatus === "conflicted" || rm.status === "degraded") {
    return "Risk: CONFLICTED";
  }
  if (rm.scoreStatus === "aligned") return "Risk: OK";
  if (!rm.positionOpen) return "Risk: IDLE";
  return "Risk: OK";
}

export function riskMirrorGlobalBadgeTone(
  rm: RiskMirrorSystemHealth | undefined,
): HealthTone {
  if (!rm || !rm.active || rm.exchange === "none") return "off";
  if (rm.scoreStatus === "danger" || rm.dangerWarningsCount > 0) return "error";
  if (rm.scoreStatus === "conflicted" || rm.status === "degraded") return "warn";
  if (rm.scoreStatus === "aligned") return "ok";
  if (!rm.positionOpen) return "neutral";
  return "ok";
}

export function riskMirrorStatusLabel(
  rm: RiskMirrorSystemHealth | undefined,
): string {
  if (!rm) return "Unknown";
  if (!rm.active || rm.exchange === "none") return "Inactive";
  if (!rm.positionOpen && rm.status === "healthy") return "Idle";
  return rm.status.charAt(0).toUpperCase() + rm.status.slice(1);
}

export function riskMirrorScoreLabel(
  score: RiskMirrorSystemHealth["scoreStatus"] | undefined,
): string {
  if (!score) return "—";
  return score.toUpperCase();
}
