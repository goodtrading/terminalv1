import { writeDesktopLog } from "@/lib/desktopStorage";

type DesktopFeedReconnectHandler = (() => void) | null;

let reconnectHandler: DesktopFeedReconnectHandler = null;

export function registerDesktopFeedReconnectHandler(handler: DesktopFeedReconnectHandler): void {
  reconnectHandler = handler;
}

export async function requestDesktopFeedReconnect(source = "ui"): Promise<boolean> {
  await writeDesktopLog("desktop_feed_reconnect_click", { source });

  if (!reconnectHandler) {
    await writeDesktopLog("desktop_feed_reconnect_error", {
      source,
      error: "handler_unavailable",
    });
    return false;
  }

  try {
    await writeDesktopLog("desktop_feed_reconnect_requested", { source });
    reconnectHandler();
    await writeDesktopLog("desktop_feed_reconnect_success", { source });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeDesktopLog("desktop_feed_reconnect_error", { source, error: message });
    return false;
  }
}
