import type { Request, Response } from "express";
import { getAccessForUserId, type AccessSnapshot } from "../services/accessService";
import { getMemberContentByLessonId } from "./memberContent";
import type { AcademyMemberContentResponse } from "@shared/academy-content";

const MEMBER_ROUTE_INDEX: ReadonlyMap<string, { lessonId: string }> = new Map([
  ["execution-and-risk/execution-and-risk-20-aggressive-vs-confirmed-entry", { lessonId: "course-02-execution-and-risk-module-04-lesson-01" }],
  ["execution-and-risk/execution-and-risk-21-choosing-invalidation", { lessonId: "course-02-execution-and-risk-module-04-lesson-02" }],
  ["execution-and-risk/execution-and-risk-22-limit-vs-market-in-context", { lessonId: "course-02-execution-and-risk-module-04-lesson-03" }],
  ["execution-and-risk/execution-and-risk-23-partial-management", { lessonId: "course-02-execution-and-risk-module-04-lesson-04" }],
  ["execution-and-risk/execution-and-risk-24-when-not-to-move-to-break-even", { lessonId: "course-02-execution-and-risk-module-04-lesson-05" }],
  ["execution-and-risk/execution-and-risk-25-managing-around-liquidity", { lessonId: "course-02-execution-and-risk-module-04-lesson-06" }],
  ["execution-and-risk/execution-and-risk-26-execution-replay", { lessonId: "course-02-execution-and-risk-module-04-lesson-07" }],
  ["order-flow-foundations/order-flow-foundations-25-absorption-context", { lessonId: "course-03-order-flow-foundations-module-05-lesson-01" }],
  ["order-flow-foundations/order-flow-foundations-26-absorption-open-interest", { lessonId: "course-03-order-flow-foundations-module-05-lesson-02" }],
  ["order-flow-foundations/order-flow-foundations-27-failed-absorption", { lessonId: "course-03-order-flow-foundations-module-05-lesson-03" }],
  ["order-flow-foundations/order-flow-foundations-28-contextual-delta", { lessonId: "course-03-order-flow-foundations-module-05-lesson-04" }],
  ["order-flow-foundations/order-flow-foundations-29-trapped-traders", { lessonId: "course-03-order-flow-foundations-module-05-lesson-05" }],
  ["order-flow-foundations/order-flow-foundations-30-continuation-vs-reversal", { lessonId: "course-03-order-flow-foundations-module-05-lesson-06" }],
  ["order-flow-foundations/order-flow-foundations-31-when-to-ignore-an-of-signal", { lessonId: "course-03-order-flow-foundations-module-05-lesson-07" }],
  ["order-flow-foundations/order-flow-foundations-32-goodtrading-order-flow-replay-lab", { lessonId: "course-03-order-flow-foundations-module-06-lesson-01" }],
  ["footprint-mastery/footprint-mastery-24-absorption-oi", { lessonId: "course-04-footprint-mastery-module-05-lesson-01" }],
  ["footprint-mastery/footprint-mastery-25-repeated-absorption-in-context", { lessonId: "course-04-footprint-mastery-module-05-lesson-02" }],
  ["footprint-mastery/footprint-mastery-26-footprint-gamma", { lessonId: "course-04-footprint-mastery-module-05-lesson-03" }],
  ["footprint-mastery/footprint-mastery-27-footprint-heatmap", { lessonId: "course-04-footprint-mastery-module-05-lesson-04" }],
  ["footprint-mastery/footprint-mastery-28-trade-wait-framework", { lessonId: "course-04-footprint-mastery-module-05-lesson-05" }],
  ["footprint-mastery/footprint-mastery-29-footprint-replay-lab", { lessonId: "course-04-footprint-mastery-module-05-lesson-06" }],
  ["dom-and-liquidity/dom-and-liquidity-19-wall-defended-vs-wall-fake", { lessonId: "course-05-dom-and-liquidity-module-04-lesson-01" }],
  ["dom-and-liquidity/dom-and-liquidity-20-pull-before-touch", { lessonId: "course-05-dom-and-liquidity-module-04-lesson-02" }],
  ["dom-and-liquidity/dom-and-liquidity-21-real-replenishment", { lessonId: "course-05-dom-and-liquidity-module-04-lesson-03" }],
  ["dom-and-liquidity/dom-and-liquidity-22-liquidity-migration-in-context", { lessonId: "course-05-dom-and-liquidity-module-04-lesson-04" }],
  ["dom-and-liquidity/dom-and-liquidity-23-aggressor-passive-interaction", { lessonId: "course-05-dom-and-liquidity-module-04-lesson-05" }],
  ["dom-and-liquidity/dom-and-liquidity-24-dom-execution-setups", { lessonId: "course-05-dom-and-liquidity-module-04-lesson-06" }],
  ["dom-and-liquidity/dom-and-liquidity-25-dom-replay-lab", { lessonId: "course-05-dom-and-liquidity-module-04-lesson-07" }],
  ["heatmap-and-bookmap/heatmap-and-bookmap-19-what-is-passive-compression", { lessonId: "course-06-heatmap-and-bookmap-module-04-lesson-01" }],
  ["heatmap-and-bookmap/heatmap-and-bookmap-20-valid-compression", { lessonId: "course-06-heatmap-and-bookmap-module-04-lesson-02" }],
  ["heatmap-and-bookmap/heatmap-and-bookmap-21-bullish-passive-compression", { lessonId: "course-06-heatmap-and-bookmap-module-04-lesson-03" }],
  ["heatmap-and-bookmap/heatmap-and-bookmap-22-bearish-passive-compression", { lessonId: "course-06-heatmap-and-bookmap-module-04-lesson-04" }],
  ["heatmap-and-bookmap/heatmap-and-bookmap-23-compression-breakout", { lessonId: "course-06-heatmap-and-bookmap-module-04-lesson-05" }],
  ["heatmap-and-bookmap/heatmap-and-bookmap-24-compression-failure", { lessonId: "course-06-heatmap-and-bookmap-module-04-lesson-06" }],
  ["heatmap-and-bookmap/heatmap-and-bookmap-25-compression-oi", { lessonId: "course-06-heatmap-and-bookmap-module-04-lesson-07" }],
  ["heatmap-and-bookmap/heatmap-and-bookmap-26-compression-gamma", { lessonId: "course-06-heatmap-and-bookmap-module-04-lesson-08" }],
  ["heatmap-and-bookmap/heatmap-and-bookmap-27-compression-spoofing", { lessonId: "course-06-heatmap-and-bookmap-module-04-lesson-09" }],
  ["heatmap-and-bookmap/heatmap-and-bookmap-28-entry-and-invalidation", { lessonId: "course-06-heatmap-and-bookmap-module-04-lesson-10" }],
  ["heatmap-and-bookmap/heatmap-and-bookmap-32-absorption-around-walls", { lessonId: "course-06-heatmap-and-bookmap-module-05-lesson-04" }],
  ["heatmap-and-bookmap/heatmap-and-bookmap-33-aggressive-exhaustion", { lessonId: "course-06-heatmap-and-bookmap-module-05-lesson-05" }],
  ["heatmap-and-bookmap/heatmap-and-bookmap-34-failed-liquidity-defence", { lessonId: "course-06-heatmap-and-bookmap-module-05-lesson-06" }],
  ["heatmap-and-bookmap/heatmap-and-bookmap-35-goodtrading-heatmap-replay-lab", { lessonId: "course-06-heatmap-and-bookmap-module-06-lesson-01" }],
  ["open-interest-and-derivatives/open-interest-and-derivatives-16-oi-aggression", { lessonId: "course-07-open-interest-and-derivatives-module-04-lesson-01" }],
  ["open-interest-and-derivatives/open-interest-and-derivatives-17-oi-absorption", { lessonId: "course-07-open-interest-and-derivatives-module-04-lesson-02" }],
  ["open-interest-and-derivatives/open-interest-and-derivatives-18-oi-passive-compression", { lessonId: "course-07-open-interest-and-derivatives-module-04-lesson-03" }],
  ["open-interest-and-derivatives/open-interest-and-derivatives-19-oi-breakout", { lessonId: "course-07-open-interest-and-derivatives-module-04-lesson-04" }],
  ["open-interest-and-derivatives/open-interest-and-derivatives-20-oi-gamma", { lessonId: "course-07-open-interest-and-derivatives-module-04-lesson-05" }],
  ["open-interest-and-derivatives/open-interest-and-derivatives-21-btc-positioning-case-studies", { lessonId: "course-07-open-interest-and-derivatives-module-04-lesson-06" }],
  ["gamma-and-dealer-hedging/gamma-and-dealer-hedging-29-how-to-prioritize-expirations", { lessonId: "course-09-gamma-and-dealer-hedging-module-07-lesson-01" }],
  ["gamma-and-dealer-hedging/gamma-and-dealer-hedging-30-how-to-prioritize-zones", { lessonId: "course-09-gamma-and-dealer-hedging-module-07-lesson-02" }],
  ["gamma-and-dealer-hedging/gamma-and-dealer-hedging-31-gamma-flip-acceptance", { lessonId: "course-09-gamma-and-dealer-hedging-module-07-lesson-03" }],
  ["gamma-and-dealer-hedging/gamma-and-dealer-hedging-32-gamma-flip-rejection", { lessonId: "course-09-gamma-and-dealer-hedging-module-07-lesson-04" }],
  ["gamma-and-dealer-hedging/gamma-and-dealer-hedging-33-magnet-rotation", { lessonId: "course-09-gamma-and-dealer-hedging-module-07-lesson-05" }],
  ["gamma-and-dealer-hedging/gamma-and-dealer-hedging-34-gamma-order-flow", { lessonId: "course-09-gamma-and-dealer-hedging-module-07-lesson-06" }],
  ["gamma-and-dealer-hedging/gamma-and-dealer-hedging-35-gamma-liquidity", { lessonId: "course-09-gamma-and-dealer-hedging-module-07-lesson-07" }],
  ["gamma-and-dealer-hedging/gamma-and-dealer-hedging-36-gamma-open-interest", { lessonId: "course-09-gamma-and-dealer-hedging-module-07-lesson-08" }],
  ["gamma-and-dealer-hedging/gamma-and-dealer-hedging-37-when-to-ignore-gamma", { lessonId: "course-09-gamma-and-dealer-hedging-module-07-lesson-09" }],
  ["gamma-and-dealer-hedging/gamma-and-dealer-hedging-38-gamma-invalidation", { lessonId: "course-09-gamma-and-dealer-hedging-module-07-lesson-10" }],
  ["gamma-and-dealer-hedging/gamma-and-dealer-hedging-39-real-market-replay", { lessonId: "course-09-gamma-and-dealer-hedging-module-07-lesson-11" }],
  ["market-structure-and-context/market-structure-and-context-20-market-state-classification", { lessonId: "course-10-market-structure-and-context-module-05-lesson-01" }],
  ["market-structure-and-context/market-structure-and-context-21-building-context-before-entry", { lessonId: "course-10-market-structure-and-context-module-05-lesson-02" }],
  ["market-structure-and-context/market-structure-and-context-22-context-market-scan", { lessonId: "course-10-market-structure-and-context-module-05-lesson-03" }],
  ["goodtrading-playbook/goodtrading-playbook-09-goodtrading-market-scan", { lessonId: "course-11-goodtrading-playbook-module-02-lesson-01" }],
  ["goodtrading-playbook/goodtrading-playbook-10-trade-wait-invalid", { lessonId: "course-11-goodtrading-playbook-module-02-lesson-02" }],
  ["goodtrading-playbook/goodtrading-playbook-11-gamma-flip-rejection", { lessonId: "course-11-goodtrading-playbook-module-03-lesson-01" }],
  ["goodtrading-playbook/goodtrading-playbook-12-gamma-flip-acceptance", { lessonId: "course-11-goodtrading-playbook-module-03-lesson-02" }],
  ["goodtrading-playbook/goodtrading-playbook-13-magnet-rotation", { lessonId: "course-11-goodtrading-playbook-module-03-lesson-03" }],
  ["goodtrading-playbook/goodtrading-playbook-14-passive-compression-breakout", { lessonId: "course-11-goodtrading-playbook-module-03-lesson-04" }],
  ["goodtrading-playbook/goodtrading-playbook-15-compression-failure", { lessonId: "course-11-goodtrading-playbook-module-03-lesson-05" }],
  ["goodtrading-playbook/goodtrading-playbook-16-liquidity-wall-rejection", { lessonId: "course-11-goodtrading-playbook-module-03-lesson-06" }],
  ["goodtrading-playbook/goodtrading-playbook-17-liquidity-pull-continuation", { lessonId: "course-11-goodtrading-playbook-module-03-lesson-07" }],
  ["goodtrading-playbook/goodtrading-playbook-18-spoof-execution", { lessonId: "course-11-goodtrading-playbook-module-03-lesson-08" }],
  ["goodtrading-playbook/goodtrading-playbook-19-absorption-reversal", { lessonId: "course-11-goodtrading-playbook-module-03-lesson-09" }],
  ["goodtrading-playbook/goodtrading-playbook-20-failed-breakout", { lessonId: "course-11-goodtrading-playbook-module-03-lesson-10" }],
  ["goodtrading-playbook/goodtrading-playbook-21-goodtrading-market-replay", { lessonId: "course-11-goodtrading-playbook-module-04-lesson-01" }],
  ["goodtrading-playbook/goodtrading-playbook-22-complete-market-scan", { lessonId: "course-11-goodtrading-playbook-module-04-lesson-02" }],
  ["btc-scalping/btc-scalping-08-gamma-compression", { lessonId: "course-12-btc-scalping-module-02-lesson-01" }],
  ["btc-scalping/btc-scalping-09-absorption-entry", { lessonId: "course-12-btc-scalping-module-02-lesson-02" }],
  ["btc-scalping/btc-scalping-10-pulling", { lessonId: "course-12-btc-scalping-module-02-lesson-03" }],
  ["btc-scalping/btc-scalping-11-spoofing", { lessonId: "course-12-btc-scalping-module-02-lesson-04" }],
  ["btc-scalping/btc-scalping-12-entry-timing", { lessonId: "course-12-btc-scalping-module-02-lesson-05" }],
  ["btc-scalping/btc-scalping-13-stop-placement", { lessonId: "course-12-btc-scalping-module-02-lesson-06" }],
  ["btc-scalping/btc-scalping-14-invalidation", { lessonId: "course-12-btc-scalping-module-02-lesson-07" }],
  ["btc-scalping/btc-scalping-15-partial-management", { lessonId: "course-12-btc-scalping-module-02-lesson-08" }],
  ["btc-scalping/btc-scalping-16-full-tp", { lessonId: "course-12-btc-scalping-module-02-lesson-09" }],
  ["btc-scalping/btc-scalping-17-failed-setup", { lessonId: "course-12-btc-scalping-module-02-lesson-10" }],
  ["btc-scalping/btc-scalping-18-winning-long", { lessonId: "course-12-btc-scalping-module-03-lesson-01" }],
  ["btc-scalping/btc-scalping-19-winning-short", { lessonId: "course-12-btc-scalping-module-03-lesson-02" }],
  ["btc-scalping/btc-scalping-20-losing-long", { lessonId: "course-12-btc-scalping-module-03-lesson-03" }],
  ["btc-scalping/btc-scalping-21-losing-short", { lessonId: "course-12-btc-scalping-module-03-lesson-04" }],
  ["btc-scalping/btc-scalping-22-no-trade", { lessonId: "course-12-btc-scalping-module-03-lesson-05" }],
  ["btc-scalping/btc-scalping-23-good-decision-bad-outcome", { lessonId: "course-12-btc-scalping-module-03-lesson-06" }],
  ["btc-scalping/btc-scalping-24-bad-decision-good-outcome", { lessonId: "course-12-btc-scalping-module-03-lesson-07" }],
  ["btc-scalping/btc-scalping-25-btc-scalping-replay", { lessonId: "course-12-btc-scalping-module-04-lesson-01" }],
  ["strategy-lab-and-research/strategy-lab-and-research-16-create-a-strategy", { lessonId: "course-13-strategy-lab-and-research-module-03-lesson-01" }],
  ["strategy-lab-and-research/strategy-lab-and-research-17-conditions", { lessonId: "course-13-strategy-lab-and-research-module-03-lesson-02" }],
  ["strategy-lab-and-research/strategy-lab-and-research-18-triggers", { lessonId: "course-13-strategy-lab-and-research-module-03-lesson-03" }],
  ["strategy-lab-and-research/strategy-lab-and-research-19-filters", { lessonId: "course-13-strategy-lab-and-research-module-03-lesson-04" }],
  ["strategy-lab-and-research/strategy-lab-and-research-20-run-test", { lessonId: "course-13-strategy-lab-and-research-module-03-lesson-05" }],
  ["strategy-lab-and-research/strategy-lab-and-research-21-compare-versions", { lessonId: "course-13-strategy-lab-and-research-module-03-lesson-06" }],
  ["strategy-lab-and-research/strategy-lab-and-research-22-gamma-as-filter", { lessonId: "course-13-strategy-lab-and-research-module-04-lesson-01" }],
  ["strategy-lab-and-research/strategy-lab-and-research-23-oi-as-filter", { lessonId: "course-13-strategy-lab-and-research-module-04-lesson-02" }],
  ["strategy-lab-and-research/strategy-lab-and-research-24-liquidity-conditions", { lessonId: "course-13-strategy-lab-and-research-module-04-lesson-03" }],
  ["strategy-lab-and-research/strategy-lab-and-research-25-market-regime-filters", { lessonId: "course-13-strategy-lab-and-research-module-04-lesson-04" }],
  ["strategy-lab-and-research/strategy-lab-and-research-26-session-filters", { lessonId: "course-13-strategy-lab-and-research-module-04-lesson-05" }],
  ["strategy-lab-and-research/strategy-lab-and-research-27-volatility-filters", { lessonId: "course-13-strategy-lab-and-research-module-04-lesson-06" }],
  ["strategy-lab-and-research/strategy-lab-and-research-28-out-of-sample-validation", { lessonId: "course-13-strategy-lab-and-research-module-05-lesson-01" }],
  ["strategy-lab-and-research/strategy-lab-and-research-29-paper-deployment", { lessonId: "course-13-strategy-lab-and-research-module-05-lesson-02" }],
  ["strategy-lab-and-research/strategy-lab-and-research-30-strategy-iteration", { lessonId: "course-13-strategy-lab-and-research-module-05-lesson-03" }],
  ["strategy-lab-and-research/strategy-lab-and-research-31-final-research-project", { lessonId: "course-13-strategy-lab-and-research-module-05-lesson-04" }],
]);

type AccessResolver = (userId: number) => Promise<AccessSnapshot>;
let accessResolver: AccessResolver = getAccessForUserId;

/** Test seam only; production defaults to the canonical access service. */
export function __setAcademyAccessResolverForTests(resolver: AccessResolver | null): void {
  accessResolver = resolver ?? getAccessForUserId;
}

function routeKey(req: Request): string {
  const courseParam = req.params.courseSlug;
  const lessonParam = req.params.lessonSlug;
  const courseSlug = typeof courseParam === "string" ? courseParam : "";
  const lessonSlug = typeof lessonParam === "string" ? lessonParam : "";
  if (!/^[a-z0-9-]+$/.test(courseSlug) || !/^[a-z0-9-]+$/.test(lessonSlug)) return "";
  return `${courseSlug}/${lessonSlug}`;
}

export async function serveAcademyMemberContent(req: Request, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  const resolved = MEMBER_ROUTE_INDEX.get(routeKey(req));
  if (!resolved) {
    res.status(404).json({ error: "ACADEMY_LESSON_NOT_FOUND" });
    return;
  }

  const userId = req.saasUser?.id;
  if (!userId) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }

  try {
    const access = await accessResolver(userId);
    if (!access.allowed) {
      res.status(403).json({ error: "SUBSCRIPTION_REQUIRED", reason: access.reason });
      return;
    }
    const content: AcademyMemberContentResponse | undefined = getMemberContentByLessonId(resolved.lessonId);
    if (!content) {
      res.status(404).json({ error: "ACADEMY_LESSON_CONTENT_NOT_FOUND" });
      return;
    }
    res.status(200).json(content);
  } catch (error) {
    console.error("[academy-member-content] request failed", error instanceof Error ? error.message : error);
    res.status(500).json({ error: "ACADEMY_CONTENT_FAILED" });
  }
}
