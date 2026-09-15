import { apiUrl } from "@/lib/apiBase";
import type { AcademyMemberContentResponse } from "@shared/academy-content";

export type AcademyMemberContentErrorCode = "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "NETWORK";

export class AcademyMemberContentError extends Error {
  constructor(public readonly code: AcademyMemberContentErrorCode, message: string) {
    super(message);
    this.name = "AcademyMemberContentError";
  }
}

export async function fetchAcademyMemberContent(
  courseSlug: string,
  lessonSlug: string,
  signal?: AbortSignal,
): Promise<AcademyMemberContentResponse> {
  const response = await fetch(
    apiUrl(`/api/academy/lessons/${encodeURIComponent(courseSlug)}/${encodeURIComponent(lessonSlug)}/content`),
    { credentials: "include", signal },
  ).catch((error: unknown) => {
    throw new AcademyMemberContentError("NETWORK", error instanceof Error ? error.message : "Network error");
  });

  if (response.ok) return (await response.json()) as AcademyMemberContentResponse;
  if (response.status === 401) throw new AcademyMemberContentError("UNAUTHORIZED", "Authentication required");
  if (response.status === 403) throw new AcademyMemberContentError("FORBIDDEN", "Membership access required");
  if (response.status === 404) throw new AcademyMemberContentError("NOT_FOUND", "Lesson content not found");
  throw new AcademyMemberContentError("NETWORK", `Content request failed (${response.status})`);
}
