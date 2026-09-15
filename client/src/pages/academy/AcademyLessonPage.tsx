import { ArrowLeft, ChevronLeft, ChevronRight, FlaskConical, LockKeyhole } from "lucide-react";
import { Link, useRoute } from "wouter";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import NotFound from "@/pages/not-found";
import { AcademyContentRenderer } from "@/components/academy/AcademyContentRenderer";
import { AcademyLessonAccessBoundary } from "@/components/academy/AcademyLessonAccessBoundary";
import { AcademyLessonCompletion } from "@/components/academy/AcademyProgress";
import {
  getAcademyCourseBySlug,
  getAcademyLessonBySlug,
  getAcademyLessonContext,
  getAdjacentAcademyLessons,
  type AcademyAccess,
  type AcademyCourse,
  type AcademyLesson,
} from "@/academy/catalog";

function formatLabType(value: string): string {
  return value.replace(/_/g, " ");
}

function lessonHref(course: AcademyCourse, lesson: AcademyLesson): string {
  return `/academy/${course.slug}/${lesson.slug}`;
}

function AccessBadge({ access }: { access: AcademyAccess }) {
  const classes = access === "MEMBER"
    ? "border-violet-400/30 bg-violet-400/10 text-violet-200"
    : "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${classes}`}>{access}</span>;
}

function LessonBreadcrumb({ course, lesson }: { course: AcademyCourse; lesson: AcademyLesson }) {
  const context = getAcademyLessonContext(course, lesson);
  return (
    <nav aria-label="Academy breadcrumb" className="flex flex-wrap items-center gap-2 text-xs text-[#7f8794]">
      <Link href="/academy" className="transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff3b3b]/70">Academy</Link>
      <span aria-hidden="true">→</span>
      <Link href={`/academy/${course.slug}`} className="max-w-full truncate transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff3b3b]/70">{course.title}</Link>
      <span aria-hidden="true">→</span>
      <span className="max-w-full truncate">{context.module?.title ?? "Module"}</span>
      <span aria-hidden="true">→</span>
      <span className="max-w-full truncate text-[#c4cad4]">{lesson.title}</span>
    </nav>
  );
}

function LabSection({ lesson }: { lesson: AcademyLesson }) {
  if (!lesson.labType && !lesson.terminalTarget) return null;
  return (
    <section className="rounded-2xl border border-[#ff3b3b]/25 bg-[#ff3b3b]/[0.05] p-5 sm:p-6" aria-label="Interactive lab placeholder">
      <div className="flex items-start gap-3">
        <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-[#ff8a8a]" aria-hidden="true" />
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white">Interactive Lab</h2>
          <p className="mt-2 text-sm leading-7 text-[#b9c0cb]">Terminal integration will be available in a later Academy phase.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {lesson.labType && lesson.labType !== "NONE" ? <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.13em] text-[#c4cad4]">{formatLabType(lesson.labType)}</span> : null}
            {lesson.terminalTarget ? <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.13em] text-[#c4cad4]">{formatLabType(lesson.terminalTarget)}</span> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function CurriculumNavigation({ course, lesson }: { course: AcademyCourse; lesson: AcademyLesson }) {
  const currentModule = getAcademyLessonContext(course, lesson).module;
  const content = (
    <div className="space-y-5">
      {course.modules.map((module) => (
        <section key={module.id} aria-label={module.title}>
          <h3 className={`mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] ${module.id === currentModule?.id ? "text-[#ff8a8a]" : "text-[#7f8794]"}`}>{String(module.order).padStart(2, "0")} · {module.title}</h3>
          <div className="space-y-1">
            {module.lessons.map((candidate) => {
              const isCurrent = candidate.id === lesson.id;
              return (
                <Link
                  key={candidate.id}
                  href={lessonHref(course, candidate)}
                  aria-current={isCurrent ? "page" : undefined}
                  className={`flex items-start gap-2 rounded-lg px-2.5 py-2 text-xs leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff3b3b]/70 ${isCurrent ? "bg-[#ff3b3b]/10 text-white" : "text-[#8f98a6] hover:bg-white/[0.04] hover:text-white"}`}
                >
                  {candidate.access === "MEMBER" ? <LockKeyhole className="mt-1 h-3 w-3 shrink-0 text-violet-300/80" aria-hidden="true" /> : <span className="w-3 shrink-0" aria-hidden="true" />}
                  <span className="min-w-0 flex-1">{String(candidate.order).padStart(2, "0")} {candidate.title}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block lg:sticky lg:top-8 lg:self-start" aria-label="Course curriculum navigation">
        <div className="rounded-2xl border border-white/[0.09] bg-[#050505]/80 p-4">
          <div className="mb-5 flex items-center justify-between gap-3 border-b border-white/[0.07] pb-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white">Course curriculum</div>
            <span className="text-[10px] text-[#7f8794]">{course.modules.length} modules</span>
          </div>
          {content}
        </div>
      </aside>
      <details className="lg:hidden">
        <summary className="cursor-pointer rounded-xl border border-white/[0.09] bg-[#050505]/80 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff3b3b]/70">Course curriculum</summary>
        <div className="mt-3 rounded-2xl border border-white/[0.09] bg-[#050505]/80 p-4">{content}</div>
      </details>
    </>
  );
}

function LessonNavigation({ course, lesson }: { course: AcademyCourse; lesson: AcademyLesson }) {
  const { previous, next } = getAdjacentAcademyLessons(course, lesson);
  const previousModule = previous ? getAcademyLessonContext(course, previous).module : undefined;
  const nextModule = next ? getAcademyLessonContext(course, next).module : undefined;
  if (!previous && !next) return null;

  return (
    <nav aria-label="Lesson navigation" className="grid gap-3 border-t border-white/[0.08] pt-8 sm:grid-cols-2">
      {previous ? (
        <Link href={lessonHref(course, previous)} className="group rounded-2xl border border-white/[0.09] bg-[#050505]/80 p-5 transition-colors hover:border-white/[0.2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff3b3b]/70">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f8794]"><ChevronLeft className="h-4 w-4" aria-hidden="true" />Previous lesson</div>
          <div className="mt-3 text-sm font-medium text-[#e5e7eb] group-hover:text-white">{previous.title}</div>
          {previousModule ? <div className="mt-2 text-[11px] text-[#737b88]">{previousModule.title}</div> : null}
        </Link>
      ) : <div aria-hidden="true" />}
      {next ? (
        <Link href={lessonHref(course, next)} className="group rounded-2xl border border-white/[0.09] bg-[#050505]/80 p-5 text-left transition-colors hover:border-white/[0.2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff3b3b]/70 sm:text-right">
          <div className="flex items-center justify-start gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7f8794] sm:justify-end">Next lesson<ChevronRight className="h-4 w-4" aria-hidden="true" /></div>
          <div className="mt-3 text-sm font-medium text-[#e5e7eb] group-hover:text-white">{next.title}</div>
          {nextModule ? <div className="mt-2 text-[11px] text-[#737b88]">{nextModule.title}</div> : null}
        </Link>
      ) : null}
    </nav>
  );
}

export default function AcademyLessonPage() {
  const [, params] = useRoute("/academy/:courseSlug/:lessonSlug");
  const course = params?.courseSlug ? getAcademyCourseBySlug(params.courseSlug) : undefined;
  const lesson = course && params?.lessonSlug ? getAcademyLessonBySlug(course, params.lessonSlug) : undefined;

  if (!course || !lesson) return <NotFound />;

  const context = getAcademyLessonContext(course, lesson);
  const isFeatured = course.slug === "goodtrading-playbook";
  return (
    <MarketingLayout>
      <main data-academy-lesson-page={lesson.slug} className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-20">
        <LessonBreadcrumb course={course} lesson={lesson} />
        <div className="mt-8 grid gap-10 lg:grid-cols-[250px_minmax(0,1fr)] lg:items-start lg:gap-12">
          <CurriculumNavigation course={course} lesson={lesson} />
          <article className={isFeatured ? "rounded-3xl border border-[#ff3b3b]/25 bg-[#0a0707]/50 p-5 sm:p-8 lg:p-10" : "rounded-3xl border border-white/[0.08] bg-[#050505]/50 p-5 sm:p-8 lg:p-10"}>
            <Link href={`/academy/${course.slug}`} className="inline-flex items-center gap-2 text-sm font-medium text-[#aeb6c2] transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff3b3b]/70">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to {course.title}
            </Link>
            <div className="mt-8 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.17em]">
              <span className="text-[#ff8a8a]">{course.track}</span>
              <span className="text-[#515865]">/</span>
              <span className="text-[#7f8794]">{course.number}</span>
              <span className="text-[#515865]">/</span>
              <span className="text-[#7f8794]">{context.module?.title}</span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">Lesson {context.position} of {context.total}</span>
              <AccessBadge access={lesson.access} />
              <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">{course.level}</span>
            </div>
            <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-[-0.04em] text-white sm:text-6xl">{lesson.title}</h1>
            <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm text-[#929aa7]">
              <span>{lesson.estimatedMinutes} min estimated</span>
              <span>{course.title}</span>
            </div>
            <div className="mt-10">
              <AcademyLessonAccessBoundary courseSlug={course.slug} lesson={lesson}>
                {(blocks) => (
                  <>
                    <AcademyContentRenderer blocks={blocks} />
                    <div className="mt-6"><AcademyLessonCompletion lessonId={lesson.id} /></div>
                  </>
                )}
              </AcademyLessonAccessBoundary>
            </div>
            <div className="mt-8"><LabSection lesson={lesson} /></div>
            <div className="mt-10"><LessonNavigation course={course} lesson={lesson} /></div>
          </article>
        </div>
      </main>
    </MarketingLayout>
  );
}
