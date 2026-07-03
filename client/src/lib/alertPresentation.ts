import type { AlertDomain, AlertEvent, AlertSeverity } from "@shared/alerts";

export interface PresentedAlert {
  title: string;
  message: string;
  shortMessage: string;
  symbol?: string;
  severity: AlertSeverity;
  domain: AlertDomain;
  simulated: boolean;
}

function normalizeSymbol(symbol?: string): string | undefined {
  if (!symbol) return undefined;
  const clean = symbol.toUpperCase().replace(/[-_/]/g, "");
  if (clean === "BTCUSDT") return "BTC/USDT";
  if (clean.endsWith("USDT") && clean.length > 4) return `${clean.slice(0, -4)}/USDT`;
  return symbol.toUpperCase();
}

function isSimulated(alert: AlertEvent): boolean {
  return alert.metadata?.simulated === true || alert.source.toLowerCase().includes("sim");
}

function fallbackTitle(type: string): string {
  return type
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function presentAlert(alert: AlertEvent): PresentedAlert {
  const symbol = normalizeSymbol(alert.symbol) ?? "Market";
  const simulated = isSimulated(alert);

  if (alert.type === "gamma.flip_crossed") {
    const message = simulated
      ? `${symbol} crossed the Gamma Flip in simulation mode.`
      : `${symbol} crossed the Gamma Flip. Monitor the regime response.`;
    return {
      title: simulated ? "Test Alert — Gamma Flip Crossed" : "Gamma Flip Crossed",
      message,
      shortMessage: message,
      symbol,
      severity: alert.severity,
      domain: alert.domain,
      simulated,
    };
  }

  const baseTitle = alert.title && !alert.title.includes("[SIM]") ? alert.title : fallbackTitle(alert.type);
  const title = simulated ? `Test Alert — ${baseTitle.replace(/^Simulated\s+/i, "")}` : baseTitle;
  const rawMessage = alert.shortMessage ?? alert.message;
  const message = rawMessage
    .replace(/\[SIM\]\s*/gi, "")
    .replace(/Simulated alert[:\s-]*/gi, "")
    .trim();

  return {
    title,
    message: message || `${symbol} generated an operational alert.`,
    shortMessage: message || `${symbol} generated an operational alert.`,
    symbol,
    severity: alert.severity,
    domain: alert.domain,
    simulated,
  };
}
