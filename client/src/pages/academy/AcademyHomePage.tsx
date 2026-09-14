import { Link } from "wouter";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import {
  ACADEMY_ACCESS_STATS,
  ACADEMY_CATALOG,
  ACADEMY_TRACKS,
  ACADEMY_TRACK_DESCRIPTIONS,
  getAcademyCoursesByTrack,
  getCourseAccessSummary,
  getCourseEstimatedMinutes,
  getCourseLessonCount,
  type AcademyAccessSummary,
  type AcademyTrack,
} from "@/academy/catalog";
import { useAcademyProgress } from "@/academy/progress";
import { AcademyProgressBar } from "@/components/academy/AcademyProgress";

function accessLabelClass(summary: AcademyAccessSummary): string {
  if (summary === "FREE + MEMBER") {
    return "border-amber-400/30 bg-amber-400/10 text-amber-200";
  }
  if (summary === "MEMBER") {
    return "border-violet-400/30 bg-violet-400/10 text-violet-200";
  }
  return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
}

function AccessLabel({ summary }: { summary: AcademyAccessSummary }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${accessLabelClass(summary)}`}>
      {summary}
    </span>
  );
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return `${remainingMinutes} min`;
  if (remainingMinutes === 0) return `${hours} h`;
  return `${hours} h ${remainingMinutes} min`;
}

export default function AcademyHomePage() {
  const trackCourses = (track: AcademyTrack) => getAcademyCoursesByTrack(track);
  const trackCount = ACADEMY_TRACKS.length;
  const progress = useAcademyProgress();
  const overallProgress = progress.getOverallProgress();
  const continueLearning = progress.getContinueLearningLesson();

  return (
    <MarketingLayout>
      <main>
        <section className="mx-auto max-w-7xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20 lg:px-8 lg:pb-24 lg:pt-28">
          <div className="grid items-end gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:gap-20">
            <div>
              <div className="mb-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.24em] text-[#ff8a8a]">
                <span className="h-px w-8 bg-[#ff3b3b]" />
                GoodTrading Academy
              </div>
              <h1 className="max-w-4xl text-4xl font-semibold leading-[1.05] tracking-[-0.04em] text-white sm:text-6xl lg:text-7xl">
                Learn to read the market.
                <span className="block text-[#9ca3af]">Not just the chart.</span>
              </h1>
              <p className="mt-7 max-w-2xl text-base leading-8 text-[#aeb6c2] sm:text-lg">
                Understand market mechanics, order flow, liquidity, derivatives and dealer positioning — then learn how GoodTrading combines them into a repeatable decision process.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <a
                  href="#tracks"
                  className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-[#ff3b3b] to-red-700 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_28px_rgba(255,59,59,0.16)] transition-opacity hover:opacity-90"
                >
                  Explore the tracks
                </a>
                <Link
                  href="/"
                  className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-[#e5e7eb] transition-colors hover:border-white/30 hover:bg-white/[0.07]"
                >
                  Back to GoodTrading
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.1] bg-white/[0.1]">
              <div className="bg-[#080808]/95 p-6 sm:p-8">
                <div className="text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">{ACADEMY_CATALOG.length}</div>
                <div className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-[#7f8794]">Courses</div>
              </div>
              <div className="bg-[#080808]/95 p-6 sm:p-8">
                <div className="text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">{trackCount}</div>
                <div className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-[#7f8794]">Learning tracks</div>
              </div>
              <div className="col-span-2 border-t border-white/[0.1] bg-[#080808]/95 p-6 sm:p-8">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff8a8a]">The GoodTrading approach</div>
                <p className="mt-3 text-sm leading-7 text-[#aeb6c2]">
                  Learn the evidence first. Build the decision process second. Apply it with discipline.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8 lg:pb-20">
          <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="rounded-2xl border border-white/[0.09] bg-[#050505]/80 p-6 sm:p-7">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7f8794]">Overall Academy progress</div>
              <div className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white">{overallProgress.completed} / {overallProgress.total}</div>
              <div className="mt-1 text-sm text-[#929aa7]">lessons completed</div>
              <div className="mt-6"><AcademyProgressBar completed={overallProgress.completed} total={overallProgress.total} label="Academy progress" /></div>
            </div>
            {continueLearning ? (
              <Link href={`/academy/${continueLearning.course.slug}/${continueLearning.lesson.slug}`} className="group rounded-2xl border border-[#ff3b3b]/25 bg-[#0a0707]/70 p-6 transition-colors hover:border-[#ff3b3b]/45 sm:p-7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff3b3b]/70">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ff8a8a]">Continue learning</div>
                <div className="mt-4 text-xl font-semibold text-white group-hover:text-[#ffb0b0]">{continueLearning.lesson.title}</div>
                <div className="mt-2 text-sm text-[#929aa7]">{continueLearning.course.title}</div>
                <div className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-[#c4cad4]">Open lesson →</div>
              </Link>
            ) : (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-6 sm:p-7"><div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Academy complete</div><p className="mt-4 text-sm leading-7 text-[#b7c8bd]">All canonical lessons are complete.</p></div>
            )}
          </div>
        </section>

        <section id="tracks" className="border-y border-white/[0.07] bg-white/[0.015]">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
            <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7f8794]">The curriculum</div>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">Four ways to build an edge.</h2>
              </div>
              <p className="max-w-md text-sm leading-6 text-[#7f8794]">Start with the foundations, then move from market observation toward a complete decision framework.</p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {ACADEMY_TRACKS.map((track, trackIndex) => {
                const courses = trackCourses(track);
                return (
                  <article key={track} data-academy-track={track} className="rounded-2xl border border-white/[0.09] bg-[#050505]/80 p-6 transition-colors hover:border-white/[0.18] sm:p-7">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ff6f6f]">0{trackIndex + 1}</div>
                        <h3 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-white">{track}</h3>
                      </div>
                      <div className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-[#7f8794]">
                        {courses.length} courses
                      </div>
                    </div>
                    <p className="mt-4 max-w-md text-sm leading-6 text-[#929aa7]">{ACADEMY_TRACK_DESCRIPTIONS[track]}</p>
                    <div className="mt-6 divide-y divide-white/[0.07] border-t border-white/[0.07]">
                      {courses.map((course) => {
                        const lessonCount = getCourseLessonCount(course);
                        const estimatedMinutes = getCourseEstimatedMinutes(course);
                        const courseProgress = progress.getCourseProgress(course);
                        return (
                          <Link href={`/academy/${course.slug}`} key={course.id} data-academy-course-id={course.id} className="block py-3 text-sm transition-colors hover:bg-white/[0.03]">
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-[#d7dbe2]">{course.number} {course.title}</span>
                              <AccessLabel summary={getCourseAccessSummary(course)} />
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#737b88]">
                              <span>{course.level}</span>
                              <span>{lessonCount} lessons</span>
                              <span>{formatDuration(estimatedMinutes)}</span>
                            </div>
                            <div className="mt-3 max-w-sm"><AcademyProgressBar completed={courseProgress.completed} total={courseProgress.total} label="Course progress" /></div>
                          </Link>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="relative overflow-hidden rounded-3xl border border-[#ff3b3b]/25 bg-[#0a0707] p-7 sm:p-10 lg:p-14">
            <div className="pointer-events-none absolute -right-28 -top-32 h-80 w-80 rounded-full bg-[#ff3b3b]/10 blur-[100px]" />
            <div className="relative grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ff8a8a]">Featured playbook</div>
                <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">GoodTrading Playbook</h2>
                <p className="mt-4 max-w-md text-sm leading-7 text-[#aeb6c2]">A structured way to turn context, participation and confirmation into a trade decision.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  "Gamma tells you where to look.",
                  "Liquidity shows what passive participants are doing.",
                  "Order Flow shows what aggressive participants are doing.",
                  "Acceptance or rejection determines whether the trade exists.",
                ].map((statement, index) => (
                  <div key={statement} className="rounded-xl border border-white/[0.1] bg-black/25 p-4">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#ff6f6f]">0{index + 1}</div>
                    <p className="mt-2 text-sm leading-6 text-[#e5e7eb]">{statement}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-white/[0.07] px-4 py-14 text-center sm:px-6 lg:px-8">
          <p className="text-sm text-[#7f8794]">{ACADEMY_ACCESS_STATS.freePercentage.toFixed(0)}% of lessons start free.</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-white sm:text-3xl">Build your market perspective with GoodTrading.</h2>
        </section>
      </main>
    </MarketingLayout>
  );
}
