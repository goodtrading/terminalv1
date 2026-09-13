import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import cors from "cors";
import { test } from "node:test";

test("credentialed preflight allows the production Tauri origin", async () => {
  process.env.NODE_ENV = "production";
  const { createCorsOptions } = await import("./corsContract");
  const server = createServer((req, res) => {
    cors(createCorsOptions())(req, res, () => res.end("ok"));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");

  const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/login`, {
    method: "OPTIONS",
    headers: {
      Origin: "http://tauri.localhost",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "http://tauri.localhost");
  assert.equal(response.headers.get("access-control-allow-credentials"), "true");
  assert.match(response.headers.get("access-control-allow-methods") ?? "", /POST/);
  assert.match(response.headers.get("access-control-allow-headers") ?? "", /Content-Type/i);

  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test("credentialed CORS rejects an unapproved production origin", async () => {
  process.env.NODE_ENV = "production";
  const { createCorsOptions } = await import("./corsContract");
  const server = createServer((req, res) => {
    cors(createCorsOptions())(req, res, () => res.end("ok"));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");

  const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/login`, {
    method: "OPTIONS",
    headers: {
      Origin: "http://evil.invalid",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal(response.headers.get("access-control-allow-credentials"), null);

  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test("browser writes reject foreign/null origins before side effects; Desktop and native callers remain allowed", async () => {
  process.env.NODE_ENV = "production";
  const { createBrowserWriteOriginGuard } = await import("./corsContract");
  const guard = createBrowserWriteOriginGuard();
  for (const [origin, site, expected] of [
    ["https://evil.invalid", "cross-site", 403],
    ["null", "cross-site", 403],
    ["http://tauri.localhost.evil.invalid", "cross-site", 403],
    ["http://tauri.localhost", "cross-site", 200],
    [undefined, "cross-site", 403],
    [undefined, undefined, 200],
  ] as const) {
    let status = 200, reachedHandler = false;
    guard({method:"POST", get:(key:string)=>key==='Origin'?origin:key==='Sec-Fetch-Site'?site:undefined} as any,
      {status:(code:number)=>{status=code;return {json:()=>{}}}} as any,
      ()=>{reachedHandler=true});
    assert.equal(status,expected,`${origin}/${site}`);
    assert.equal(reachedHandler,expected===200);
  }
});
