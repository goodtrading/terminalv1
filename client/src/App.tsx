import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LearnModeProvider } from "@/hooks/useLearnMode";
import { TerminalAuthProvider } from "@/contexts/TerminalAuthContext";
import { GoodTradingAccountProvider } from "@/contexts/GoodTradingAccountContext";
import { initDesktopStorage, isDesktopBuild, writeDesktopLog } from "@/lib/desktopStorage";
import { initCandleHistoryStore } from "@/lib/candleHistoryCache";
import { isDesktopApp } from "@/lib/desktopRuntime";
import { DesktopUpdateModal } from "@/components/desktop/DesktopUpdateModal";
import { DesktopUpdateStartup } from "@/components/desktop/DesktopUpdateStartup";
import { DesktopAppErrorBoundary } from "@/components/desktop/DesktopAppErrorBoundary";
import { DesktopUpdateProvider } from "@/hooks/useDesktopUpdateCheck";
import { AppRouter } from "@/AppRouter";

function App() {
  useEffect(() => {
    document.title = "Terminal de Order Flow y Gamma para Bitcoin | GoodTrading";
    if (!isDesktopBuild && !isDesktopApp()) return;
    void initDesktopStorage();
    void initCandleHistoryStore();
    const handleShutdown = () => {
      void writeDesktopLog("app_shutdown", { reason: "window_unload" });
    };
    window.addEventListener("beforeunload", handleShutdown);
    return () => {
      window.removeEventListener("beforeunload", handleShutdown);
      void writeDesktopLog("app_shutdown", { reason: "react_unmount" });
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <DesktopUpdateProvider>
        <DesktopUpdateStartup />
        <TerminalAuthProvider>
          <GoodTradingAccountProvider>
            <TooltipProvider>
              <LearnModeProvider>
                <Toaster />
                <DesktopAppErrorBoundary>
                  <AppRouter />
                </DesktopAppErrorBoundary>
                <DesktopUpdateModal />
              </LearnModeProvider>
            </TooltipProvider>
          </GoodTradingAccountProvider>
        </TerminalAuthProvider>
      </DesktopUpdateProvider>
    </QueryClientProvider>
  );
}

export default App;
