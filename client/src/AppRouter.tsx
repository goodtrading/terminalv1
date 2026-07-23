import { Switch, Route } from "wouter";
import NotFound from "@/pages/not-found";
import TerminalLayout from "@/pages/terminal/TerminalLayout";
import BlockedAccessScreen from "@/pages/auth/BlockedAccessScreen";
import DesktopEntryRedirect from "@/pages/auth/DesktopEntryRedirect";
import AdminPage from "@/pages/admin/AdminPage";
import { AdminRoute } from "@/pages/admin/AdminRoute";
import CalibrationLabPage from "@/pages/admin/CalibrationLabPage";
import KnowledgeInboxPage from "@/pages/admin/KnowledgeInboxPage";
import KnowledgeHealthPage from "@/pages/admin/KnowledgeHealthPage";
import MarketSnapshotDebugPage from "@/pages/admin/MarketSnapshotDebugPage";
import DecisionGraphDebugPage from "@/pages/admin/DecisionGraphDebugPage";
import HumanMethodologyReviewPage from "@/pages/admin/HumanMethodologyReviewPage";
import CriticalCalibrationLabPage from "@/pages/admin/CriticalCalibrationLabPage";
import KnowledgeDistillationPage from "@/pages/admin/KnowledgeDistillationPage";
import KnowledgeEvolutionPage from "@/pages/admin/KnowledgeEvolutionPage";
import KnowledgeProvenancePage from "@/pages/admin/KnowledgeProvenancePage";
import HomePage from "@/pages/marketing/HomePage";
import TerminalTradingCriptoPage from "@/pages/marketing/TerminalTradingCriptoPage";
import OrderFlowBitcoinPage from "@/pages/marketing/OrderFlowBitcoinPage";
import GammaExposureBitcoinPage from "@/pages/marketing/GammaExposureBitcoinPage";
import HeatmapLiquidezBitcoinPage from "@/pages/marketing/HeatmapLiquidezBitcoinPage";
import LoginPage from "@/pages/marketing/LoginPage";
import RegisterPage from "@/pages/marketing/RegisterPage";
import ForgotPasswordPage from "@/pages/marketing/ForgotPasswordPage";
import PricingPage from "@/pages/marketing/PricingPage";
import ProductsPage from "@/pages/marketing/ProductsPage";
import DownloadDesktopPage from "@/pages/marketing/DownloadDesktopPage";
import AccountPage from "@/pages/marketing/AccountPage";
import MyAccountRedirect from "@/pages/marketing/MyAccountRedirect";
import TermsPage from "@/pages/marketing/TermsPage";
import PrivacyPage from "@/pages/marketing/PrivacyPage";
import VerifyEmailPage from "@/pages/marketing/VerifyEmailPage";
import ResetPasswordPage from "@/pages/marketing/ResetPasswordPage";
import { isDesktopRuntime } from "@/lib/runtimeFeatures";

function AdminPageRoute() {
  return (
    <AdminRoute>
      <AdminPage />
    </AdminRoute>
  );
}

function CalibrationLabRoute() {
  return (
    <AdminRoute>
      <CalibrationLabPage />
    </AdminRoute>
  );
}

function KnowledgeInboxRoute() {
  return (
    <AdminRoute>
      <KnowledgeInboxPage />
    </AdminRoute>
  );
}

function KnowledgeHealthRoute() {
  return (
    <AdminRoute>
      <KnowledgeHealthPage />
    </AdminRoute>
  );
}

function MarketSnapshotDebugRoute() {
  return (
    <AdminRoute>
      <MarketSnapshotDebugPage />
    </AdminRoute>
  );
}

function DecisionGraphDebugRoute() {
  return (
    <AdminRoute>
      <DecisionGraphDebugPage />
    </AdminRoute>
  );
}

function HumanMethodologyReviewRoute() {
  return (
    <AdminRoute>
      <HumanMethodologyReviewPage />
    </AdminRoute>
  );
}

function CriticalCalibrationLabRoute() {
  return (
    <AdminRoute>
      <CriticalCalibrationLabPage />
    </AdminRoute>
  );
}

function KnowledgeDistillationRoute() {
  return (
    <AdminRoute>
      <KnowledgeDistillationPage />
    </AdminRoute>
  );
}

function KnowledgeEvolutionRoute() {
  return (
    <AdminRoute>
      <KnowledgeEvolutionPage />
    </AdminRoute>
  );
}

function KnowledgeProvenanceRoute() {
  return (
    <AdminRoute>
      <KnowledgeProvenancePage />
    </AdminRoute>
  );
}

function TerminalRoute() {
  return (
    <BlockedAccessScreen>
      <TerminalLayout />
    </BlockedAccessScreen>
  );
}

function WebRouter() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/verify-email" component={VerifyEmailPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/checkout" component={PricingPage} />
      <Route path="/products" component={ProductsPage} />
      <Route path="/download/desktop" component={DownloadDesktopPage} />
      <Route path="/terminal-trading-cripto" component={TerminalTradingCriptoPage} />
      <Route path="/order-flow-bitcoin" component={OrderFlowBitcoinPage} />
      <Route path="/gamma-exposure-bitcoin" component={GammaExposureBitcoinPage} />
      <Route path="/heatmap-liquidez-bitcoin" component={HeatmapLiquidezBitcoinPage} />
      <Route path="/account" component={AccountPage} />
      <Route path="/my-account" component={MyAccountRedirect} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/admin" component={AdminPageRoute} />
      <Route path="/admin/ai-lab" component={CalibrationLabRoute} />
      <Route path="/admin/knowledge-inbox" component={KnowledgeInboxRoute} />
      <Route path="/admin/knowledge-health" component={KnowledgeHealthRoute} />
      <Route path="/admin/market-snapshot" component={MarketSnapshotDebugRoute} />
      <Route path="/admin/decision-graph" component={DecisionGraphDebugRoute} />
      <Route path="/admin/human-methodology-review" component={HumanMethodologyReviewRoute} />
      <Route path="/admin/critical-calibration" component={CriticalCalibrationLabRoute} />
      <Route path="/admin/knowledge-distillation" component={KnowledgeDistillationRoute} />
      <Route path="/admin/knowledge-evolution" component={KnowledgeEvolutionRoute} />
      <Route path="/admin/knowledge-provenance" component={KnowledgeProvenanceRoute} />
      <Route path="/terminal" component={TerminalRoute} />
      <Route path="/" component={HomePage} />
      <Route component={NotFound} />
    </Switch>
  );
}

/** Desktop: auth gate at `/` — no public marketing landing. */
function DesktopRouter() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/verify-email" component={VerifyEmailPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/checkout" component={PricingPage} />
      <Route path="/account" component={AccountPage} />
      <Route path="/my-account" component={MyAccountRedirect} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/admin" component={AdminPageRoute} />
      <Route path="/admin/ai-lab" component={CalibrationLabRoute} />
      <Route path="/admin/knowledge-inbox" component={KnowledgeInboxRoute} />
      <Route path="/admin/knowledge-health" component={KnowledgeHealthRoute} />
      <Route path="/admin/market-snapshot" component={MarketSnapshotDebugRoute} />
      <Route path="/admin/decision-graph" component={DecisionGraphDebugRoute} />
      <Route path="/admin/human-methodology-review" component={HumanMethodologyReviewRoute} />
      <Route path="/admin/critical-calibration" component={CriticalCalibrationLabRoute} />
      <Route path="/admin/knowledge-distillation" component={KnowledgeDistillationRoute} />
      <Route path="/admin/knowledge-evolution" component={KnowledgeEvolutionRoute} />
      <Route path="/admin/knowledge-provenance" component={KnowledgeProvenanceRoute} />
      <Route path="/terminal" component={TerminalRoute} />
      <Route path="/products" component={DesktopEntryRedirect} />
      <Route path="/download/desktop" component={DesktopEntryRedirect} />
      <Route path="/" component={DesktopEntryRedirect} />
      <Route component={DesktopEntryRedirect} />
    </Switch>
  );
}

export function AppRouter() {
  return isDesktopRuntime() ? <DesktopRouter /> : <WebRouter />;
}
