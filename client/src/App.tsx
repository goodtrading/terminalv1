import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LearnModeProvider } from "@/hooks/useLearnMode";
import NotFound from "@/pages/not-found";
import TerminalLayout from "@/pages/terminal/TerminalLayout";
import { TerminalAuthProvider } from "@/contexts/TerminalAuthContext";
import BlockedAccessScreen from "@/pages/auth/BlockedAccessScreen";
import LoginRoute from "@/pages/auth/LoginRoute";
import AdminPage from "@/pages/admin/AdminPage";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginRoute} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/">
        <BlockedAccessScreen>
          <TerminalLayout />
        </BlockedAccessScreen>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TerminalAuthProvider>
        <TooltipProvider>
          <LearnModeProvider>
            <Toaster />
            <Router />
          </LearnModeProvider>
        </TooltipProvider>
      </TerminalAuthProvider>
    </QueryClientProvider>
  );
}

export default App;