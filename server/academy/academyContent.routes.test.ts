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
  assert.equal(getMemberContentLessonCount(), 28);
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
