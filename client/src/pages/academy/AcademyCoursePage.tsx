import { LockKeyhole, ArrowLeft, FlaskConical } from "lucide-react";
import { Link, useRoute } from "wouter";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import NotFound from "@/pages/not-found";
import {
  getAcademyCourseBySlug,
  getCourseAccessSummary,
  getCourseEstimatedMinutes,
  getCourseLessonCount,
  getModuleEstimatedMinutes,
  getModuleLessonCount,
  type AcademyAccess,
  type AcademyAccessSummary,
  type AcademyCourse,
  type AcademyLesson,
} from "@/academy/catalog";
import { useAcademyProgress, type AcademyCourseProgress } from "@/academy/progress";
import { AcademyCompletedMark, AcademyProgressBar } from "@/components/academy/AcademyProgress";

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return `${remainingMinutes} min`;
  if (remainingMinutes === 0) return `${hours} h`;
  return `${hours} h ${remainingMinutes} min`;
}

function accessLabelClass(access: AcademyAccess | AcademyAccessSummary): string {
  if (access === "MEMBER") return "border-violet-400/30 bg-violet-400/10 text-violet-200";
  if (access === "FREE + MEMBER") return "border-amber-400/30 bg-amber-400/10 text-amber-200";
  return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
}

function AccessBadge({ access }: { access: AcademyAccess | AcademyAccessSummary }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${accessLabelClass(access)}`}>
      {access}
    </span>
  );
}

function LabMetadata({ lesson }: { lesson: AcademyLesson }) {
  if (!lesson.labType && !lesson.terminalTarget) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[#9ca3af]">
      <FlaskConical className="h-3 w-3 text-[#ff8a8a]" aria-hidden="true" />
      {[lesson.labType !== "NONE" ? lesson.labType : null, lesson.terminalTarget].filter(Boolean).join(" · ")}
    </span>
  );
}

function CourseHeader({ course, courseProgress }: { course: AcademyCourse; courseProgress: AcademyCourseProgress }) {
  const accessSummary = getCourseAccessSummary(course);
  return (
    <header className="border-b border-white/[0.08] pb-10">
      <Link href="/academy" className="inline-flex items-center gap-2 text-sm font-medium text-[#aeb6c2] transition-colors hover:text-white">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Academy
      </Link>
      <div className="mt-8 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]">
        <span className="text-[#ff8a8a]">{course.track}</span>
        <span className="text-[#515865]">/</span>
        <span className="text-[#7f8794]">Course {course.number}</span>
      </div>
      <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.04em] text-white sm:text-6xl">{course.title}</h1>
      <p className="mt-5 max-w-3xl text-base leading-8 text-[#aeb6c2] sm:text-lg">{course.description}</p>
      <div className="mt-8 flex flex-wrap items-center gap-2">
        <AccessBadge access={accessSummary} />
        <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">{course.level}</span>
      </div>
      <div className="mt-8 grid max-w-2xl grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/[0.1] bg-white/[0.1] sm:grid-cols-3">
        <div className="bg-[#080808]/95 p-4">
          <div className="text-xl font-semibold text-white">{getCourseLessonCount(course)}</div>
          <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-[#7f8794]">Lessons</div>
        </div>
        <div className="bg-[#080808]/95 p-4">
          <div className="text-xl font-semibold text-white">{course.modules.length}</div>
          <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-[#7f8794]">Modules</div>
        </div>
        <div className="col-span-2 bg-[#080808]/95 p-4 sm:col-span-1">
          <div className="text-xl font-semibold text-white">{formatDuration(getCourseEstimatedMinutes(course))}</div>
          <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-[#7f8794]">Estimated time</div>
        </div>
      </div>
      <div className="mt-7 max-w-2xl"><AcademyProgressBar completed={courseProgress.completed} total={courseProgress.total} label="Course progress" /></div>
    </header>
  );
}

function LessonRow({ course, lesson, completed }: { course: AcademyCourse; lesson: AcademyLesson; completed: boolean }) {
  const isMember = lesson.access === "MEMBER";
  return (
    <Link href={`/academy/${course.slug}/${lesson.slug}`} data-academy-lesson-id={lesson.id} aria-label={`${lesson.title}${completed ? ", completed" : ""}`} className={`flex items-start gap-3 border-t border-white/[0.07] py-4 transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ff3b3b]/70 sm:items-center sm:gap-5 ${completed ? "bg-emerald-400/[0.025]" : ""}`}>
      <div className="w-7 shrink-0 text-xs font-semibold tabular-nums text-[#626b78]">{String(lesson.order).padStart(2, "0")}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          {isMember ? <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-300/80" aria-label="Member lesson" /> : null}
          <span className="text-sm font-medium text-[#e5e7eb]">{lesson.title}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#737b88]">
          <span>{lesson.estimatedMinutes} min</span>
          <LabMetadata lesson={lesson} />
          {completed ? <AcademyCompletedMark /> : null}
        </div>
      </div>
      <AccessBadge access={lesson.access} />
    </Link>
  );
}

function ModuleSection({ course, moduleIndex, isLessonCompleted }: { course: AcademyCourse; moduleIndex: number; isLessonCompleted: (lessonId: string) => boolean }) {
  const module = course.modules[moduleIndex];
  return (
    <article data-academy-module-id={module.id} className="rounded-2xl border border-white/[0.09] bg-[#050505]/80 p-5 sm:p-7">
      <div className="flex flex-col gap-3 border-b border-white/[0.07] pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ff6f6f]">Module {String(module.order).padStart(2, "0")}</div>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-white">{module.title}</h2>
        </div>
        <div className="flex shrink-0 gap-3 text-[11px] text-[#7f8794]">
          <span>{getModuleLessonCount(module)} lessons</span>
          <span>{formatDuration(getModuleEstimatedMinutes(module))}</span>
        </div>
      </div>
      <div className="mt-1">
        {module.lessons.map((lesson) => <LessonRow key={lesson.id} course={course} lesson={lesson} completed={isLessonCompleted(lesson.id)} />)}
      </div>
    </article>
  );
}

export default function AcademyCoursePage() {
  const [, params] = useRoute("/academy/:courseSlug");
  const course = params?.courseSlug ? getAcademyCourseBySlug(params.courseSlug) : undefined;
  const progress = useAcademyProgress();

  if (!course) return <NotFound />;

  const courseProgress = progress.getCourseProgress(course);
  const isFeatured = course.slug === "goodtrading-playbook";
  return (
    <MarketingLayout>
      <main data-academy-course-page={course.slug} className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <CourseHeader course={course} courseProgress={courseProgress} />
        <section className="mt-10 space-y-4" aria-label={`${course.title} curriculum`}>
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7f8794]">Course curriculum</div>
              <p className="mt-2 text-sm text-[#929aa7]">Explore the full structure. Lesson content will be added in a later phase.</p>
            </div>
            {isFeatured ? <span className="rounded-full border border-[#ff3b3b]/30 bg-[#ff3b3b]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#ffaaaa]">Featured playbook</span> : null}
          </div>
          {course.modules.map((_, moduleIndex) => <ModuleSection key={course.modules[moduleIndex].id} course={course} moduleIndex={moduleIndex} isLessonCompleted={progress.isLessonCompleted} />)}
        </section>
      </main>
    </MarketingLayout>
  );
}
