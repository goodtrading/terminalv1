import { lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import NotFound from "@/pages/not-found";

const TerminalLayout = lazy(() => import("@/pages/terminal/TerminalLayout"));
const BlockedAccessScreen = lazy(() => import("@/pages/auth/BlockedAccessScreen"));
const DesktopEntryRedirect = lazy(() => import("@/pages/auth/DesktopEntryRedirect"));
const AdminPage = lazy(() => import("@/pages/admin/AdminPage"));
const AdminRoute = lazy(() => import("@/pages/admin/AdminRoute").then((module) => ({ default: module.AdminRoute })));
const CalibrationLabPage = lazy(() => import("@/pages/admin/CalibrationLabPage"));
const KnowledgeInboxPage = lazy(() => import("@/pages/admin/KnowledgeInboxPage"));
const KnowledgeHealthPage = lazy(() => import("@/pages/admin/KnowledgeHealthPage"));
const MarketSnapshotDebugPage = lazy(() => import("@/pages/admin/MarketSnapshotDebugPage"));
const DecisionGraphDebugPage = lazy(() => import("@/pages/admin/DecisionGraphDebugPage"));
const HumanMethodologyReviewPage = lazy(() => import("@/pages/admin/HumanMethodologyReviewPage"));
const CriticalCalibrationLabPage = lazy(() => import("@/pages/admin/CriticalCalibrationLabPage"));
const KnowledgeDistillationPage = lazy(() => import("@/pages/admin/KnowledgeDistillationPage"));
const KnowledgeEvolutionPage = lazy(() => import("@/pages/admin/KnowledgeEvolutionPage"));
const KnowledgeProvenancePage = lazy(() => import("@/pages/admin/KnowledgeProvenancePage"));
import HomePage from "@/pages/marketing/HomePage";
const TerminalTradingCriptoPage = lazy(() => import("@/pages/marketing/TerminalTradingCriptoPage"));
const OrderFlowBitcoinPage = lazy(() => import("@/pages/marketing/OrderFlowBitcoinPage"));
const GammaExposureBitcoinPage = lazy(() => import("@/pages/marketing/GammaExposureBitcoinPage"));
const HeatmapLiquidezBitcoinPage = lazy(() => import("@/pages/marketing/HeatmapLiquidezBitcoinPage"));
const LoginPage = lazy(() => import("@/pages/marketing/LoginPage"));
const RegisterPage = lazy(() => import("@/pages/marketing/RegisterPage"));
const ForgotPasswordPage = lazy(() => import("@/pages/marketing/ForgotPasswordPage"));
const PricingPage = lazy(() => import("@/pages/marketing/PricingPage"));
const ProductsPage = lazy(() => import("@/pages/marketing/ProductsPage"));
const DownloadDesktopPage = lazy(() => import("@/pages/marketing/DownloadDesktopPage"));
const AboutPage = lazy(() => import("@/pages/marketing/AboutPage"));
const DataSourcesMethodologyPage = lazy(() => import("@/pages/marketing/DataSourcesMethodologyPage"));
const ClassificationMethodologyPage = lazy(() => import("@/pages/marketing/ClassificationMethodologyPage"));
const GammaOptionsMethodologyPage = lazy(() => import("@/pages/marketing/GammaOptionsMethodologyPage"));
const LimitationsMethodologyPage = lazy(() => import("@/pages/marketing/LimitationsMethodologyPage"));
const AccountPage = lazy(() => import("@/pages/marketing/AccountPage"));
const MyAccountRedirect = lazy(() => import("@/pages/marketing/MyAccountRedirect"));
const TermsPage = lazy(() => import("@/pages/marketing/TermsPage"));
const PrivacyPage = lazy(() => import("@/pages/marketing/PrivacyPage"));
const VerifyEmailPage = lazy(() => import("@/pages/marketing/VerifyEmailPage"));
const ResetPasswordPage = lazy(() => import("@/pages/marketing/ResetPasswordPage"));
const AcademyHomePage = lazy(() => import("@/pages/academy/AcademyHomePage"));
const AcademyCoursePage = lazy(() => import("@/pages/academy/AcademyCoursePage"));
const AcademyLessonPage = lazy(() => import("@/pages/academy/AcademyLessonPage"));
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

function RouteLoadingState() {
  return <div className="min-h-screen bg-[#030303]" aria-busy="true" />;
}

function WebRouter() {
  return (
    <Suspense fallback={<RouteLoadingState />}>
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
      <Route path="/about" component={AboutPage} />
      <Route path="/methodology/data-sources" component={DataSourcesMethodologyPage} />
      <Route path="/methodology/classification" component={ClassificationMethodologyPage} />
      <Route path="/methodology/gamma-options" component={GammaOptionsMethodologyPage} />
      <Route path="/methodology/limitations" component={LimitationsMethodologyPage} />
      <Route path="/terminal-trading-cripto" component={TerminalTradingCriptoPage} />
      <Route path="/order-flow-bitcoin" component={OrderFlowBitcoinPage} />
      <Route path="/gamma-exposure-bitcoin" component={GammaExposureBitcoinPage} />
      <Route path="/heatmap-liquidez-bitcoin" component={HeatmapLiquidezBitcoinPage} />
      <Route path="/account" component={AccountPage} />
      <Route path="/my-account" component={MyAccountRedirect} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/academy/:courseSlug/:lessonSlug" component={AcademyLessonPage} />
      <Route path="/academy/:courseSlug" component={AcademyCoursePage} />
      <Route path="/academy" component={AcademyHomePage} />
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
    </Suspense>
  );
}

/** Desktop: auth gate at `/` — no public marketing landing. */
function DesktopRouter() {
  return (
    <Suspense fallback={<RouteLoadingState />}>
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
      <Route path="/about" component={AboutPage} />
      <Route path="/methodology/data-sources" component={DataSourcesMethodologyPage} />
      <Route path="/methodology/classification" component={ClassificationMethodologyPage} />
      <Route path="/methodology/gamma-options" component={GammaOptionsMethodologyPage} />
      <Route path="/methodology/limitations" component={LimitationsMethodologyPage} />
      <Route path="/" component={DesktopEntryRedirect} />
      <Route component={DesktopEntryRedirect} />
      </Switch>
    </Suspense>
  );
}

export function AppRouter() {
  return isDesktopRuntime() ? <DesktopRouter /> : <WebRouter />;
}
