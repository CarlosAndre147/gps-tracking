import { Elysia } from "elysia";
import { serverTiming } from "@elysia/server-timing";
import { getEnv } from "@/config/env";
import { AppError, RateLimitError, checkDatabase, checkRedis, fail, isPgUniqueViolation, logger, ok } from "@/lib/core";
import { corsPlugin } from "@/plugins/cors.plugin";
import { helmetPlugin } from "@/plugins/helmet.plugin";
import { scalarPlugin } from "@/plugins/scalar.plugin";
import { authModule } from "@/modules/auth";
import { companiesModule } from "@/modules/companies";
import { usersModule } from "@/modules/users";
import { trackingModule, trackingWsModule } from "@/modules/tracking";
import { auditModule } from "@/modules/audit";
import { dashboardModule } from "@/modules/admin";
import { setWsServer, startTrackingRedisSubscriber } from "@/lib/tracking";

function requestLogFields(request: Request, path: string, route: string) {
  return {
    method: request.method,
    path,
    route,
    requestId: request.headers.get("x-request-id") ?? undefined,
  };
}

function logHandledAppError(
  cfg: ReturnType<typeof getEnv>,
  fields: ReturnType<typeof requestLogFields>,
  error: AppError,
) {
  const payload = {
    ...fields,
    appCode: error.code,
    httpStatus: error.status,
    message: error.message,
    ...(cfg.NODE_ENV === "development" ? { details: error.details } : {}),
  };
  if (error.status >= 500) {
    logger.error(payload, "handled application error");
  } else {
    logger.warn(payload, "handled application error");
  }
}

export function buildApp() {
  const env = getEnv();
  /* Plugins sempre montados (tipo determinístico para Eden Treaty);
   * `serverTiming.enabled` e `scalarPlugin` decidem internamente se ficam ativos. */
  const app = new Elysia()
    .use(corsPlugin())
    .use(helmetPlugin())
    .use(serverTiming({ enabled: env.NODE_ENV !== "production" }))
    .use(scalarPlugin())
    .onStart((a) => {
      if (a.server) {
        setWsServer(a.server);
      }
      startTrackingRedisSubscriber();
    })
    .onError(({ error, code, set, request, path, route }) => {
      const cfg = getEnv();
      const fields = requestLogFields(request, path, route);

      if (error instanceof AppError) {
        logHandledAppError(cfg, fields, error);
        set.status = error.status;
        if (error instanceof RateLimitError) {
          set.headers["Retry-After"] = String(error.retryAfterSeconds);
        }
        return fail(error.code, error.message, error.details);
      }

      if (code === "VALIDATION") {
        logger.warn(
          {
            ...fields,
            elysiaCode: code,
            msg: error instanceof Error ? error.message : "Validation failed",
            ...(cfg.NODE_ENV === "development" ? { err: error } : {}),
          },
          "request validation failed",
        );
        set.status = 400;
        const message = error instanceof Error ? error.message : "Validation failed";
        return fail("VALIDATION_ERROR", message);
      }

      if (code === "NOT_FOUND") {
        logger.info({ ...fields, elysiaCode: code }, "resource not found");
        set.status = 404;
        return fail("NOT_FOUND", "Resource not found");
      }

      if (isPgUniqueViolation(error)) {
        logger.warn(
          {
            ...fields,
            kind: "CONFLICT",
            ...(cfg.NODE_ENV === "development" ? { err: error } : {}),
          },
          "unique constraint violated",
        );
        set.status = 409;
        return fail("CONFLICT", "Unique constraint violated");
      }

      logger.error({ ...fields, elysiaCode: code, err: error }, "unhandled error");
      set.status = 500;
      return fail("INTERNAL_ERROR", "Internal server error");
    })
    .get("/health", async () => {
      const [database, redisOk] = await Promise.all([checkDatabase(), checkRedis()]);
      const status = database && redisOk ? "ok" : "degraded";
      return ok({
        status,
        database: database ? "up" : "down",
        redis: redisOk ? "up" : "down",
      });
    })
    .use(authModule)
    .use(companiesModule)
    .use(usersModule)
    .use(auditModule)
    .use(dashboardModule)
    .use(trackingModule)
    .use(trackingWsModule);

  return app;
}
