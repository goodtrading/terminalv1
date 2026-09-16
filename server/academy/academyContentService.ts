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
