import { TopNav } from "@/components/terminal/TopNav";
import { LeftSidebar } from "@/components/terminal/LeftSidebar";
import RightSidebar from "@/components/terminal/RightSidebar";
import { MainChart } from "@/components/terminal/MainChart";
import { GammaProfile } from "@/components/terminal/GammaProfile";
import { TradingPlan } from "@/components/terminal/TradingPlan";
import { MarketStructureBar } from "@/components/terminal/MarketStructureBar";
import { BottomPanel } from "@/components/terminal/BottomPanel";
import { useEffect, useState } from "react";

export default function TerminalLayout() {
  const [activeScenario, setActiveScenario] = useState<"BASE" | "ALT" | "VOL">("BASE");
  const [bottomPanelsMinimized, setBottomPanelsMinimized] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("gt-bottom-panels-minimized");
      if (stored === "1") setBottomPanelsMinimized(true);
    } catch {
      // ignore storage access errors
    }
  }, []);

  const toggleBottomPanels = () => {
    setBottomPanelsMinimized((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("gt-bottom-panels-minimized", next ? "1" : "0");
      } catch {
        // ignore storage access errors
      }
      return next;
    });
  };

  return (
    <div className="h-screen w-full flex flex-col bg-terminal-bg text-terminal-text overflow-hidden font-sans">
      <TopNav />
      
      <div className="flex-1 flex overflow-hidden min-h-0">
        <LeftSidebar />
        
        <div className="flex-1 flex flex-col p-1 gap-1 min-w-0 min-h-0 bg-terminal-bg relative overflow-hidden">
          <MarketStructureBar />
          <div className="flex-1 min-h-0 relative overflow-hidden">
            <MainChart activeScenario={activeScenario} onActiveScenarioChange={setActiveScenario} />
          </div>
          <div
            className={`relative flex gap-1 min-h-0 transition-all duration-200 max-[1000px]:flex-col ${
              bottomPanelsMinimized
                ? "h-[38px] max-[1000px]:h-[76px]"
                : "h-[clamp(200px,30vh,288px)] max-[1200px]:h-[clamp(220px,34vh,340px)] max-[1000px]:h-[clamp(280px,44vh,460px)]"
            }`}
          >
            <button
              type="button"
              onClick={toggleBottomPanels}
              className="absolute right-1 top-1 z-20 h-6 px-2 border border-terminal-border bg-terminal-panel/90 text-[10px] font-mono tracking-wider text-terminal-muted hover:text-white hover:border-white/30 transition-colors"
              title={bottomPanelsMinimized ? "Expand lower panels" : "Minimize lower panels"}
            >
              {bottomPanelsMinimized ? "EXPAND" : "MINIMIZE"}
            </button>
            <GammaProfile collapsed={bottomPanelsMinimized} />
            <TradingPlan collapsed={bottomPanelsMinimized} />
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
