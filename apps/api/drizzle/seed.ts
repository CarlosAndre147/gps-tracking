import bcrypt from "bcryptjs";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { companies, userCompanies, users } from "./schema";

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
  throw new Error("DATABASE_URL não está definido (carregue o .env na raiz do monorepo).");
}

const pool = new pg.Pool({ connectionString: url });
const db = drizzle(pool);

function normalizeCpf(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizeCnpj(value: string): string {
  return value.replace(/\D/g, "");
}

function isValidCpf(value: string): boolean {
  return /^\d{11}$/.test(normalizeCpf(value));
}

function isValidCnpj(value: string): boolean {
  return /^\d{14}$/.test(normalizeCnpj(value));
}

const BCRYPT_ROUNDS = 12;
const DEMO_PASSWORD = "Password123!";

function normalizePhoneDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 14) {
    throw new Error(`Seed phone invalid: ${value}`);
  }
  return digits;
}

async function stableHash(password: string, currentHash?: string | null): Promise<string> {
  if (currentHash && (await bcrypt.compare(password, currentHash))) {
    return currentHash;
  }
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

type Role = "SYSTEM_ADMIN" | "COMPANY_ADMIN" | "USER";

const COMPANY_DEFS = [
  {
    name: "Acme Transport Co.",
    cnpj: normalizeCnpj("11.222.333/0001-81"),
    email: "contact@acme-transport.example",
    phone: "5511999990001",
  },
  {
    name: "Beta Logistics Ltd.",
    cnpj: normalizeCnpj("27.865.757/0001-02"),
    email: "hello@beta-logistics.example",
    phone: "5511888880002",
  },
  {
    name: "Gamma Express S.A.",
    cnpj: "55443322000016",
    email: "contato@gamma-express.example",
    phone: "5511777770003",
  },
  {
    name: "Delta Cargo Brasil",
    cnpj: "55443322000105",
    email: "ops@delta-cargo.example",
    phone: "5511666660004",
  },
  {
    name: "Epsilon Fleet Services",
    cnpj: "55443322000288",
    email: "fleet@epsilon-fleet.example",
    phone: "5511555550005",
  },
] as const;

const USER_DEFS: {
  email: string;
  name: string;
  cpf: string;
  phone: string;
  role: Role;
  isActive?: boolean;
}[] = [
  {
    name: "Company Admin",
    email: "company.admin@example.com",
    cpf: normalizeCpf("39053344705"),
    phone: "5511977770003",
    role: "COMPANY_ADMIN",
  },
  {
    name: "Fernanda Alves",
    email: "fernanda.admin@example.com",
    cpf: "98765432614",
    phone: "5511944440006",
    role: "COMPANY_ADMIN",
  },
  {
    name: "Gustavo Mendes",
    email: "gustavo.admin@example.com",
    cpf: "98765432886",
    phone: "5511933330007",
    role: "COMPANY_ADMIN",
  },
  {
    name: "Alice User",
    email: "alice.user@example.com",
    cpf: normalizeCpf("86288366757"),
    phone: "5511966660004",
    role: "USER",
  },
  {
    name: "Bob User",
    email: "bob.user@example.com",
    cpf: normalizeCpf("52998224725"),
    phone: "5511955550005",
    role: "USER",
  },
  {
    name: "Carla Santos",
    email: "carla.user@example.com",
    cpf: "98765432029",
    phone: "5511922220008",
    role: "USER",
  },
  {
    name: "Daniel Costa",
    email: "daniel.user@example.com",
    cpf: "98765432290",
    phone: "5511911110009",
    role: "USER",
  },
  {
    name: "Elena Ribeiro",
    email: "elena.user@example.com",
    cpf: "98765432452",
    phone: "5511900000010",
    role: "USER",
  },
  {
    name: "Iago Martins",
    email: "iago.user@example.com",
    cpf: "98765433009",
    phone: "5511899990011",
    role: "USER",
  },
  {
    name: "Juliana Lima",
    email: "juliana.user@example.com",
    cpf: "98765433262",
    phone: "5511888880012",
    role: "USER",
    isActive: false,
  },
  {
    name: "Karina Dias",
    email: "karina.user@example.com",
    cpf: "98765433424",
    phone: "5511877770013",
    role: "USER",
  },
];

/** userEmail → company CNPJ (normalized) */
const USER_COMPANY_LINKS: { email: string; cnpj: string }[] = [
  { email: "company.admin@example.com", cnpj: COMPANY_DEFS[0].cnpj },
  { email: "company.admin@example.com", cnpj: COMPANY_DEFS[2].cnpj },
  { email: "company.admin@example.com", cnpj: COMPANY_DEFS[3].cnpj },
  { email: "fernanda.admin@example.com", cnpj: COMPANY_DEFS[1].cnpj },
  { email: "fernanda.admin@example.com", cnpj: COMPANY_DEFS[4].cnpj },
  { email: "gustavo.admin@example.com", cnpj: COMPANY_DEFS[2].cnpj },
  { email: "alice.user@example.com", cnpj: COMPANY_DEFS[0].cnpj },
  { email: "alice.user@example.com", cnpj: COMPANY_DEFS[2].cnpj },
  { email: "bob.user@example.com", cnpj: COMPANY_DEFS[1].cnpj },
  { email: "bob.user@example.com", cnpj: COMPANY_DEFS[3].cnpj },
  { email: "carla.user@example.com", cnpj: COMPANY_DEFS[0].cnpj },
  { email: "carla.user@example.com", cnpj: COMPANY_DEFS[1].cnpj },
  { email: "carla.user@example.com", cnpj: COMPANY_DEFS[3].cnpj },
  { email: "daniel.user@example.com", cnpj: COMPANY_DEFS[4].cnpj },
  { email: "elena.user@example.com", cnpj: COMPANY_DEFS[1].cnpj },
  { email: "elena.user@example.com", cnpj: COMPANY_DEFS[4].cnpj },
  { email: "iago.user@example.com", cnpj: COMPANY_DEFS[0].cnpj },
  { email: "iago.user@example.com", cnpj: COMPANY_DEFS[1].cnpj },
  { email: "juliana.user@example.com", cnpj: COMPANY_DEFS[3].cnpj },
  { email: "juliana.user@example.com", cnpj: COMPANY_DEFS[4].cnpj },
  { email: "karina.user@example.com", cnpj: COMPANY_DEFS[0].cnpj },
  { email: "karina.user@example.com", cnpj: COMPANY_DEFS[1].cnpj },
  { email: "karina.user@example.com", cnpj: COMPANY_DEFS[2].cnpj },
  { email: "karina.user@example.com", cnpj: COMPANY_DEFS[4].cnpj },
];

async function main(): Promise<void> {
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set for seeding");
  }

  const adminEmailLower = adminEmail.toLowerCase();
  const adminCpf = normalizeCpf("11144477735");

  for (const c of COMPANY_DEFS) {
    if (!isValidCnpj(normalizeCnpj(c.cnpj))) throw new Error(`Seed CNPJ invalid: ${c.cnpj}`);
    normalizePhoneDigits(c.phone);
  }
  const allCpfs = new Set<string>([adminCpf, ...USER_DEFS.map((u) => normalizeCpf(u.cpf))]);
  for (const cpf of allCpfs) {
    if (!isValidCpf(cpf)) throw new Error(`Seed CPF invalid: ${cpf}`);
  }
  for (const u of USER_DEFS) {
    normalizePhoneDigits(u.phone);
  }

  const demoEmails = USER_DEFS.map((u) => u.email.toLowerCase());
  const existingPwRows = await db
    .select({ email: users.email, passwordHash: users.passwordHash })
    .from(users)
    .where(inArray(users.email, [...demoEmails, adminEmailLower]));

  const hashByEmail = new Map(
    existingPwRows.map((r) => [r.email.toLowerCase(), r.passwordHash] as const),
  );

  const adminHash = await stableHash(adminPassword, hashByEmail.get(adminEmailLower));
  const demoHashes = new Map<string, string>();
  for (const e of demoEmails) {
    demoHashes.set(e, await stableHash(DEMO_PASSWORD, hashByEmail.get(e)));
  }

  const [admin] = await db
    .insert(users)
    .values({
      name: "System Administrator",
      email: adminEmailLower,
      cpf: adminCpf,
      phone: normalizePhoneDigits("5500000000001"),
      passwordHash: adminHash,
      role: "SYSTEM_ADMIN",
      isActive: true,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        name: "System Administrator",
        cpf: adminCpf,
        phone: normalizePhoneDigits("5500000000001"),
        passwordHash: adminHash,
        role: "SYSTEM_ADMIN",
        isActive: true,
      },
    })
    .returning();

  if (!admin) throw new Error("Seed: admin user upsert failed");

  const companyByCnpj = new Map<string, (typeof COMPANY_DEFS)[number] & { id: string }>();

  for (const def of COMPANY_DEFS) {
    const [row] = await db
      .insert(companies)
      .values({
        name: def.name,
        cnpj: normalizeCnpj(def.cnpj),
        email: def.email,
        phone: normalizePhoneDigits(def.phone),
        isActive: true,
      })
      .onConflictDoUpdate({
        target: companies.cnpj,
        set: {
          name: def.name,
          email: def.email,
          phone: normalizePhoneDigits(def.phone),
          isActive: true,
        },
      })
      .returning();
    if (!row) throw new Error(`Seed: company upsert failed for ${def.cnpj}`);
    companyByCnpj.set(def.cnpj, { ...def, id: row.id });
  }

  const userByEmail = new Map<string, { id: string; email: string }>();

  for (const u of USER_DEFS) {
    const email = u.email.toLowerCase();
    const passwordHash = demoHashes.get(email);
    if (!passwordHash) throw new Error(`Seed: missing demo hash for ${email}`);

    const [row] = await db
      .insert(users)
      .values({
        name: u.name,
        email,
        cpf: normalizeCpf(u.cpf),
        phone: normalizePhoneDigits(u.phone),
        passwordHash,
        role: u.role,
        isActive: u.isActive !== false,
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          name: u.name,
          cpf: normalizeCpf(u.cpf),
          phone: normalizePhoneDigits(u.phone),
          passwordHash,
          role: u.role,
          isActive: u.isActive !== false,
        },
      })
      .returning();

    if (!row) throw new Error(`Seed: user upsert failed for ${email}`);
    userByEmail.set(email, { id: row.id, email });
  }

  for (const link of USER_COMPANY_LINKS) {
    const u = userByEmail.get(link.email.toLowerCase());
    const c = companyByCnpj.get(link.cnpj);
    if (!u || !c) throw new Error(`Seed: link references unknown user or company`);

    await db
      .insert(userCompanies)
      .values({ userId: u.id, companyId: c.id })
      .onConflictDoNothing({ target: [userCompanies.userId, userCompanies.companyId] });
  }

  console.log("Seed completed (idempotent):", {
    adminId: admin.id,
    companies: COMPANY_DEFS.length,
    companyIds: [...companyByCnpj.values()].map((c) => c.id),
    demoUsers: userByEmail.size,
    userCompanyLinks: USER_COMPANY_LINKS.length,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
