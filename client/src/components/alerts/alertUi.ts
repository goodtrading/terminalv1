import type { AlertDomain, AlertSeverity } from "@shared/alerts";
import {
  Activity,
  AlertTriangle,
  Bell,
  CircleGauge,
  DatabaseZap,
  Info,
  ShieldAlert,
} from "lucide-react";

export function severityClass(severity: AlertSeverity): string {
  switch (severity) {
    case "P0":
      return "border-red-400/70 bg-red-950/60 text-red-100";
    case "P1":
      return "border-orange-400/70 bg-orange-950/50 text-orange-100";
    case "P2":
      return "border-yellow-400/60 bg-yellow-950/40 text-yellow-100";
    case "P3":
      return "border-sky-400/50 bg-sky-950/35 text-sky-100";
    case "P4":
      return "border-terminal-border bg-terminal-panel/80 text-terminal-muted";
  }
}

export function severityDotClass(severity: AlertSeverity): string {
  switch (severity) {
    case "P0":
      return "bg-red-400";
    case "P1":
      return "bg-orange-400";
    case "P2":
      return "bg-yellow-400";
    case "P3":
      return "bg-sky-400";
    case "P4":
      return "bg-terminal-muted";
  }
}

export function domainIcon(domain: AlertDomain) {
  switch (domain) {
    case "gamma":
      return CircleGauge;
    case "market":
      return Activity;
    case "flow":
      return DatabaseZap;
    case "account":
      return ShieldAlert;
    case "system":
      return Info;
    default:
      return Bell;
  }
}

export function severityIcon(severity: AlertSeverity) {
  return severity === "P0" || severity === "P1" ? AlertTriangle : Bell;
}
