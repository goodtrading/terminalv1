import { LockKeyhole } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { AcademyAccess, AcademyContentBlock, AcademyLesson } from "@/academy/catalog";
import { resolveAcademyLessonAccess } from "@/academy/access";
import { fetchAcademyMemberContent, AcademyMemberContentError } from "@/academy/contentClient";
import { useTerminalAuth } from "@/contexts/TerminalAuthContext";
import { Button } from "@/components/ui/button";

function AccessBadge({ access }: { access: AcademyAccess }) {
  return (
    <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-200">
      {access}
    </span>
  );
}

function GateAction({ reason }: { reason: "SIGNED_OUT" | "NO_ENTITLEMENT" | "UNKNOWN" }) {
  if (reason === "SIGNED_OUT") {
    return (
      <div className="mt-5 flex flex-wrap gap-3">
        <Button asChild size="sm"><Link href="/login">Sign in</Link></Button>
        <Button asChild size="sm" variant="outline"><Link href="/register">Create account</Link></Button>
      </div>
    );
  }
  return <Button asChild size="sm" className="mt-5"><Link href="/pricing">View Membership</Link></Button>;
}

function ContentUnavailable({ error }: { error: AcademyMemberContentError }) {
  const isNotFound = error.code === "NOT_FOUND";
  return (
    <section className="rounded-2xl border border-violet-400/25 bg-violet-400/[0.06] p-6 sm:p-8" aria-label="Member lesson content unavailable">
      <div className="flex items-start gap-4">
        <div className="rounded-xl border border-violet-300/20 bg-violet-300/10 p-3 text-violet-200"><LockKeyhole className="h-5 w-5" aria-hidden="true" /></div>
        <div>
          <h2 className="text-lg font-semibold text-white">Lesson content unavailable</h2>
          <p className="mt-3 text-sm leading-7 text-[#b9aeca]">
            {isNotFound ? "This Member lesson does not have published content yet." : "The lesson remains protected while access is re-verified."}
          </p>
          {!isNotFound ? <Button asChild size="sm" className="mt-5"><Link href="/pricing">View Membership</Link></Button> : null}
        </div>
      </div>
    </section>
  );
}

type AcademyLessonChildren = ReactNode | ((blocks: AcademyContentBlock[]) => ReactNode);

export function AcademyLessonAccessBoundary({ courseSlug, lesson, children }: { courseSlug: string; lesson: AcademyLesson; children: AcademyLessonChildren }) {
  const { authReady, authenticated, access, authError, saasDisabled } = useTerminalAuth();
  const decision = resolveAcademyLessonAccess({
    lesson,
    auth: { authReady, authenticated, access, authError, saasDisabled },
  });
  const isMember = lesson.access === "MEMBER";
  const memberQuery = useQuery({
    queryKey: ["academy-member-content", lesson.id],
    queryFn: ({ signal }) => fetchAcademyMemberContent(
      courseSlug,
      lesson.slug,
      signal,
    ),
    enabled: isMember && decision.canView,
    retry: false,
    staleTime: 60_000,
  });

  if (lesson.access === "FREE") {
    return <>{typeof children === "function" ? children(lesson.content ?? []) : children}</>;
  }
  if (!decision.canView) {
    if (decision.reason === "LOADING") {
      return <section className="rounded-2xl border border-white/[0.09] bg-[#050505]/70 p-6 sm:p-8" aria-label="Verifying membership access" aria-busy="true"><p className="text-sm leading-7 text-[#9ca3af]">Verifying lesson access…</p></section>;
    }
    const isFailure = decision.reason === "UNKNOWN";
    const explanation = isFailure
      ? "Access could not be verified right now. The lesson remains protected while we confirm the current account state."
      : "This lesson is part of the advanced GoodTrading curriculum.";
    const actionReason = decision.reason === "SIGNED_OUT" || decision.reason === "NO_ENTITLEMENT" ? decision.reason : "UNKNOWN";
    return (
      <section className="rounded-2xl border border-violet-400/25 bg-violet-400/[0.06] p-6 sm:p-8" aria-label="Member lesson gate">
        <div className="flex items-start gap-4">
          <div className="rounded-xl border border-violet-300/20 bg-violet-300/10 p-3 text-violet-200"><LockKeyhole className="h-5 w-5" aria-hidden="true" /></div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold text-white">Continue with GoodTrading Membership</h2><AccessBadge access="MEMBER" /></div>
            <p className="mt-3 text-sm leading-7 text-[#b9aeca]">{explanation}</p>
            {!isFailure ? <p className="mt-2 text-xs leading-6 text-[#8f829e]">Member lessons may include operational frameworks, advanced confluences, market replays and GoodTrading playbooks.</p> : null}
            <GateAction reason={actionReason} />
          </div>
        </div>
      </section>
    );
  }

  if (memberQuery.isLoading) {
    return <section className="rounded-2xl border border-white/[0.09] bg-[#050505]/70 p-6 sm:p-8" aria-label="Loading lesson content" aria-busy="true"><p className="text-sm leading-7 text-[#9ca3af]">Loading lesson content…</p></section>;
  }
  if (memberQuery.isError) {
    const error = memberQuery.error instanceof AcademyMemberContentError
      ? memberQuery.error
      : new AcademyMemberContentError("NETWORK", "Content request failed");
    return <ContentUnavailable error={error} />;
  }
  if (!memberQuery.data?.content?.length) {
    return <ContentUnavailable error={new AcademyMemberContentError("NOT_FOUND", "Lesson content not found")} />;
  }
  return <>{typeof children === "function" ? children(memberQuery.data.content) : children}</>;
}
