import { TopNav } from "@/components/terminal/TopNav";
import { DesktopFeedStatusBanner } from "@/components/desktop/DesktopFeedStatusBanner";
import { LeftSidebar } from "@/components/terminal/LeftSidebar";
import RightSidebar from "@/components/terminal/RightSidebar";
import { MainChart } from "@/components/terminal/MainChart";
import { ExchangeConnectionPanel } from "@/components/terminal/execution/ExchangeConnectionPanel";
import { TradingExecutionPanel } from "@/components/terminal/execution/TradingExecutionPanel";
import { BrokerSessionProvider } from "@/components/terminal/execution/useBrokerSession";
import { MarketStructureBar } from "@/components/terminal/MarketStructureBar";
import { BottomPanel } from "@/components/terminal/BottomPanel";
import { useEffect, useState } from "react";
import { mountClickInteractionDiag } from "@/dev/clickInteractionDiag";
import DeribitOptionsBook from "@/components/options/DeribitOptionsBook";
import { FlowsPanel } from "@/components/flows/FlowsPanel";
import { VolatilityEnginePanel } from "@/components/terminal/VolatilityEnginePanel";
import { ReportsPanel } from "@/components/reports/ReportsPanel";
import { TerminalErrorBoundary } from "@/components/common/TerminalErrorBoundary";
import { useDesktopPanelsVisible } from "@/hooks/useDesktopPanelsVisible";
import { cn } from "@/lib/utils";
import { prefetchOptionsBook } from "@/lib/optionsBookClient";
import { AlertCenter } from "@/components/alerts/AlertCenter";
import { AlertRuntime } from "@/components/alerts/AlertRuntime";
import type { AlertEvent } from "@shared/alerts";

export default function TerminalLayout() {
  const [activeScenario, setActiveScenario] = useState<"BASE" | "ALT" | "VOL">("BASE");
  const [bottomPanelsMinimized, setBottomPanelsMinimized] = useState(false);
  const { panelsVisible, togglePanels } = useDesktopPanelsVisible();
  // Fixed to PRO mode - view toggle removed
const viewMode: "PRO" = "PRO";
  const [activeTab, setActiveTab] = useState("TERMINAL");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("gt-bottom-panels-minimized");
      if (stored === "1") setBottomPanelsMinimized(true);
    } catch {
      // ignore storage access errors
    }
  }, []);

  useEffect(() => mountClickInteractionDiag(), []);

  useEffect(() => {
    prefetchOptionsBook("BTC");
  }, []);

  useEffect(() => {
    const routeAlert = (alert: AlertEvent) => {
      const primary = alert.actions?.[0];
      const panel = typeof primary?.payload?.panel === "string" ? primary.payload.panel : null;
      if (panel === "alerts") setActiveTab("ALERTS");
      else if (panel === "options" || alert.domain === "gamma") setActiveTab("OPTIONS");
      else if (panel === "account" || alert.domain === "account") setActiveTab("TERMINAL");
      else setActiveTab("ALERTS");
    };

    try {
      const pending = sessionStorage.getItem("gt-alert-pending-action");
      if (pending) {
        sessionStorage.removeItem("gt-alert-pending-action");
        routeAlert(JSON.parse(pending) as AlertEvent);
      }
    } catch (error) {
      console.warn("[alerts] pending action restore failed", error);
    }

    const onOpen = (event: Event) => {
      const alert = (event as CustomEvent<AlertEvent>).detail;
      if (alert) routeAlert(alert);
    };
    window.addEventListener("gt-alert-open", onOpen);
    return () => window.removeEventListener("gt-alert-open", onOpen);
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
      <TopNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        panelsVisible={panelsVisible}
        onTogglePanels={togglePanels}
      />
      <AlertRuntime />
      <DesktopFeedStatusBanner />
      
      <div className="flex-1 flex overflow-hidden min-h-0">
        {activeTab === "TERMINAL" && (
          <BrokerSessionProvider>
            {panelsVisible ? <LeftSidebar /> : null}

            <div
              className={cn(
                "flex-1 flex flex-col p-1 gap-1 min-w-0 min-h-0 bg-terminal-bg relative overflow-hidden transition-all duration-200 ease-out",
              )}
            >
              <MarketStructureBar />
              <div className="flex flex-wrap items-start gap-2 shrink-0 min-h-0">
                                              </div>
              <div className="flex-1 min-h-0 relative overflow-hidden">
                <TerminalErrorBoundary
                  name="main-chart"
                  fallbackMessage="Chart module crashed. Reload terminal or switch panel."
                >
                  <MainChart
                    activeScenario={activeScenario}
                    onActiveScenarioChange={setActiveScenario}
                    viewMode={viewMode}
                  />
                </TerminalErrorBoundary>
              </div>

              {panelsVisible ? (
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
                  <TerminalErrorBoundary
                    name="exchange-connection"
                    fallbackMessage="Connection panel crashed. Reload terminal."
                  >
                    <ExchangeConnectionPanel collapsed={bottomPanelsMinimized} />
                  </TerminalErrorBoundary>
                  <TerminalErrorBoundary
                    name="paper-execution"
                    fallbackMessage="Paper module crashed. Reload or switch broker."
                  >
                    <TradingExecutionPanel collapsed={bottomPanelsMinimized} />
                  </TerminalErrorBoundary>
                </div>
              ) : null}
            </div>

            {panelsVisible ? (
              <RightSidebar
                onScenarioSelect={(s) => {
                  window.dispatchEvent(new CustomEvent("scenario-select", { detail: s }));
                }}
                onActiveScenarioChange={setActiveScenario}
              />
            ) : null}
          </BrokerSessionProvider>
        )}

        {activeTab === "OPTIONS" && (
          <div className="flex-1 overflow-hidden">
            <DeribitOptionsBook />
          </div>
        )}

        {activeTab === "FLOWS" && (
          <div className="flex-1 min-h-0 min-w-0 w-full h-full overflow-hidden">
            <FlowsPanel />
          </div>
        )}

        {activeTab === "VOLATILITY" && (
          <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
            <VolatilityEnginePanel />
          </div>
        )}

        {activeTab === "REPORTS" && (
          <section className="flex-1 min-h-0 min-w-0 overflow-hidden">
            <TerminalErrorBoundary
              name="reports"
              fallbackMessage="Reports module crashed. Reload or switch tab."
            >
              <ReportsPanel />
            </TerminalErrorBoundary>
          </section>
        )}

        {activeTab === "ALERTS" && (
          <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
            <AlertCenter />
          </div>
        )}
      </div>

      {panelsVisible ? <BottomPanel /> : null}
    </div>
  );
}
