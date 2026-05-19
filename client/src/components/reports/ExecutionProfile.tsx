import { ReportQuickStat } from "./ReportQuickStat";
import { EXECUTION_PROFILE } from "./reportsMockData";

export function ExecutionProfile() {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 px-0.5">
        Execution Profile
      </h2>
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <ReportQuickStat label="Timing" value={EXECUTION_PROFILE.timing} />
        <ReportQuickStat label="Discipline" value={EXECUTION_PROFILE.discipline} />
        <ReportQuickStat
          label="Context Alignment"
          value={EXECUTION_PROFILE.contextAlignment}
        />
        <ReportQuickStat
          label="Confirmation Quality"
          value={EXECUTION_PROFILE.confirmationQuality}
        />
      </section>
    </section>
  );
}
