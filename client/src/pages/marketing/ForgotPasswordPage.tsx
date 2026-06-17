import { useLocation } from "wouter";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { ForgotPasswordRecovery } from "@/components/marketing/ForgotPasswordRecovery";
import { DesktopWebForgotPasswordPrompt } from "@/components/marketing/DesktopWebForgotPasswordPrompt";
import { isDesktopWebPasswordRecovery } from "@/lib/webPasswordRecovery";

export default function ForgotPasswordPage() {
  const [, setLocation] = useLocation();

  return (
    <MarketingLayout>
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center px-4 py-16">
        <div className="w-full rounded-[22px] border border-white/[0.09] bg-[#050505]/85 p-8 shadow-[0_0_48px_rgba(255,59,59,0.06)]">
          {isDesktopWebPasswordRecovery() ? (
            <DesktopWebForgotPasswordPrompt onBack={() => setLocation("/login")} />
          ) : (
            <ForgotPasswordRecovery onBack={() => setLocation("/login")} />
          )}
        </div>
      </div>
    </MarketingLayout>
  );
}
