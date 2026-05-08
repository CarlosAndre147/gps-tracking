import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));

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

const monorepoRoot = findMonorepoRoot(here);
loadDotenv({ path: path.join(monorepoRoot, ".env") });
loadDotenv({ path: path.join(here, "..", ".env"), override: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não está definido (carregue o .env na raiz do monorepo).");
  process.exit(1);
}

const migrationsFolder = path.join(here, "migrations");

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const db = drizzle(client);
  try {
    await migrate(db, { migrationsFolder });
    console.log("Migrações aplicadas com sucesso.");
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("Falha ao migrar:", msg);
  if (err instanceof Error && "cause" in err && err.cause) {
    console.error("Causa:", err.cause);
  }
  process.exit(1);
});
