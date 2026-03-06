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
        
        <div className="flex-1 flex flex-col p-2 min-w-0 overflow-hidden">
          <MainChart />
          <GammaProfile />
        </div>

        <RightSidebar />
      </div>
    </div>
  );
}