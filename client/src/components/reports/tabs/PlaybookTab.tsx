import { TabMockDataBadge } from "../ReportDataModeBadge";
import { SetupPerformanceCard } from "../SetupPerformanceCard";
import { PLAYBOOK_SETUPS } from "../reportsMockData";

export function PlaybookTab() {
  return (
    <section className="flex flex-col gap-4">
      <header className="flex justify-end">
        <TabMockDataBadge />
      </header>
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {PLAYBOOK_SETUPS.map((setup) => (
        <SetupPerformanceCard key={setup.name} setup={setup} />
      ))}
      </section>
    </section>
  );
}
