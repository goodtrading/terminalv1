import type { AcademyMemberContentResponse } from "@shared/academy-content";
import { EXECUTION_AND_RISK_MEMBER_CONTENT } from "./content/executionAndRisk";
import { ORDER_FLOW_FOUNDATIONS_MEMBER_CONTENT } from "./content/orderFlowFoundations";
import { FOOTPRINT_MASTERY_MEMBER_CONTENT } from "./content/footprintMastery";

const MEMBER_CONTENT: ReadonlyMap<string, AcademyMemberContentResponse> = new Map(
  [
    ...Array.from(EXECUTION_AND_RISK_MEMBER_CONTENT.entries()),
    ...Array.from(ORDER_FLOW_FOUNDATIONS_MEMBER_CONTENT.entries()),
    ...Array.from(FOOTPRINT_MASTERY_MEMBER_CONTENT.entries()),
  ],
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
