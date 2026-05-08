import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

let dotenvPreloaded = false;

function findMonorepoRoot(startDir: string): string {
  let dir = path.resolve(startDir);
  const { root } = path.parse(dir);
  while (dir !== root) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return startDir;
}

/** Root `.env`, then optional `apps/api/.env` (override). Same order as `drizzle.config.ts`. */
function preloadEnvFiles(): void {
  if (dotenvPreloaded) return;
  dotenvPreloaded = true;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const monorepoRoot = findMonorepoRoot(here);
  const apiRoot = path.join(monorepoRoot, "apps", "api");
  loadDotenv({ path: path.join(monorepoRoot, ".env") });
  loadDotenv({ path: path.join(apiRoot, ".env"), override: true });
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    REFRESH_SECRET: z.string().min(32, "REFRESH_SECRET must be at least 32 characters"),
    ALLOWED_ORIGINS: z.string().min(1),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    SEED_ADMIN_EMAIL: z.string().email().optional(),
    SEED_ADMIN_PASSWORD: z.string().min(8).optional(),
    /** HTTP Basic user for `/docs` (Scalar). Required when `NODE_ENV` is not `production`. */
    SCALAR_USER: z.string().optional(),
    /** HTTP Basic password for `/docs` (Scalar). Required when `NODE_ENV` is not `production`. */
    SCALAR_PASSWORD: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === "production") {
      return;
    }
    if (!data.SCALAR_USER || data.SCALAR_USER.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SCALAR_USER is required when NODE_ENV is not production",
        path: ["SCALAR_USER"],
      });
    }
    if (!data.SCALAR_PASSWORD || data.SCALAR_PASSWORD.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SCALAR_PASSWORD is required when NODE_ENV is not production",
        path: ["SCALAR_PASSWORD"],
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function loadEnv(): Env {
  if (cached) return cached;
  preloadEnvFiles();
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.flatten().fieldErrors;
    throw new Error(`Invalid environment: ${JSON.stringify(msg)}`);
  }
  cached = parsed.data;
  return parsed.data;
}

export function getEnv(): Env {
  if (!cached) {
    return loadEnv();
  }
  return cached;
}
