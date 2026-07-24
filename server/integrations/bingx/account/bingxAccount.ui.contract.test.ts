import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("BINGX-1 UI + routes contracts", () => {
  it("UI panel has no Buy/Sell/Cancel/Edit buttons", () => {
    const panel = readFileSync(
      resolve(
        process.cwd(),
        "client/src/components/terminal/bingxAccount/BingxAccountActivityPanel.tsx",
      ),
      "utf8",
    );
    assert.match(panel, /READ ONLY/);
    assert.match(panel, /NOT CONNECTED TO AI|BINGX_UI_BADGES/);
    assert.match(panel, /Manual refresh/);
    assert.doesNotMatch(panel, />\s*Buy\s*</);
    assert.doesNotMatch(panel, />\s*Sell\s*</);
    assert.doesNotMatch(panel, />\s*Cancel\s*</);
    assert.doesNotMatch(panel, />\s*Edit\s*</);
    assert.doesNotMatch(panel, /onClick=\{[^}]*place|submitOrder|cancelOrder/i);
    assert.match(panel, /read-only by design/);
  });

  it("account routes expose read endpoints only (no place/cancel)", () => {
    const routes = readFileSync(
      resolve(process.cwd(), "server/routes/bingxAccount.routes.ts"),
      "utf8",
    );
    assert.match(routes, /\/api\/account\/bingx\/status/);
    assert.match(routes, /\/api\/account\/bingx\/snapshot/);
    assert.match(routes, /\/api\/account\/bingx\/positions/);
    assert.match(routes, /\/api\/account\/bingx\/orders\/open/);
    assert.match(routes, /\/api\/account\/bingx\/orders\/history/);
    assert.match(routes, /\/api\/account\/bingx\/fills/);
    assert.match(routes, /\/api\/account\/bingx\/timeline/);
    assert.match(routes, /\/api\/account\/bingx\/refresh/);
    assert.doesNotMatch(routes, /place.?order|cancel.?order|submit.?order/i);
    assert.match(routes, /No order placement/);
  });

  it("write guard defaults read-only mode", () => {
    const flags = readFileSync(
      resolve(process.cwd(), "server/integrations/bingx/account/flags.ts"),
      "utf8",
    );
    assert.match(flags, /BINGX_READ_ONLY_MODE/);
    assert.match(flags, /envBool\("BINGX_READ_ONLY_MODE", true\)/);
    assert.match(flags, /GOODTRADING_BINGX_ACCOUNT_ENABLED/);
    assert.match(flags, /envBool\("GOODTRADING_BINGX_ACCOUNT_ENABLED", false\)/);
    assert.match(
      flags,
      /envBool\("GOODTRADING_BINGX_ACCOUNT_AUTO_REFRESH", false\)/,
    );
  });
});
