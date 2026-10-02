import type { Server } from "node:http";

type SignalSource = Pick<NodeJS.Process, "once" | "off">;

/**
 * Stops accepting requests and drains server-owned PAPER runtimes before the
 * backend exits. Explicit session DELETE remains the preferred way to end a
 * known session before a development deployment.
 */
export function installBackendGracefulShutdown(options: {
  server: Server;
  disposePaperRuntime: () => Promise<void>;
  signals?: SignalSource;
  forceCloseConnectionsAfterMs?: number;
  logError?: (message: string, error: unknown) => void;
}) {
  const signals = options.signals ?? process;
  const forceCloseAfterMs = options.forceCloseConnectionsAfterMs ?? 5_000;
  let shutdownPromise: Promise<void> | null = null;

  const closeServer = (): Promise<void> => {
    if (!options.server.listening) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => options.server.closeAllConnections?.(), forceCloseAfterMs);
      timer.unref?.();
      options.server.close((error) => {
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      });
    });
  };

  const begin = (): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = Promise.all([closeServer(), options.disposePaperRuntime()])
      .then(() => undefined)
      .catch((error) => {
        options.logError?.("Graceful backend shutdown did not complete cleanly.", error);
        throw error;
      });
    return shutdownPromise;
  };

  const onSignal = () => {
    void begin().catch(() => undefined);
  };
  signals.once("SIGINT", onSignal);
  signals.once("SIGTERM", onSignal);

  return {
    shutdown: begin,
    dispose: () => {
      signals.off("SIGINT", onSignal);
      signals.off("SIGTERM", onSignal);
    },
  };
}
