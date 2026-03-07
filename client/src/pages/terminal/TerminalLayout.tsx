import { TopNav } from "@/components/terminal/TopNav";
import { LeftSidebar } from "@/components/terminal/LeftSidebar";
import { RightSidebar } from "@/components/terminal/RightSidebar";
import { MainChart } from "@/components/terminal/MainChart";
import { GammaProfile } from "@/components/terminal/GammaProfile";

export default function TerminalLayout() {
  return (
    <div className="h-screen w-screen flex flex-col bg-terminal-bg text-terminal-text overflow-hidden font-sans">
      <TopNav />
      
      <div className="flex-1 flex overflow-hidden">
        <LeftSidebar />
        
        <div className="flex-1 flex flex-col p-1 gap-1 min-w-0 overflow-hidden bg-terminal-bg relative">
          <MainChart />
          <GammaProfile />
        </div>

        <RightSidebar onScenarioSelect={(s) => {
          window.dispatchEvent(new CustomEvent('scenario-select', { detail: s }));
        }} />
      </div>
    </div>
  );
}
