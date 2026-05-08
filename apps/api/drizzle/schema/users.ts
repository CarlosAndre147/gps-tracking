import { randomUUID } from "node:crypto";
import { pgEnum, pgTable, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("Role", ["SYSTEM_ADMIN", "COMPANY_ADMIN", "USER"]);

export const users = pgTable("User", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  cpf: text("cpf").notNull().unique(),
  phone: text("phone").notNull(),
  passwordHash: text("passwordHash").notNull(),
  role: roleEnum("role").notNull().default("USER"),
  isActive: boolean("isActive").notNull().default(true),
  lastSeenAt: timestamp("lastSeenAt", { precision: 3, mode: "date" }),
  createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 3, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const refreshTokens = pgTable("RefreshToken", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenDigest: text("tokenDigest").notNull().unique(),
  expiresAt: timestamp("expiresAt", { precision: 3, mode: "date" }).notNull(),
  usedAt: timestamp("usedAt", { precision: 3, mode: "date" }),
  revokedAt: timestamp("revokedAt", { precision: 3, mode: "date" }),
  userAgent: text("userAgent"),
  ip: text("ip"),
  createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).notNull().defaultNow(),
});

export const auditLogs = pgTable("AuditLog", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("userId").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  target: text("target"),
  targetType: text("targetType"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  ip: text("ip"),
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).notNull().defaultNow(),
});
