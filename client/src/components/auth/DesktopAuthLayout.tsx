import type { ReactNode } from "react";
import { MockAccessDevPanel } from "@/components/marketing/MockAccessDevPanel";

/** Minimal auth shell for desktop — no public marketing nav/footer. */
export function DesktopAuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-[#030303] text-[#f3f4f6]">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-48 left-1/4 h-[480px] w-[480px] rounded-full bg-[#ff3b3b]/8 blur-[130px]" />
        <div className="absolute top-1/3 -right-20 h-[400px] w-[400px] rounded-full bg-violet-600/10 blur-[110px]" />
      </div>
      <main className="relative z-10">{children}</main>
      {import.meta.env.DEV ? <MockAccessDevPanel /> : null}
    </div>
  );
}
