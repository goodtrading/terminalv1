import type { AlertEvent } from "@shared/alerts";
import { getTerminalState } from "../../terminal-state";
import { pool } from "../../db";
import { envBool } from "../../lib/runtimeEnv";
import { getAlertRule } from "./alertCatalog";
import { detectGammaAndMarketAlerts, type GammaAlertSnapshot } from "./alertDetection";
import { createAlertPolicyState, evaluateAlertPolicy } from "./alertPolicyEngine";
import { alertStore } from "./alertStore";

const policyState = createAlertPolicyState();
let previousSnapshot: GammaAlertSnapshot | null = null;
let lastEvaluationAt = 0;
let lastEvaluationIso: string | null = null;
let lastSuccessfulEvaluationAt: string | null = null;
let lastEvaluationError: string | null = null;
const MIN_EVALUATION_INTERVAL_MS = 8_000;
const ALERT_EVALUATION_ADVISORY_LOCK = 927173;

export interface AlertEvaluationResult {
  evaluatedAt: string;
  detected: number;
  created: number;
  suppressed: Array<{ type: string; reason: string }>;
  alerts: AlertEvent[];
}

export function getAlertEngineDiagnostics() {
  return {
    engineRunning: envBool("ALERTS_ENABLED", true),
    evaluationMode: "on_demand",
    lastEvaluationAt: lastEvaluationIso,
    lastSuccessfulEvaluationAt,
    lastError: lastEvaluationError,
  };
}

function readRisk(value: unknown): string | null {
  if (typeof value === "string") return value.toUpperCase();
  if (value && typeof value === "object" && "risk" in value) {
    const risk = (value as { risk?: unknown }).risk;
    return typeof risk === "string" ? risk.toUpperCase() : null;
  }
  return null;
}

function buildSnapshot(state: any): GammaAlertSnapshot {
  return {
    symbol: state?.ticker?.symbol ?? "BTCUSDT",
    price: typeof state?.ticker?.price === "number" ? state.ticker.price : null,
    tickerStatus: state?.tickerStatus ?? "unavailable",
    gammaRegime: state?.market?.gammaRegime ?? state?.options?.gammaRegimeLocal ?? null,
    gammaFlip:
      state?.options?.gammaFlipLocal ??
      state?.options?.gammaFlipGlobal ??
      state?.market?.gammaFlip ??
      null,
    dealerPivot: state?.positioning?.dealerPivot ?? null,
    callWall: state?.positioning?.callWall ?? state?.options?.callWall ?? null,
    putWall: state?.positioning?.putWall ?? state?.options?.putWall ?? null,
    totalGex: state?.market?.totalGex ?? null,
    squeezeRisk: readRisk(state?.squeezeRisk ?? state?.market?.squeezeRisk ?? state?.options?.squeezeRisk),
    cascadeRisk: readRisk(state?.cascadeRisk ?? state?.market?.cascadeRisk ?? state?.options?.cascadeRisk),
    dataUpdatedAt: state?.timestamp ?? null,
  };
}

export async function evaluateServerAlertsForUser(
  userId: string,
  environment: "web" | "desktop" | "mobile" | "server" = "server",
): Promise<AlertEvaluationResult> {
  const evaluatedAt = new Date().toISOString();
  lastEvaluationIso = evaluatedAt;
  let hasDbEvaluationLock = false;
  if (!envBool("ALERTS_ENABLED", true)) {
    return { evaluatedAt, detected: 0, created: 0, suppressed: [{ type: "*", reason: "alerts_disabled" }], alerts: [] };
  }

  const now = Date.now();
  if (now - lastEvaluationAt < MIN_EVALUATION_INTERVAL_MS) {
    return { evaluatedAt, detected: 0, created: 0, suppressed: [{ type: "*", reason: "evaluation_throttled" }], alerts: [] };
  }
  lastEvaluationAt = now;

  try {
    if (pool) {
      const lock = await pool.query("SELECT pg_try_advisory_lock($1) AS locked", [ALERT_EVALUATION_ADVISORY_LOCK]);
      hasDbEvaluationLock = lock.rows[0]?.locked === true;
      if (!hasDbEvaluationLock) {
        return {
          evaluatedAt,
          detected: 0,
          created: 0,
          suppressed: [{ type: "*", reason: "evaluation_locked" }],
          alerts: [],
        };
      }
    }

    const preferences = await alertStore.getPreferences(userId);
    const terminalState = await getTerminalState();
    const current = buildSnapshot(terminalState);
    const candidates = detectGammaAndMarketAlerts(current, previousSnapshot, {
      now: new Date(now),
      userId,
      source: "terminal-state",
      proximityThresholdPct: preferences.proximity.mode === "percent" ? preferences.proximity.percent / 100 : undefined,
      volatilityThresholdPct:
        preferences.proximity.mode === "volatility"
          ? Math.max(0.0015, Math.min(0.012, preferences.proximity.percent / 100))
          : undefined,
    });
    previousSnapshot = current;

    const suppressed: Array<{ type: string; reason: string }> = [];
    const alerts: AlertEvent[] = [];

    for (const candidate of candidates) {
      const rule = getAlertRule(candidate.type);
      if (!rule) {
        suppressed.push({ type: candidate.type, reason: "no_rule" });
        continue;
      }
      if (rule.featureFlag && !envBool(rule.featureFlag, false)) {
        suppressed.push({ type: candidate.type, reason: "feature_disabled" });
        continue;
      }
      const decision = evaluateAlertPolicy(policyState, rule, candidate, preferences, {
        now: new Date(now),
        environment,
      });
      if (!decision.allowed || !decision.event) {
        suppressed.push({ type: candidate.type, reason: decision.reason ?? "policy_suppressed" });
        continue;
      }
      const saved = await alertStore.upsert(decision.event);
      alerts.push(saved);
      for (const channel of decision.channels) {
        const provider =
          channel === "desktop_native"
            ? "tauri_native"
            : channel === "web_notification"
              ? "web_notification"
              : channel === "mobile_push"
                ? "mobile_push"
                : "in_app";
        await alertStore.addDelivery({
          id: `${saved.id}:${channel}:${now}`,
          alertId: saved.id,
          userId,
          channel,
          provider,
          status: "queued",
          attemptedAt: evaluatedAt,
          createdAt: evaluatedAt,
          retryCount: 0,
        });
      }
    }

    if (candidates.length > 0) {
      console.log("[alerts] evaluation", {
        userId,
        detected: candidates.length,
        created: alerts.length,
        suppressed: suppressed.length,
      });
    }

    lastSuccessfulEvaluationAt = evaluatedAt;
    lastEvaluationError = null;
    return {
      evaluatedAt,
      detected: candidates.length,
      created: alerts.length,
      suppressed,
      alerts,
    };
  } catch (error) {
    lastEvaluationError = error instanceof Error ? error.message : "alert_evaluation_failed";
    throw error;
  } finally {
    if (hasDbEvaluationLock && pool) {
      await pool.query("SELECT pg_advisory_unlock($1)", [ALERT_EVALUATION_ADVISORY_LOCK]).catch(() => undefined);
    }
  }
}
