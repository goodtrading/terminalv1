import { LockKeyhole } from "lucide-react";
import type { AcademyAccess, AcademyLesson } from "@/academy/catalog";

function AccessBadge({ access }: { access: AcademyAccess }) {
  return (
    <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-200">
      {access}
    </span>
  );
}

export function AcademyLessonAccessBoundary({ lesson, children }: { lesson: AcademyLesson; children: React.ReactNode }) {
  if (lesson.access === "FREE") return <>{children}</>;

  return (
    <section className="rounded-2xl border border-violet-400/25 bg-violet-400/[0.06] p-6 sm:p-8" aria-label="Member lesson presentation boundary">
      <div className="flex items-start gap-4">
        <div className="rounded-xl border border-violet-300/20 bg-violet-300/10 p-3 text-violet-200">
          <LockKeyhole className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-white">Member lesson</h2>
            <AccessBadge access={lesson.access} />
          </div>
          <p className="mt-3 text-sm leading-7 text-[#b9aeca]">
            This lesson is part of the Academy member curriculum. Entitlement checks will be connected in a later phase.
          </p>
          <p className="mt-2 text-xs leading-6 text-[#8f829e]">This is a presentation boundary only; no authorization decision was made here.</p>
        </div>
      </div>
    </section>
  );
}
