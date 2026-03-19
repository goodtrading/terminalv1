import { TopNav } from "@/components/terminal/TopNav";
import { LeftSidebar } from "@/components/terminal/LeftSidebar";
import RightSidebar from "@/components/terminal/RightSidebar";
import { MainChart } from "@/components/terminal/MainChart";
import { GammaProfile } from "@/components/terminal/GammaProfile";
import { TradingPlan } from "@/components/terminal/TradingPlan";
import { MarketStructureBar } from "@/components/terminal/MarketStructureBar";
import { BottomPanel } from "@/components/terminal/BottomPanel";
import { useState } from "react";

export default function TerminalLayout() {
  const [activeScenario, setActiveScenario] = useState<"BASE" | "ALT" | "VOL">("BASE");

  return (
    <div className="h-[100vh] w-screen flex flex-col bg-terminal-bg text-terminal-text overflow-hidden font-sans">
      <TopNav />
      
      <div className="flex-1 flex overflow-hidden min-h-0">
        <LeftSidebar />
        
        <div className="flex-1 flex flex-col p-1 gap-1 min-w-0 min-h-0 bg-terminal-bg relative overflow-hidden">
          <MarketStructureBar />
          <div className="flex-1 min-h-0 relative overflow-hidden">
            <MainChart activeScenario={activeScenario} onActiveScenarioChange={setActiveScenario} />
          </div>
          <div className="flex gap-1 h-72">
            <GammaProfile />
            <TradingPlan />
          </div>
        </div>

        <RightSidebar 
          onScenarioSelect={(s) => {
            window.dispatchEvent(new CustomEvent('scenario-select', { detail: s }));
          }}
          onActiveScenarioChange={setActiveScenario}
        />
      </div>

      <BottomPanel />
    </div>
  );
}
