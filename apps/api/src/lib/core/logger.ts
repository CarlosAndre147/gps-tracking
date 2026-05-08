import pino from "pino";
import { getEnv } from "@/config/env";

export function createLogger() {
  const env = getEnv();
  const base = { service: "gps-tracker-api", env: env.NODE_ENV };
  const pretty = env.NODE_ENV === "development" || env.NODE_ENV === "test";

  if (pretty) {
    try {
      return pino({
        level: env.LOG_LEVEL,
        base,
        timestamp: pino.stdTimeFunctions.isoTime,
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
            ignore: "pid,hostname",
            singleLine: false,
            messageKey: "msg",
            errorLikeObjectKeys: ["err", "error"],
          },
        },
      });
    } catch {
      // In Docker runtime we install only production deps, so pino-pretty can be absent.
      // Fallback keeps API booting with structured logs.
    }
  }

  return pino({
    level: env.LOG_LEVEL,
    base,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  });
}

export const logger = createLogger();
