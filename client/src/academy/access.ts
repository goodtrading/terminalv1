import type { AcademyLesson } from "@/academy/catalog";
import type { AccessSnapshot } from "@/contexts/TerminalAuthContext";

export type AcademyAccessReason =
  | "FREE"
  | "MEMBER"
  | "SIGNED_OUT"
  | "NO_ENTITLEMENT"
  | "LOADING"
  | "UNKNOWN";

export type AcademyAccessDecision = {
  canView: boolean;
  reason: AcademyAccessReason;
};

export type AcademyAuthSnapshot = {
  authReady: boolean;
  authenticated: boolean;
  access: AccessSnapshot | null;
  authError: string | null;
  saasDisabled: boolean;
};

/**
 * Maps the existing server-confirmed Terminal access snapshot to Academy UX.
 * Academy access labels remain curriculum metadata, never subscription truth.
 */
export function resolveAcademyLessonAccess({
  lesson,
  auth,
  entitlement = auth.access,
}: {
  lesson: AcademyLesson;
  auth: AcademyAuthSnapshot;
  entitlement?: AccessSnapshot | null;
}): AcademyAccessDecision {
  if (lesson.access === "FREE") return { canView: true, reason: "FREE" };
  if (!auth.authReady) return { canView: false, reason: "LOADING" };
  if (auth.saasDisabled || auth.authError) return { canView: false, reason: "UNKNOWN" };
  if (!auth.authenticated) return { canView: false, reason: "SIGNED_OUT" };
  if (entitlement?.allowed === true) return { canView: true, reason: "MEMBER" };
  if (entitlement?.allowed === false) return { canView: false, reason: "NO_ENTITLEMENT" };
  return { canView: false, reason: "UNKNOWN" };
}

/*
 * Security boundary: catalog content is statically bundled client-side today.
 * This resolver protects the user experience, not proprietary content delivery.
 * Future MEMBER editorial bodies require server authorization and non-public delivery.
 */
