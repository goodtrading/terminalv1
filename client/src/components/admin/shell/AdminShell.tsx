import { useState, type ReactNode } from "react";
import { AdminHeader } from "./AdminHeader";
import { AdminSidebar } from "./AdminSidebar";

export type AdminShellProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function AdminShell({ title, description, actions, children }: AdminShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div
      className="flex min-h-screen w-full bg-terminal-bg text-terminal-text"
      data-testid="admin-shell"
    >
      <AdminSidebar mobileOpen={mobileOpen} onMobileOpenChange={setMobileOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader
          title={title}
          description={description}
          actions={actions}
          onOpenMobileNav={() => setMobileOpen(true)}
        />
        <main className="flex-1 overflow-x-hidden px-4 py-5 md:px-6 md:py-6">{children}</main>
      </div>
    </div>
  );
}
