import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../../drizzle/schema";
import { getEnv } from "@/config/env";
import { logger } from "@/lib/core/logger";

const globalForPool = globalThis as unknown as { pgPool: Pool | undefined };

function createPool(): Pool {
  const env = getEnv();
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 2_000,
  });
  pool.on("error", (err) => {
    logger.error({ err }, "PostgreSQL pool error");
  });
  return pool;
}

export const pool = globalForPool.pgPool ?? createPool();

if (getEnv().NODE_ENV !== "production") {
  globalForPool.pgPool = pool;
}

export const db = drizzle(pool, { schema });

export type DbClient = typeof db;

/** Tipo da callback de transação Drizzle (node-postgres). */
export type DbTransaction = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

export async function checkDatabase(): Promise<boolean> {
  try {
    const c = await pool.connect();
    try {
      await c.query("SELECT 1");
    } finally {
      c.release();
    }
    return true;
  } catch (err) {
    logger.error({ err }, "database health check failed");
    return false;
  }
}
