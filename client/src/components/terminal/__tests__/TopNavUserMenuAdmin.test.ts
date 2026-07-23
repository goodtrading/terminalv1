import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();
const menuSource = readFileSync(join(root, "client/src/components/terminal/TopNavUserMenu.tsx"), "utf8");
const authRolesSource = readFileSync(join(root, "client/src/lib/authRoles.ts"), "utf8");
const adminRouteSource = readFileSync(join(root, "client/src/pages/admin/AdminRoute.tsx"), "utf8");

describe("TopNavUserMenu Admin Panel", () => {
  it("shows Admin Panel for ADMIN via isAdminUser, not desktop-only", () => {
    assert.ok(menuSource.includes("isAdminUser(user)"));
    assert.ok(menuSource.includes("Admin Panel"));
    assert.ok(menuSource.includes('navigate("/admin")'));
    assert.equal(
      menuSource.includes("isDesktopApp() && isAdminUser(user)"),
      false,
      "Admin Panel must not be gated behind isDesktopApp()",
    );
    assert.ok(authRolesSource.includes('role === "admin"'));
    assert.ok(authRolesSource.includes("isAdminUser"));
  });

  it("keeps route protection via AdminRoute + isAdminUser", () => {
    assert.ok(adminRouteSource.includes("isAdminUser(user)"));
    assert.ok(adminRouteSource.includes('to="/login"'));
    assert.ok(adminRouteSource.includes('to="/terminal"'));
  });

  it("navigates to /admin and closes the dropdown", () => {
    assert.ok(menuSource.includes("setMenuOpen(false)"));
    assert.ok(menuSource.includes('navigate("/admin")'));
    assert.ok(menuSource.includes('data-testid="menu-admin-panel"'));
  });

  it("keeps System diagnostics and Log out behavior", () => {
    assert.ok(menuSource.includes("System diagnostics"));
    assert.ok(menuSource.includes("setDiagnosticsOpen(true)"));
    assert.ok(menuSource.includes("Log out"));
    assert.ok(menuSource.includes("logout()"));
  });

  it("places Admin Panel after System diagnostics and before Log out", () => {
    const diagnosticsIdx = menuSource.indexOf("System diagnostics");
    const adminIdx = menuSource.indexOf("Admin Panel");
    const logoutIdx = menuSource.indexOf("Log out");
    assert.ok(diagnosticsIdx > 0);
    assert.ok(adminIdx > diagnosticsIdx);
    assert.ok(logoutIdx > adminIdx);
  });
});