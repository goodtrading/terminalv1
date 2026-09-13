import crypto from "node:crypto";
import type { Server } from "node:http";
import type { Express, Request, Response } from "express";
import { WebSocketServer, type WebSocket } from "ws";
import { requireSaasAuth } from "../middleware/saasAuth";

export const NAUTILUS_QUOTE_PROTOCOL_VERSION = 1;
export const NAUTILUS_QUOTE_PATH = "/ws/nautilus/quotes";
const CAPABILITY_TTL_MS = 60_000;
const RECONNECT_TTL_MS = 15 * 60_000;
const MAX_FRAME_BYTES = 64 * 1024;
const MAGIC = Buffer.from("GTQB");
const QUOTE_BBO = 1;
const QUOTE_SOURCE_UNAVAILABLE = 2;
const QUOTE_RECONNECT_CREDENTIAL = 3;

type QuoteBbo = {
  sequence: number;
  bestBidPrice: string;
  bestBidSize: string;
  bestAskPrice: string;
  bestAskSize: string;
  sourceTimestampMs: number;
  localAppliedTimestampMs: number;
  source: "binance";
  market: "perpetual";
  symbol: "BTCUSDT";
};

type Capability = { userId: number; issuedAt: number; expiresAt: number; kind: "bootstrap" | "reconnect" };
const capabilities = new Map<string, Capability>();
const subscribers = new Set<WebSocket>();
const subscriberMailboxes = new Map<WebSocket, { sending: boolean; pendingQuote: Buffer | null; pendingUnavailable: Buffer | null }>();
const subscriberLeases = new Map<WebSocket, { userId: number; token: string; expiresAt: number }>();
let latestQuote: QuoteBbo | null = null;
let latestUnavailable = true;
let publishedSequence = 0;

function jsonResponse(res: Response, status: number, body: Record<string, unknown>): void {
  res.status(status).type("application/json").json(body);
}

function userId(req: Request): number | null {
  const raw = req.saasUser?.id ?? req.user?.id;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function issueCapability(id: number, streamUrl: string): Record<string, unknown> {
  const token = crypto.randomBytes(32).toString("base64url");
  const issuedAt = Date.now();
  const expiresAt = issuedAt + CAPABILITY_TTL_MS;
  capabilities.set(token, { userId: id, issuedAt, expiresAt, kind: "bootstrap" });
  return {
    streamUrl,
    capabilityToken: token,
    issuedAt,
    expiresAt,
    protocolVersion: NAUTILUS_QUOTE_PROTOCOL_VERSION,
    allowedInstrument: "BTCUSDT-PERP",
    allowedMarket: "perpetual",
  };
}

function readCapability(request: import("node:http").IncomingMessage): { token: string; capability: Capability } | null {
  const header = request.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  const capability = capabilities.get(token);
  if (!capability || capability.expiresAt <= Date.now()) {
    if (capability) capabilities.delete(token);
    return null;
  }
  return { token, capability };
}

function issueReconnectCredential(userId: number): { token: string; issuedAt: number; expiresAt: number } {
  const token = crypto.randomBytes(32).toString("base64url");
  const issuedAt = Date.now();
  const expiresAt = issuedAt + RECONNECT_TTL_MS;
  capabilities.set(token, { userId, issuedAt, expiresAt, kind: "reconnect" });
  return { token, issuedAt, expiresAt };
}

function encodeFrame(type: number, sequence: number, payload: Record<string, unknown>): Buffer {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const header = Buffer.alloc(18);
  MAGIC.copy(header, 0);
  header.writeUInt8(NAUTILUS_QUOTE_PROTOCOL_VERSION, 4);
  header.writeUInt8(type, 5);
  header.writeUInt32LE(body.length, 6);
  header.writeBigUInt64LE(BigInt(sequence), 10);
  const frame = Buffer.concat([header, body]);
  if (frame.length > MAX_FRAME_BYTES) throw new Error("quote frame exceeds maximum size");
  return frame;
}

function sendUnavailable(socket: WebSocket): void {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(encodeFrame(QUOTE_SOURCE_UNAVAILABLE, publishedSequence, {
    source: "binance", market: "perpetual", symbol: "BTCUSDT-PERP",
  }));
}

function pump(socket: WebSocket): void {
  const mailbox = subscriberMailboxes.get(socket);
  if (!mailbox || mailbox.sending || socket.readyState !== socket.OPEN) return;
  if (socket.bufferedAmount > MAX_FRAME_BYTES) return;
  const frame = mailbox.pendingUnavailable ?? mailbox.pendingQuote;
  if (!frame) return;
  if (mailbox.pendingUnavailable === frame) mailbox.pendingUnavailable = null;
  else mailbox.pendingQuote = null;
  mailbox.sending = true;
  socket.send(frame, (error) => {
    mailbox.sending = false;
    if (error) socket.close();
    else pump(socket);
  });
}

function enqueue(socket: WebSocket, frame: Buffer, unavailable = false): void {
  const mailbox = subscriberMailboxes.get(socket);
  if (!mailbox) return;
  if (unavailable) mailbox.pendingUnavailable = frame;
  else if (!mailbox.pendingUnavailable) mailbox.pendingQuote = frame;
  pump(socket);
}

function sendCurrent(socket: WebSocket): void {
  if (latestQuote && !latestUnavailable) socket.send(encodeFrame(QUOTE_BBO, latestQuote.sequence, latestQuote));
  else sendUnavailable(socket);
}

export function publishPerpBbo(input: Omit<QuoteBbo, "sequence">): void {
  const previous = latestQuote;
  if (previous && !latestUnavailable &&
      previous.bestBidPrice === input.bestBidPrice && previous.bestBidSize === input.bestBidSize &&
      previous.bestAskPrice === input.bestAskPrice && previous.bestAskSize === input.bestAskSize) return;
  publishedSequence += 1;
  latestQuote = { ...input, sequence: publishedSequence };
  latestUnavailable = false;
  const frame = encodeFrame(QUOTE_BBO, publishedSequence, latestQuote);
  for (const socket of Array.from(subscribers)) {
    enqueue(socket, frame);
  }
}

export function publishPerpQuoteUnavailable(): void {
  if (latestUnavailable) return;
  latestUnavailable = true;
  publishedSequence += 1;
  for (const socket of Array.from(subscribers)) enqueue(socket, encodeFrame(QUOTE_SOURCE_UNAVAILABLE, publishedSequence, {
    source: "binance", market: "perpetual", symbol: "BTCUSDT-PERP",
  }), true);
}

export function registerNautilusQuoteStream(httpServer: Server, app: Express): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES, perMessageDeflate: false });
  const pumpTimer = setInterval(() => {
    for (const socket of Array.from(subscribers)) {
      const lease = subscriberLeases.get(socket);
      if (lease && lease.expiresAt - Date.now() <= 5 * 60_000) {
        const next = issueReconnectCredential(lease.userId);
        capabilities.delete(lease.token);
        lease.token = next.token;
        lease.expiresAt = next.expiresAt;
        enqueue(socket, encodeFrame(QUOTE_RECONNECT_CREDENTIAL, 0, { reconnectToken: next.token, issuedAt: next.issuedAt, expiresAt: next.expiresAt, allowedInstrument: "BTCUSDT-PERP", allowedMarket: "perpetual" }));
      }
      pump(socket);
    }
  }, 50);
  pumpTimer.unref();
  httpServer.once("close", () => clearInterval(pumpTimer));
  app.post("/api/desktop/nautilus/quote-capability", requireSaasAuth, (req, res) => {
    const id = userId(req);
    if (id == null) return jsonResponse(res, 401, { success: false, code: "UNAUTHORIZED", message: "Authentication required." });
    const secure = process.env.NODE_ENV === "production";
    const host = req.get("host");
    if (!host) return jsonResponse(res, 500, { success: false, code: "STREAM_HOST_UNAVAILABLE", message: "Stream host unavailable." });
    const streamUrl = `${secure ? "wss" : "ws"}://${host}${NAUTILUS_QUOTE_PATH}`;
    return jsonResponse(res, 200, { success: true, ...issueCapability(id, streamUrl) });
  });
  httpServer.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== NAUTILUS_QUOTE_PATH) return;
    const authorized = readCapability(request);
    if (!authorized) { socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n"); socket.destroy(); return; }
    wss.handleUpgrade(request, socket, head, (client) => {
      subscribers.add(client);
      subscriberMailboxes.set(client, { sending: false, pendingQuote: null, pendingUnavailable: null });
      client.once("close", () => { subscribers.delete(client); subscriberMailboxes.delete(client); subscriberLeases.delete(client); });
      client.once("error", () => { subscribers.delete(client); subscriberMailboxes.delete(client); subscriberLeases.delete(client); });
      const reconnect = issueReconnectCredential(authorized.capability.userId);
      if (authorized.capability.kind === "reconnect") capabilities.delete(authorized.token);
      subscriberLeases.set(client, { userId: authorized.capability.userId, token: reconnect.token, expiresAt: reconnect.expiresAt });
      enqueue(client, encodeFrame(QUOTE_RECONNECT_CREDENTIAL, 0, { reconnectToken: reconnect.token, issuedAt: reconnect.issuedAt, expiresAt: reconnect.expiresAt, allowedInstrument: "BTCUSDT-PERP", allowedMarket: "perpetual" }));
      if (latestQuote && !latestUnavailable) enqueue(client, encodeFrame(QUOTE_BBO, latestQuote.sequence, latestQuote));
      else enqueue(client, encodeFrame(QUOTE_SOURCE_UNAVAILABLE, publishedSequence, { source: "binance", market: "perpetual", symbol: "BTCUSDT-PERP" }), true);
      void import("./orderbookServicePerp")
        .then(({ ensurePerpMarketDataAvailable }) => ensurePerpMarketDataAvailable())
        .catch((error: unknown) => console.error("[NautilusQuoteStream] Perp source activation failed:", error));
    });
  });
}

export function resetNautilusQuoteStreamForTests(): void {
  capabilities.clear();
  subscribers.clear();
  subscriberMailboxes.clear();
  subscriberLeases.clear();
  latestQuote = null;
  latestUnavailable = true;
  publishedSequence = 0;
}

export function __addNautilusSubscriberForTests(socket: WebSocket): void {
  subscribers.add(socket);
  subscriberMailboxes.set(socket, { sending: false, pendingQuote: null, pendingUnavailable: null });
}

export function __readNautilusMailboxForTests(socket: WebSocket): { sending: boolean; pendingQuote: Buffer | null; pendingUnavailable: Buffer | null } | undefined {
  return subscriberMailboxes.get(socket);
}

export function __issueNautilusCapabilityForTests(userId: number, now = Date.now()): { token: string; issuedAt: number; expiresAt: number } {
  const token = crypto.randomBytes(32).toString("base64url");
  const issuedAt = now;
  const expiresAt = issuedAt + CAPABILITY_TTL_MS;
  capabilities.set(token, { userId, issuedAt, expiresAt, kind: "bootstrap" });
  return { token, issuedAt, expiresAt };
}

export function __issueNautilusReconnectForTests(userId: number, now = Date.now()): { token: string; issuedAt: number; expiresAt: number } {
  const token = crypto.randomBytes(32).toString("base64url");
  const issuedAt = now;
  const expiresAt = issuedAt + RECONNECT_TTL_MS;
  capabilities.set(token, { userId, issuedAt, expiresAt, kind: "reconnect" });
  return { token, issuedAt, expiresAt };
}

export function __isNautilusCapabilityValidForTests(token: string, now = Date.now()): boolean {
  const capability = capabilities.get(token);
  return capability != null && capability.expiresAt > now;
}

export const __nautilusQuoteStreamTest = { encodeFrame, MAX_FRAME_BYTES };
