import { t } from "elysia";
import { drizzleModels } from "../../../drizzle/models";

const userInsert = drizzleModels.insert.user;
const companyInsert = drizzleModels.insert.company;

export const listUsersQuery = t.Object({
  search: t.Optional(t.String()),
  role: t.Optional(t.Union([t.Literal("SYSTEM_ADMIN"), t.Literal("COMPANY_ADMIN"), t.Literal("USER")])),
  companyId: t.Optional(t.String()),
  isActive: t.Optional(t.Union([t.Literal("true"), t.Literal("false")])),
  sortBy: t.Optional(t.Union([t.Literal("name"), t.Literal("lastSeenAt")])),
  sortDir: t.Optional(t.Union([t.Literal("asc"), t.Literal("desc")])),
  page: t.Optional(t.Numeric({ default: 1 })),
  limit: t.Optional(t.Numeric({ default: 20 })),
});

export const createUserBody = t.Object({
  name: userInsert.properties.name,
  email: userInsert.properties.email,
  cpf: userInsert.properties.cpf,
  phone: userInsert.properties.phone,
  password: t.String({ minLength: 8 }),
  role: t.Union([t.Literal("COMPANY_ADMIN"), t.Literal("USER")]),
  company: t.Optional(
    t.Union([
      t.Object({
        mode: t.Literal("link"),
        companyIds: t.Array(t.String({ minLength: 1 }), { minItems: 1 }),
      }),
      t.Object({
        mode: t.Literal("create"),
        company: t.Object({
          name: companyInsert.properties.name,
          cnpj: companyInsert.properties.cnpj,
          email: companyInsert.properties.email,
          phone: companyInsert.properties.phone,
        }),
      }),
    ]),
  ),
});

export const updateUserBody = t.Object({
  name: t.String({ minLength: 1 }),
  email: t.String({ minLength: 3 }),
  cpf: t.String({ minLength: 11, maxLength: 14 }),
  phone: t.String({ minLength: 8, maxLength: 20 }),
});

export const changePasswordBody = t.Object({
  currentPassword: t.Optional(t.String({ minLength: 1 })),
  newPassword: t.String({ minLength: 8 }),
});

export const myCompanyUsersQuery = t.Object({
  companyId: t.Optional(t.String()),
});

export const myCompanyUserTrackingHistoryQuery = t.Object({
  companyId: t.Optional(t.String()),
  page: t.Optional(t.Numeric({ default: 1 })),
  limit: t.Optional(t.Numeric({ default: 10 })),
});
