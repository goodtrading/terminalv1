import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LearnModeProvider } from "@/hooks/useLearnMode";
import { TerminalAuthProvider } from "@/contexts/TerminalAuthContext";
import { AppRouter } from "@/AppRouter";

function App() {
  useEffect(() => {
    document.title = "GoodTrading Terminal";
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TerminalAuthProvider>
        <TooltipProvider>
          <LearnModeProvider>
            <Toaster />
            <AppRouter />
          </LearnModeProvider>
        </TooltipProvider>
      </TerminalAuthProvider>
    </QueryClientProvider>
  );
}

export default App;
