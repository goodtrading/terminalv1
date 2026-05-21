import { loadBrokerSession } from "../execution/brokerSessionState";
import { emitTerminalAudit } from "./terminalAuditLog";

let prevExchange: string | null = null;
let prevMode: string | null = null;
let prevConnectionId: string | undefined;
let registered = false;

export function registerTerminalAuditBridge(): void {
  if (registered) return;
  registered = true;

  const boot = loadBrokerSession();
  prevExchange = boot.exchange;
  prevMode = boot.connectionMode ?? null;
  prevConnectionId = boot.connectionId;

  const onSessionChange = () => {
    const s = loadBrokerSession();
    const ex = s.exchange;
    const mode = s.connectionMode ?? null;
    const cid = s.connectionId;

    if (ex !== prevExchange || mode !== prevMode) {
      const from = prevExchange ? `${prevExchange}/${prevMode ?? "—"}` : "none";
      const to = ex ? `${ex}/${mode ?? "—"}` : "none";
      emitTerminalAudit("broker_switched", `Broker: ${from} → ${to}`, "info", {
        exchange: ex,
        mode: mode ?? undefined,
      });
    }

    if (
      ex === "bingx" &&
      mode === "read-only" &&
      s.connected &&
      cid &&
      cid !== prevConnectionId
    ) {
      emitTerminalAudit("bingx_connected", "BingX read-only connected");
    }

    if (prevExchange === "bingx" && ex !== "bingx" && prevConnectionId) {
      emitTerminalAudit("bingx_disconnected", "BingX read-only disconnected");
    }

    prevExchange = ex;
    prevMode = mode;
    prevConnectionId = cid;
  };

  window.addEventListener("goodtrading-broker-session-changed", onSessionChange);
  window.addEventListener("storage", (e) => {
    if (e.key?.includes("brokerSession")) onSessionChange();
  });
}
