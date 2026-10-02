import { createServer, type Socket } from "node:net";
import { ensurePerpMarketDataAvailable } from "./orderbookServicePerp";
import type { NautilusServerPaperRuntimeManager } from "./nautilusServerPaperRuntime";

type OperatorRequest = {
  op: "start" | "read" | "grant" | "revoke" | "close";
  ownerUserId: number;
  simulationSessionId?: string;
  idempotencyKey?: string;
};

type RuntimeInternals = {
  sessions: Map<number, {
    child: { pid: number | undefined; exitCode: number | null; killed: boolean };
    simulationSessionId: string | null;
    lifecycle: string;
    nautilusVersion: string | null;
    runtimeModules: Record<string, { path: string; sha256: string }> | null;
    orderExecutionAuthorized: boolean;
  }>;
  getRegistry(): {
    database: { prepare(sql: string): { all(...values: unknown[]): Array<Record<string, unknown>> } };
  };
  request(record: unknown, op: string, timeoutOrParams?: number | Record<string, unknown>): Promise<unknown>;
};

const EXECUTION_SOURCES = new Set(["BINANCE_FAPI_REST_BOOKTICKER", "BINANCE_FAPI_WS_DEPTH"]);

/**
 * Temporary local operator channel for a single development acceptance.
 * It is disabled unless all PAPER/order/development flags and a per-process
 * Windows named-pipe path are explicitly supplied. It is not an HTTP route.
 */
export function startN3D5LocalPaperOperator(manager: NautilusServerPaperRuntimeManager): {
  pipeName: string;
  close(): Promise<void>;
} | null {
  const env = process.env;
  const enabled = env.NODE_ENV === "development" &&
    env.GT_NAUTILUS_SERVER_PAPER_ENABLED === "true" &&
    env.GT_NAUTILUS_SERVER_PAPER_ORDERS_ENABLED === "true" &&
    env.GT_NAUTILUS_SERVER_PAPER_ALLOW_ORDER_AUTHORIZATION === "true" &&
    env.GT_N3D5_LOCAL_PAPER_OPERATOR === "1";
  const pipeName = env.GT_N3D5_LOCAL_PAPER_OPERATOR_PIPE;
  const ownerUserId = Number(env.GT_N3D5_LOCAL_PAPER_OPERATOR_OWNER_ID);
  if (!enabled || !pipeName || !/^\\\\\.\\pipe\\goodtrading-n3d5-[a-f0-9-]{36}$/.test(pipeName) ||
      !Number.isSafeInteger(ownerUserId) || ownerUserId <= 0) return null;

  const internals = manager as unknown as RuntimeInternals;
  const requireOwner = (requestedOwner: number) => {
    if (requestedOwner !== ownerUserId) throw new Error("OPERATOR_OWNER_NOT_ALLOWED");
    if (env.NODE_ENV !== "development" || env.GT_NAUTILUS_SERVER_PAPER_ENABLED !== "true" ||
        env.GT_NAUTILUS_SERVER_PAPER_ORDERS_ENABLED !== "true" ||
        env.GT_NAUTILUS_SERVER_PAPER_ALLOW_ORDER_AUTHORIZATION !== "true") throw new Error("OPERATOR_FLAGS_NOT_ACTIVE");
  };
  const requireSession = (requestedOwner: number, sessionId: string) => {
    requireOwner(requestedOwner);
    const current = manager.getLifecycle(requestedOwner);
    if (current.lifecycle !== "AVAILABLE" || !sessionId || current.simulationSessionId !== sessionId) {
      throw new Error("OPERATOR_SESSION_IDENTITY_OR_LIFECYCLE_MISMATCH");
    }
    const record = internals.sessions.get(requestedOwner);
    if (!record || record.lifecycle !== "AVAILABLE" || record.simulationSessionId !== sessionId || record.child.exitCode !== null || record.child.killed) {
      throw new Error("OPERATOR_DAEMON_NOT_HEALTHY");
    }
    return record;
  };
  const commandRows = (requestedOwner: number, sessionId: string) => internals.getRegistry().database.prepare(
    "SELECT status, COUNT(*) AS count FROM server_paper_commands WHERE owner_user_id=? AND simulation_session_id=? GROUP BY status",
  ).all(requestedOwner, sessionId);

  const read = async (requestedOwner: number, sessionId: string) => {
    const record = requireSession(requestedOwner, sessionId);
    const health = await internals.request(record, "health", 4_000) as Record<string, unknown>;
    const snapshot = await manager.readSnapshot(requestedOwner);
    const orders = await manager.readOrders(requestedOwner);
    const fills = await manager.readFills(requestedOwner);
    const marketSamples: Array<Record<string, unknown>> = [];
    const marketSampleErrors: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      try {
        marketSamples.push(await manager.applyFreshServerQuote(requestedOwner));
      } catch (error) {
        marketSampleErrors.push(error instanceof Error ? error.message : String(error));
        break;
      }
      if (i < 2) await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    const status = await manager.readRuntimeStatus(requestedOwner);
    const current = manager.getLifecycle(requestedOwner);
    const auth = manager.getOrderExecutionAuthorization(requestedOwner);
    const commands = commandRows(requestedOwner, sessionId);
    return {
      ownerUserId: requestedOwner,
      session: current,
      daemon: { pid: record.child.pid, exitCode: record.child.exitCode, killed: record.child.killed, health },
      runtime: { nautilusVersion: record.nautilusVersion, modules: record.runtimeModules, status },
      account: snapshot.account,
      position: snapshot.position,
      nativeOrders: orders,
      nativeFills: fills,
      commands,
      marketSampleErrors,
      executionAuthorization: auth,
      marketSamples,
      cleanInitialState: current.lifecycle === "AVAILABLE" &&
        current.simulationSessionId === sessionId &&
        String(snapshot.account.accountId) === "SIM-001" &&
        String(snapshot.account.currency).toUpperCase() === "USDT" &&
        Math.abs(Number(snapshot.account.balance) - 100_000) < 0.000001 &&
        String(snapshot.position.side).toUpperCase() === "FLAT" && Number(snapshot.position.quantity) === 0 &&
        orders.length === 0 && fills.length === 0 && commands.length === 0,
    };
  };

  const handle = async (request: OperatorRequest): Promise<unknown> => {
    requireOwner(request.ownerUserId);
    switch (request.op) {
      case "start": {
        ensurePerpMarketDataAvailable();
        const result = await manager.startForUser(request.ownerUserId);
        return { ...result, lifecycle: manager.getLifecycle(request.ownerUserId) };
      }
      case "read": {
        if (!request.simulationSessionId) throw new Error("OPERATOR_SESSION_ID_REQUIRED");
        return await read(request.ownerUserId, request.simulationSessionId);
      }
      case "grant": {
        if (!request.simulationSessionId) throw new Error("OPERATOR_SESSION_ID_REQUIRED");
        const record = requireSession(request.ownerUserId, request.simulationSessionId);
        const health = await internals.request(record, "health", 4_000) as Record<string, unknown>;
        const snapshot = await manager.readSnapshot(request.ownerUserId);
        const orders = await manager.readOrders(request.ownerUserId);
        const fills = await manager.readFills(request.ownerUserId);
        const status = await manager.readRuntimeStatus(request.ownerUserId) as Record<string, any>;
        const commands = commandRows(request.ownerUserId, request.simulationSessionId);
        const account = snapshot.account as Record<string, unknown>;
        const position = snapshot.position as Record<string, unknown>;
        const cleanInitialState = health.status === "healthy" && status.state === "RUNNING" &&
          manager.getLifecycle(request.ownerUserId).simulationSessionId === request.simulationSessionId &&
          String(account.accountId) === "SIM-001" && String(account.currency).toUpperCase() === "USDT" &&
          Math.abs(Number(account.balance) - 100_000) < 0.000001 &&
          String(position.side).toUpperCase() === "FLAT" && Number(position.quantity) === 0 &&
          orders.length === 0 && fills.length === 0 && commands.length === 0;
        if (!cleanInitialState) {
          throw new Error("OPERATOR_GRANT_PRECONDITIONS_FAILED");
        }
        for (const active of internals.sessions.values()) {
          if (active.orderExecutionAuthorized && active.simulationSessionId !== request.simulationSessionId) {
            throw new Error("OPERATOR_OTHER_SESSION_ALREADY_AUTHORIZED");
          }
        }
        if (manager.getOrderExecutionAuthorization(request.ownerUserId).authorized) {
          throw new Error("OPERATOR_SESSION_ALREADY_AUTHORIZED");
        }

        // Make the provider's last result the final pre-grant check. Re-reading
        // three one-second-spaced quotes here made a valid BBO expire while the
        // operator was still doing read-only checks; order submission continues
        // to revalidate freshness independently in the manager and daemon.
        const quote = await manager.applyFreshServerQuote(request.ownerUserId) as Record<string, any>;
        const quoteAgeMs = Number(quote.quoteAgeMs ?? quote.sourceAgeMs);
        if (quote.applied !== true || !EXECUTION_SOURCES.has(String(quote.marketDataSource ?? quote.source)) ||
            quote.instrument?.symbol !== "BTCUSDT-PERP" || !Number.isFinite(quoteAgeMs) || quoteAgeMs < 0 || quoteAgeMs > 3_000 ||
            !Number.isFinite(Number(quote.bid)) || Number(quote.bid) <= 0 ||
            !Number.isFinite(Number(quote.ask)) || Number(quote.ask) <= Number(quote.bid)) {
          throw new Error("OPERATOR_GRANT_PERP_BBO_NOT_FRESH");
        }
        const result = manager.grantOrderExecution(request.ownerUserId, request.simulationSessionId);
        return { ...result, environment: env.NODE_ENV, flags: "all_required_dev_flags_active", account: { accountId: account.accountId, balance: account.balance, currency: account.currency }, position: { side: position.side, quantity: position.quantity }, quote: { source: quote.marketDataSource ?? quote.source, instrument: quote.instrument, bid: quote.bid, ask: quote.ask, quoteAgeMs }, authorization: manager.getOrderExecutionAuthorization(request.ownerUserId) };
      }
      case "revoke": {
        if (!request.simulationSessionId) throw new Error("OPERATOR_SESSION_ID_REQUIRED");
        requireSession(request.ownerUserId, request.simulationSessionId);
        return manager.revokeOrderExecution(request.ownerUserId, request.simulationSessionId);
      }
      case "close": {
        if (!request.simulationSessionId || !request.idempotencyKey) throw new Error("OPERATOR_CLOSE_IDEMPOTENCY_REQUIRED");
        requireSession(request.ownerUserId, request.simulationSessionId);
        const authorization = manager.getOrderExecutionAuthorization(request.ownerUserId);
        if (!authorization.authorized || authorization.simulationSessionId !== request.simulationSessionId) throw new Error("OPERATOR_CLOSE_SESSION_NOT_AUTHORIZED");
        return await manager.closePositionCommand(request.ownerUserId, request.idempotencyKey);
      }
    }
  };

  const server = createServer((socket: Socket) => {
    let input = "";
    socket.setEncoding("utf8");
    // A local diagnostic client may hit its own deadline and close the pipe
    // while a native read is still completing. Never let a late response
    // propagate EPIPE as an uncaught exception that terminates the backend.
    socket.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code !== "EPIPE") {
        console.error("[n3d5-local-paper-operator] local pipe client error", error.message);
      }
    });
    const respond = (payload: unknown) => {
      if (socket.destroyed || !socket.writable) return;
      try {
        socket.end(`${JSON.stringify(payload)}\n`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EPIPE") {
          console.error("[n3d5-local-paper-operator] local pipe response error", error instanceof Error ? error.message : String(error));
        }
      }
    };
    socket.on("data", (chunk) => {
      input += chunk;
      if (input.length > 16_384) {
        respond({ ok: false, error: "OPERATOR_REQUEST_TOO_LARGE" });
        return;
      }
      const lineEnd = input.indexOf("\n");
      if (lineEnd < 0) return;
      const line = input.slice(0, lineEnd);
      void (async () => {
        try {
          const request = JSON.parse(line) as OperatorRequest;
          const result = await handle(request);
          respond({ ok: true, result });
        } catch (error) {
          respond({ ok: false, error: error instanceof Error ? error.message : String(error) });
        }
      })();
    });
  });
  server.on("error", (error) => console.error("[n3d5-local-paper-operator] local pipe error", error.message));
  server.listen(pipeName);
  console.info("[n3d5-local-paper-operator] local development operator pipe enabled");
  return { pipeName, close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}
