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
import VerifyEmailPage from "@/pages/marketing/VerifyEmailPage";
import ResetPasswordPage from "@/pages/marketing/ResetPasswordPage";

function TerminalRoute() {
  return (
    <BlockedAccessScreen>
      <TerminalLayout />
    </BlockedAccessScreen>
  );
}

/** Railway/web: marketing at `/`, terminal at `/terminal`. */
export function AppRouter() {
  return (
    <Switch>
      <Route path="/terminal" component={TerminalRoute} />
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/verify-email" component={VerifyEmailPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/checkout" component={PricingPage} />
      <Route path="/products" component={ProductsPage} />
      <Route path="/download/desktop" component={DownloadDesktopPage} />
      <Route path="/account" component={AccountPage} />
      <Route path="/my-account" component={MyAccountRedirect} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/" component={HomePage} />
      <Route component={NotFound} />
    </Switch>
  );
}
