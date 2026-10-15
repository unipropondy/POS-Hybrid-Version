import { Platform } from "react-native";
import { API_URL } from "../constants/Config";

// Intercepts browser console messages and sends them to backend for writing to logs/frontend.log
export function initClientLogger() {
  if (Platform.OS !== "web" || typeof window === "undefined") return;

  const originalLog = window.console.log;
  const originalWarn = window.console.warn;
  const originalError = window.console.error;

  let queue: Array<{ level: string; message: string; details?: any }> = [];
  let timer: any = null;
  let isSending = false;

  const flush = async () => {
    if (queue.length === 0 || isSending) return;
    const batch = [...queue];
    queue = [];
    isSending = true;

    try {
      for (const item of batch) {
        await fetch(`${API_URL}/api/logs/client`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        }).catch(() => {});
      }
    } catch {
      // Ignore network errors when shipping logs
    } finally {
      isSending = false;
    }
  };

  const scheduleFlush = () => {
    if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        flush();
      }, 500);
    }
  };

  const formatArgs = (args: any[]) => {
    return args
      .map((a) => {
        if (a instanceof Error) return `${a.message}\n${a.stack}`;
        if (typeof a === "object") {
          try {
            return JSON.stringify(a);
          } catch {
            return String(a);
          }
        }
        return String(a);
      })
      .join(" ");
  };

  window.console.log = (...args: any[]) => {
    originalLog(...args);
    const msg = formatArgs(args);
    // Don't log internal client log requests to avoid loops
    if (msg.includes("/api/logs/client")) return;
    queue.push({ level: "INFO", message: msg });
    scheduleFlush();
  };

  window.console.warn = (...args: any[]) => {
    originalWarn(...args);
    const msg = formatArgs(args);
    if (msg.includes("/api/logs/client")) return;
    queue.push({ level: "WARN", message: msg });
    scheduleFlush();
  };

  window.console.error = (...args: any[]) => {
    originalError(...args);
    const msg = formatArgs(args);
    if (msg.includes("/api/logs/client")) return;
    queue.push({ level: "ERROR", message: msg });
    scheduleFlush();
  };

  // Global uncaught errors
  window.addEventListener("error", (event) => {
    queue.push({
      level: "FATAL",
      message: `Uncaught Error: ${event.message} at ${event.filename}:${event.lineno}`,
    });
    scheduleFlush();
  });

  window.addEventListener("unhandledrejection", (event) => {
    queue.push({
      level: "FATAL",
      message: `Unhandled Promise Rejection: ${event.reason}`,
    });
    scheduleFlush();
  });
}
