import { ReportQuickStat } from "./ReportQuickStat";
import type { ExecutionProfileData } from "./execution/executionReportTypes";

type Props = {
  profile: ExecutionProfileData;
  empty?: boolean;
};

export function ExecutionProfile({ profile, empty }: Props) {
  const contextAlignment =
    profile.contextAlignmentPct != null ? `${profile.contextAlignmentPct}%` : "—";

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 px-0.5">
        Execution Profile
      </h2>
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <ReportQuickStat
          label="Timing"
          value={empty ? "No data" : profile.timing}
        />
        <ReportQuickStat
          label="Discipline"
          value={empty ? "No data" : profile.discipline}
        />
        <ReportQuickStat label="Context Alignment" value={contextAlignment} />
        <ReportQuickStat
          label="Confirmation Quality"
          value={empty ? "No data" : profile.confirmationQuality}
        />
      </section>
    </section>
  );
}
