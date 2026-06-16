import { Switch, Route } from "wouter";
import NotFound from "@/pages/not-found";
import TerminalLayout from "@/pages/terminal/TerminalLayout";
import BlockedAccessScreen from "@/pages/auth/BlockedAccessScreen";
import AdminPage from "@/pages/admin/AdminPage";
import HomePage from "@/pages/marketing/HomePage";
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

function TerminalRoute() {
  return (
    <BlockedAccessScreen>
      <TerminalLayout />
    </BlockedAccessScreen>
  );
}

/** Desktop: home at `/`, terminal at `/terminal`. Web/Railway: same layout. */
export function AppRouter() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/checkout" component={PricingPage} />
      <Route path="/products" component={ProductsPage} />
      <Route path="/download/desktop" component={DownloadDesktopPage} />
      <Route path="/account" component={AccountPage} />
      <Route path="/my-account" component={MyAccountRedirect} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/terminal" component={TerminalRoute} />
      <Route path="/" component={HomePage} />
      <Route component={NotFound} />
    </Switch>
  );
}
