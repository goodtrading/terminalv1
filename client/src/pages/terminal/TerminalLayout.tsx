import { TopNav } from "@/components/terminal/TopNav";
import { LeftSidebar } from "@/components/terminal/LeftSidebar";
import { RightSidebar } from "@/components/terminal/RightSidebar";
import { MainChart } from "@/components/terminal/MainChart";
import { GammaProfile } from "@/components/terminal/GammaProfile";

export default function TerminalLayout() {
  return (
    <div className="relative h-screen w-screen flex flex-col bg-terminal-bg text-terminal-text overflow-hidden font-sans">
      <div style={{position:"absolute",top:0,left:0,zIndex:9999,color:"red",fontSize:"20px",backgroundColor:"black",padding:"4px"}}>
        DEBUG LAYOUT ACTIVE
      </div>
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