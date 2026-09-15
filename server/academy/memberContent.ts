import type { AcademyMemberContentResponse } from "@shared/academy-content";
import { EXECUTION_AND_RISK_MEMBER_CONTENT } from "./content/executionAndRisk";

const MEMBER_CONTENT: ReadonlyMap<string, AcademyMemberContentResponse> = new Map(
  EXECUTION_AND_RISK_MEMBER_CONTENT,
);

export function getMemberContentByLessonId(lessonId: string): AcademyMemberContentResponse | undefined {
  return MEMBER_CONTENT.get(lessonId);
}

export function hasMemberContentForLessonId(lessonId: string): boolean {
  return MEMBER_CONTENT.has(lessonId);
}

export function getMemberContentLessonCount(): number {
  return MEMBER_CONTENT.size;
}
