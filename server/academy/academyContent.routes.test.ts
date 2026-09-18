import assert from "node:assert/strict";
import { createServer } from "node:http";
import { afterEach, test } from "node:test";
import express from "express";
import { registerAcademyRoutes } from "../routes/academy.routes";
import { __setAcademyAccessResolverForTests } from "./academyContentService";
import { getMemberContentLessonCount } from "./memberContent";
import { __setSaasAuthResolverForTests } from "../middleware/saasAuth";

const fixturePath = "/api/academy/lessons/execution-and-risk/execution-and-risk-20-aggressive-vs-confirmed-entry/content";
const orderFlowMember25Path = "/api/academy/lessons/order-flow-foundations/order-flow-foundations-25-absorption-context/content";
const domMember19Path = "/api/academy/lessons/dom-and-liquidity/dom-and-liquidity-19-wall-defended-vs-wall-fake/content";
const oiMember16Path = "/api/academy/lessons/open-interest-and-derivatives/open-interest-and-derivatives-16-oi-aggression/content";

async function request(path: string): Promise<{ status: number; body: any; cacheControl: string | null }> {
  const app = express();
  app.use(express.json());
  registerAcademyRoutes(app);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
    return {
      status: response.status,
      body: await response.text(),
      cacheControl: response.headers.get("cache-control"),
    };
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

afterEach(() => {
  __setSaasAuthResolverForTests(null);
  __setAcademyAccessResolverForTests(null);
});

test("Academy Member content denies signed-out requests", async () => {
  __setSaasAuthResolverForTests(() => null);
  const result = await request(orderFlowMember25Path);
  assert.equal(result.status, 401);
  assert.equal(JSON.parse(result.body).error, "UNAUTHORIZED");
});

test("Academy Member content denies authenticated users without entitlement", async () => {
  __setSaasAuthResolverForTests(() => ({ id: 7, email: "test@example.com", role: "user" }));
  __setAcademyAccessResolverForTests(async () => ({ allowed: false, reason: "no_subscription" }));
  const result = await request(orderFlowMember25Path);
  assert.equal(result.status, 403);
  assert.equal(JSON.parse(result.body).error, "SUBSCRIPTION_REQUIRED");
});

test("Academy Member content returns the harmless fixture after canonical access allows it", async () => {
  __setSaasAuthResolverForTests(() => ({ id: 7, email: "test@example.com", role: "user" }));
  __setAcademyAccessResolverForTests(async () => ({ allowed: true, reason: undefined }));
  const result = await request(fixturePath);
  assert.equal(result.status, 200);
  const body = JSON.parse(result.body);
  assert.equal(body.lessonId, "course-02-execution-and-risk-module-04-lesson-01");
  assert.match(body.content[0].text, /Agresiva frente a confirmada/);
  assert.equal(result.cacheControl, "private, no-store");
});

test("Academy Member content returns safe 404 for invalid, missing, or FREE routes", async () => {
  __setSaasAuthResolverForTests(() => ({ id: 7, email: "test@example.com", role: "user" }));
  __setAcademyAccessResolverForTests(async () => ({ allowed: true }));
  for (const path of [
    "/api/academy/lessons/not-a-course/not-a-lesson/content",
    "/api/academy/lessons/execution-and-risk/execution-and-risk-01-market-entry/content",
    "/api/academy/lessons/market-mechanics/market-mechanics-01-what-is-a-market/content",
    "/api/academy/lessons/%2e%2e/execution-and-risk-20-aggressive-vs-confirmed-entry/content",
  ]) {
    const result = await request(path);
    assert.equal(result.status, 404, path);
  }
});


test("Execution & Risk Member registry serves lessons 20 through 26", async () => {
  assert.equal(getMemberContentLessonCount(), 94);
  __setSaasAuthResolverForTests(() => ({ id: 7, email: "test@example.com", role: "user" }));
  __setAcademyAccessResolverForTests(async () => ({ allowed: true }));
  const slugs = [
    "aggressive-vs-confirmed-entry",
    "choosing-invalidation",
    "limit-vs-market-in-context",
    "partial-management",
    "when-not-to-move-to-break-even",
    "managing-around-liquidity",
    "execution-replay",
  ];
  for (let index = 0; index < slugs.length; index += 1) {
    const lessonNumber = index + 20;
    const result = await request(`/api/academy/lessons/execution-and-risk/execution-and-risk-${lessonNumber}-${slugs[index]}/content`);
    assert.equal(result.status, 200, `lesson ${lessonNumber}`);
    assert.ok(JSON.parse(result.body).content.length > 0);
  }
});


test("Order Flow Member content serves lessons 25, 31, and 32", async () => {
  __setSaasAuthResolverForTests(() => ({ id: 7, email: "test@example.com", role: "user" }));
  __setAcademyAccessResolverForTests(async () => ({ allowed: true }));
  for (const lesson of [[25, "absorption-context"], [31, "when-to-ignore-an-of-signal"], [32, "goodtrading-order-flow-replay-lab"]] as const) {
    const path = "/api/academy/lessons/order-flow-foundations/order-flow-foundations-" + lesson[0] + "-" + lesson[1] + "/content";
    const result = await request(path);
    assert.equal(result.status, 200, "lesson " + lesson[0]);
    assert.ok(JSON.parse(result.body).content.length > 0);
  }
});


test("Footprint Mastery Member content serves lessons 24, 26, and 29", async () => {
  __setSaasAuthResolverForTests(() => ({ id: 7, email: "test@example.com", role: "user" }));
  __setAcademyAccessResolverForTests(async () => ({ allowed: true }));
  for (const lesson of [[24, "absorption-oi"], [26, "footprint-gamma"], [29, "footprint-replay-lab"]] as const) {
    const path = "/api/academy/lessons/footprint-mastery/footprint-mastery-" + lesson[0] + "-" + lesson[1] + "/content";
    const result = await request(path);
    assert.equal(result.status, 200, "lesson " + lesson[0]);
    assert.ok(JSON.parse(result.body).content.length > 0);
  }
});

test("DOM & Liquidity Member content serves lessons 19, 21, and 25", async () => {
  __setSaasAuthResolverForTests(() => ({ id: 7, email: "test@example.com", role: "user" }));
  __setAcademyAccessResolverForTests(async () => ({ allowed: true }));
  for (const lesson of [[19, "wall-defended-vs-wall-fake"], [21, "real-replenishment"], [25, "dom-replay-lab"]] as const) {
    const path = "/api/academy/lessons/dom-and-liquidity/dom-and-liquidity-" + lesson[0] + "-" + lesson[1] + "/content";
    const result = await request(path);
    assert.equal(result.status, 200, "lesson " + lesson[0]);
    assert.ok(JSON.parse(result.body).content.length > 0);
    assert.equal(result.cacheControl, "private, no-store");
  }
});

test("DOM & Liquidity Member content preserves 401 and rejects FREE content", async () => {
  __setSaasAuthResolverForTests(() => null);
  assert.equal((await request(domMember19Path)).status, 401);
  __setSaasAuthResolverForTests(() => ({ id: 7, email: "test@example.com", role: "user" }));
  __setAcademyAccessResolverForTests(async () => ({ allowed: true }));
  const free = await request("/api/academy/lessons/dom-and-liquidity/dom-and-liquidity-01-what-is-the-dom/content");
  assert.equal(free.status, 404);
});

test("Heatmap & Bookmap Member content serves lessons 19, 26, 28, and 35", async () => {
  __setSaasAuthResolverForTests(() => ({ id: 7, email: "test@example.com", role: "user" }));
  __setAcademyAccessResolverForTests(async () => ({ allowed: true }));
  for (const lesson of [[19, "what-is-passive-compression"], [26, "compression-gamma"], [28, "entry-and-invalidation"], [35, "goodtrading-heatmap-replay-lab"]] as const) {
    const path = "/api/academy/lessons/heatmap-and-bookmap/heatmap-and-bookmap-" + lesson[0] + "-" + lesson[1] + "/content";
    const result = await request(path);
    assert.equal(result.status, 200, "lesson " + lesson[0]);
    assert.ok(JSON.parse(result.body).content.length > 0);
    assert.equal(result.cacheControl, "private, no-store");
  }
});

test("Heatmap & Bookmap Member content denies signed-out, non-entitled, and rejects FREE routes", async () => {
  const memberPath = "/api/academy/lessons/heatmap-and-bookmap/heatmap-and-bookmap-19-what-is-passive-compression/content";
  __setSaasAuthResolverForTests(() => null);
  const signedOut = await request(memberPath);
  assert.equal(signedOut.status, 401);
  __setSaasAuthResolverForTests(() => ({ id: 7, email: "test@example.com", role: "user" }));
  __setAcademyAccessResolverForTests(async () => ({ allowed: false, reason: "no_subscription" }));
  const denied = await request(memberPath);
  assert.equal(denied.status, 403);
  __setAcademyAccessResolverForTests(async () => ({ allowed: true }));
  const free = await request("/api/academy/lessons/heatmap-and-bookmap/heatmap-and-bookmap-01-what-the-heatmap-represents/content");
  assert.equal(free.status, 404);
});

test("Open Interest & Derivatives Member content serves all six protected lessons", async () => {
  __setSaasAuthResolverForTests(() => ({ id: 7, email: "test@example.com", role: "user" }));
  __setAcademyAccessResolverForTests(async () => ({ allowed: true }));
  for (const lesson of [
    [16, "oi-aggression"],
    [17, "oi-absorption"],
    [18, "oi-passive-compression"],
    [19, "oi-breakout"],
    [20, "oi-gamma"],
    [21, "btc-positioning-case-studies"],
  ] as const) {
    const result = await request(`/api/academy/lessons/open-interest-and-derivatives/open-interest-and-derivatives-${lesson[0]}-${lesson[1]}/content`);
    assert.equal(result.status, 200, `lesson ${lesson[0]}`);
    assert.ok(JSON.parse(result.body).content.length > 0);
    assert.equal(result.cacheControl, "private, no-store");
  }
  const free = await request("/api/academy/lessons/open-interest-and-derivatives/open-interest-and-derivatives-08-price-up-oi-up/content");
  assert.equal(free.status, 404);
});

test("Open Interest & Derivatives Member content preserves signed-out and entitlement gates", async () => {
  __setSaasAuthResolverForTests(() => null);
  assert.equal((await request(oiMember16Path)).status, 401);
  __setSaasAuthResolverForTests(() => ({ id: 7, email: "test@example.com", role: "user" }));
  __setAcademyAccessResolverForTests(async () => ({ allowed: false, reason: "no_subscription" }));
  assert.equal((await request(oiMember16Path)).status, 403);
  __setAcademyAccessResolverForTests(async () => ({ allowed: true }));
  const entitled = await request(oiMember16Path);
  assert.equal(entitled.status, 200);
  assert.match(JSON.parse(entitled.body).content[0].text, /OI y agresión/);
});

const gammaMemberLessons = [
  [29, "how-to-prioritize-expirations"],
  [30, "how-to-prioritize-zones"],
  [31, "gamma-flip-acceptance"],
  [32, "gamma-flip-rejection"],
  [33, "magnet-rotation"],
  [34, "gamma-order-flow"],
  [35, "gamma-liquidity"],
  [36, "gamma-open-interest"],
  [37, "when-to-ignore-gamma"],
  [38, "gamma-invalidation"],
  [39, "real-market-replay"],
] as const;

test("Gamma & Dealer Hedging serves all eleven protected lessons", async () => {
  assert.equal(getMemberContentLessonCount(), 94);
  __setSaasAuthResolverTestsForCourse09();
  for (const lesson of gammaMemberLessons) {
    const result = await request(`/api/academy/lessons/gamma-and-dealer-hedging/gamma-and-dealer-hedging-${lesson[0]}-${lesson[1]}/content`);
    assert.equal(result.status, 200, `lesson ${lesson[0]}`);
    assert.ok(JSON.parse(result.body).content.length > 0);
    assert.equal(result.cacheControl, "private, no-store");
  }
});

test("Gamma & Dealer Hedging preserves gates and rejects FREE content", async () => {
  const memberPath = "/api/academy/lessons/gamma-and-dealer-hedging/gamma-and-dealer-hedging-29-how-to-prioritize-expirations/content";
  __setSaasAuthResolverForTests(() => null);
  assert.equal((await request(memberPath)).status, 401);
  __setSaasAuthResolverForTests(() => ({ id: 7, email: "test@example.com", role: "user" }));
  __setAcademyAccessResolverForTests(async () => ({ allowed: false, reason: "no_subscription" }));
  assert.equal((await request(memberPath)).status, 403);
  __setAcademyAccessResolverForTests(async () => ({ allowed: true }));
  const free = await request("/api/academy/lessons/gamma-and-dealer-hedging/gamma-and-dealer-hedging-17-gamma-flip/content");
  assert.equal(free.status, 404);
  const entitled = await request(memberPath);
  assert.equal(entitled.status, 200);
  assert.match(JSON.parse(entitled.body).content[0].text, /Comparar expiraciones/);
});

test("Market Structure & Context serves all three protected lessons", async () => {
  assert.equal(getMemberContentLessonCount(), 94);
  __setSaasAuthResolverTestsForCourse09();
  for (const lesson of [
    [20, "market-state-classification"],
    [21, "building-context-before-entry"],
    [22, "context-market-scan"],
  ] as const) {
    const result = await request(`/api/academy/lessons/market-structure-and-context/market-structure-and-context-${lesson[0]}-${lesson[1]}/content`);
    assert.equal(result.status, 200, `lesson ${lesson[0]}`);
    assert.ok(JSON.parse(result.body).content.length > 0);
    assert.equal(result.cacheControl, "private, no-store");
  }
});

test("Market Structure & Context preserves gates and rejects FREE content", async () => {
  const memberPath = "/api/academy/lessons/market-structure-and-context/market-structure-and-context-20-market-state-classification/content";
  __setSaasAuthResolverForTests(() => null);
  assert.equal((await request(memberPath)).status, 401);
  __setSaasAuthResolverForTests(() => ({ id: 7, email: "test@example.com", role: "user" }));
  __setAcademyAccessResolverForTests(async () => ({ allowed: false, reason: "no_subscription" }));
  assert.equal((await request(memberPath)).status, 403);
  __setAcademyAccessResolverForTests(async () => ({ allowed: true }));
  assert.equal((await request("/api/academy/lessons/market-structure-and-context/market-structure-and-context-12-acceptance/content")).status, 404);
  const entitled = await request(memberPath);
  assert.equal(entitled.status, 200);
  assert.match(JSON.parse(entitled.body).content[0].text, /Clasificar/);
});

test("GoodTrading Playbook serves all fourteen protected lessons", async () => {
  assert.equal(getMemberContentLessonCount(), 94);
  __setSaasAuthResolverTestsForCourse09();
  const lessons = [
    [9, "goodtrading-market-scan"],
    [10, "trade-wait-invalid"],
    [11, "gamma-flip-rejection"],
    [12, "gamma-flip-acceptance"],
    [13, "magnet-rotation"],
    [14, "passive-compression-breakout"],
    [15, "compression-failure"],
    [16, "liquidity-wall-rejection"],
    [17, "liquidity-pull-continuation"],
    [18, "spoof-execution"],
    [19, "absorption-reversal"],
    [20, "failed-breakout"],
    [21, "goodtrading-market-replay"],
    [22, "complete-market-scan"],
  ] as const;
  for (const [lesson, slug] of lessons) {
    const lessonSlug = String(lesson).padStart(2, "0");
    const result = await request(`/api/academy/lessons/goodtrading-playbook/goodtrading-playbook-${lessonSlug}-${slug}/content`);
    assert.equal(result.status, 200, `lesson ${lesson}`);
    assert.ok(JSON.parse(result.body).content.length > 0);
    assert.equal(result.cacheControl, "private, no-store");
  }
});

test("GoodTrading Playbook preserves gates and rejects FREE content", async () => {
  const memberPath = "/api/academy/lessons/goodtrading-playbook/goodtrading-playbook-09-goodtrading-market-scan/content";
  __setSaasAuthResolverForTests(() => null);
  assert.equal((await request(memberPath)).status, 401);
  __setSaasAuthResolverForTests(() => ({ id: 7, email: "test@example.com", role: "user" }));
  __setAcademyAccessResolverForTests(async () => ({ allowed: false, reason: "no_subscription" }));
  assert.equal((await request(memberPath)).status, 403);
  __setAcademyAccessResolverForTests(async () => ({ allowed: true }));
  assert.equal((await request("/api/academy/lessons/goodtrading-playbook/goodtrading-playbook-08-full-public-example/content")).status, 404);
  assert.equal((await request("/api/academy/lessons/goodtrading-playbook/goodtrading-playbook-99-unknown/content")).status, 404);
  assert.equal((await request("/api/academy/lessons/%2e%2e/goodtrading-playbook-09-goodtrading-market-scan/content")).status, 404);
  const entitled = await request(memberPath);
  assert.equal(entitled.status, 200);
  assert.match(JSON.parse(entitled.body).content[0].text, /scan de evidencia/);
});

test("BTC Scalping serves all eighteen protected lessons", async () => {
  assert.equal(getMemberContentLessonCount(), 94);
  __setSaasAuthResolverTestsForCourse09();
  const lessons = [
    [8, "gamma-compression"],
    [9, "absorption-entry"],
    [10, "pulling"],
    [11, "spoofing"],
    [12, "entry-timing"],
    [13, "stop-placement"],
    [14, "invalidation"],
    [15, "partial-management"],
    [16, "full-tp"],
    [17, "failed-setup"],
    [18, "winning-long"],
    [19, "winning-short"],
    [20, "losing-long"],
    [21, "losing-short"],
    [22, "no-trade"],
    [23, "good-decision-bad-outcome"],
    [24, "bad-decision-good-outcome"],
    [25, "btc-scalping-replay"],
  ] as const;
  for (const [lesson, slug] of lessons) {
    const lessonSlug = String(lesson).padStart(2, "0");
    const result = await request(`/api/academy/lessons/btc-scalping/btc-scalping-${lessonSlug}-${slug}/content`);
    assert.equal(result.status, 200, `lesson ${lesson}`);
    assert.ok(JSON.parse(result.body).content.length > 0);
    assert.equal(result.cacheControl, "private, no-store");
  }
});

test("BTC Scalping preserves gates and rejects FREE content", async () => {
  const memberPath = "/api/academy/lessons/btc-scalping/btc-scalping-08-gamma-compression/content";
  __setSaasAuthResolverForTests(() => null);
  assert.equal((await request(memberPath)).status, 401);
  __setSaasAuthResolverForTests(() => ({ id: 7, email: "test@example.com", role: "user" }));
  __setAcademyAccessResolverForTests(async () => ({ allowed: false, reason: "no_subscription" }));
  assert.equal((await request(memberPath)).status, 403);
  __setAcademyAccessResolverForTests(async () => ({ allowed: true }));
  assert.equal((await request("/api/academy/lessons/btc-scalping/btc-scalping-07-session-behavior/content")).status, 404);
  assert.equal((await request("/api/academy/lessons/btc-scalping/btc-scalping-99-unknown/content")).status, 404);
  assert.equal((await request("/api/academy/lessons/%2e%2e/btc-scalping-08-gamma-compression/content")).status, 404);
  const entitled = await request(memberPath);
  assert.equal(entitled.status, 200);
  assert.match(JSON.parse(entitled.body).content[0].text, /Gamma y compresión/);
});

function __setSaasAuthResolverTestsForCourse09(): void {
  __setSaasAuthResolverForTests(() => ({ id: 7, email: "test@example.com", role: "user" }));
  __setAcademyAccessResolverForTests(async () => ({ allowed: true }));
}
