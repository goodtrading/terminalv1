import { Check } from "lucide-react";
import { useAcademyProgress } from "@/academy/progress";

export function AcademyProgressBar({ completed, total, label = "Progress" }: { completed: number; total: number; label?: string }) {
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
  return (
    <div aria-label={label}>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-[#929aa7]">{label}</span>
        <span className="tabular-nums text-[#c4cad4]">{completed} / {total} <span className="text-[#737b88]">({percentage}%)</span></span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}>
        <div className="h-full rounded-full bg-gradient-to-r from-[#ff3b3b] to-[#ff8a8a] transition-[width]" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

export function AcademyLessonCompletion({ lessonId }: { lessonId: string }) {
  const progress = useAcademyProgress();
  const completed = progress.isLessonCompleted(lessonId);
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/[0.09] bg-[#050505]/70 p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <span className={`flex h-8 w-8 items-center justify-center rounded-full border ${completed ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" : "border-white/15 text-[#737b88]"}`}>
          <Check className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="text-sm text-[#c4cad4]">{completed ? "Completed" : "Mark lesson complete"}</span>
      </div>
      <button type="button" onClick={() => progress.setLessonCompleted(lessonId, !completed)} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-[#e5e7eb] transition-colors hover:border-white/30 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff3b3b]/70">
        {completed ? "Mark incomplete" : "Mark lesson complete"}
      </button>
    </div>
  );
}

export function AcademyCompletedMark() {
  return <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.12em] text-emerald-300/80"><Check className="h-3 w-3" aria-hidden="true" />Completed</span>;
}
