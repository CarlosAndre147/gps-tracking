import { t } from "elysia";
import type { TString } from "@sinclair/typebox";
import { drizzleModels } from "../../../drizzle/models";

const userInsert = drizzleModels.insert.user;
const userName = userInsert.properties.name as TString;
const userEmail = userInsert.properties.email as TString;
const userCpf = userInsert.properties.cpf as TString;
const userPhone = userInsert.properties.phone as TString;

export const registerBody = t.Object({
  name: userName,
  email: userEmail,
  cpf: userCpf,
  phone: userPhone,
  password: t.String({ minLength: 8 }),
  role: t.Union([t.Literal("COMPANY_ADMIN"), t.Literal("USER")]),
});

export const loginBody = t.Object({
  email: t.String({ minLength: 3 }),
  password: t.String({ minLength: 1 }),
});

export const refreshBody = t.Object({
  refreshToken: t.String({ minLength: 10 }),
});

export const logoutBody = t.Object({
  refreshToken: t.String({ minLength: 10 }),
});

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const BCRYPT_ROUNDS = 12;
