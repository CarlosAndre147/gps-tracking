import "@/config/bootstrap";
import { buildApp } from "@/app";
import { getEnv } from "@/config/env";
import { logger } from "@/lib/core/logger";

const env = getEnv();

const app = buildApp();

/** Contrato type-only inferido do app real — consumido pelo Eden Treaty no frontend. */
export type App = typeof app;

app.listen(env.PORT);

logger.info({ port: env.PORT }, "api listening");
