import type { ReactNode } from "react";
import { PublicHeader } from "./PublicHeader";
import { MockAccessDevPanel } from "./MockAccessDevPanel";
import { MarketingFooter } from "./MarketingFooter";
import { DesktopAuthLayout } from "@/components/auth/DesktopAuthLayout";
import { isDesktopRuntime } from "@/lib/runtimeFeatures";

export function MarketingLayout({ children }: { children: ReactNode }) {
  if (isDesktopRuntime()) {
    return <DesktopAuthLayout>{children}</DesktopAuthLayout>;
  }

  return (
    <div className="min-h-screen w-full bg-[#030303] text-[#f3f4f6]">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-48 left-1/4 h-[480px] w-[480px] rounded-full bg-[#ff3b3b]/8 blur-[130px]" />
        <div className="absolute top-1/3 -right-20 h-[400px] w-[400px] rounded-full bg-violet-600/10 blur-[110px]" />
        <div className="absolute bottom-0 left-1/2 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-blue-900/10 blur-[100px]" />
      </div>
      <PublicHeader />
      <main className="relative z-10">{children}</main>
      <MarketingFooter />
      <MockAccessDevPanel />
    </div>
  );
}
