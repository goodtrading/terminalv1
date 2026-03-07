import { TopNav } from "@/components/terminal/TopNav";
import { LeftSidebar } from "@/components/terminal/LeftSidebar";
import { RightSidebar } from "@/components/terminal/RightSidebar";
import { MainChart } from "@/components/terminal/MainChart";
import { GammaProfile } from "@/components/terminal/GammaProfile";
import { TradingPlan } from "@/components/terminal/TradingPlan";

export default function TerminalLayout() {
  return (
    <div className="h-screen w-screen flex flex-col bg-terminal-bg text-terminal-text overflow-hidden font-sans">
      <TopNav />
      
      <div className="flex-1 flex overflow-hidden">
        <LeftSidebar />
        
        <div className="flex-1 flex flex-col p-1 gap-1 min-w-0 bg-terminal-bg relative overflow-hidden">
          <div className="flex-1 min-h-[400px] relative overflow-hidden">
            <MainChart />
          </div>
          <div className="flex gap-1 h-72 shrink-0">
            <GammaProfile />
            <TradingPlan />
          </div>
        </div>

        <RightSidebar onScenarioSelect={(s) => {
          window.dispatchEvent(new CustomEvent('scenario-select', { detail: s }));
        }} />
      </div>
    </div>
  );
}
