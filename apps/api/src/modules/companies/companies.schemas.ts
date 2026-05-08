import { t } from "elysia";
import { drizzleModels } from "../../../drizzle/models";

const companyInsert = drizzleModels.insert.company;
const userInsert = drizzleModels.insert.user;

export const listQuery = t.Object({
  search: t.Optional(t.String()),
  page: t.Optional(t.Numeric({ default: 1 })),
  limit: t.Optional(t.Numeric({ default: 20 })),
  sort: t.Optional(t.Union([t.Literal("name"), t.Literal("createdAt")])),
  dir: t.Optional(t.Union([t.Literal("asc"), t.Literal("desc")])),
  activeOnly: t.Optional(t.Union([t.Literal("true"), t.Literal("false")])),
});

export const membersListQuery = t.Object({
  search: t.Optional(t.String()),
  page: t.Optional(t.Numeric({ default: 1 })),
  limit: t.Optional(t.Numeric({ default: 20 })),
});

export const createCompanyBody = t.Object({
  name: companyInsert.properties.name,
  cnpj: companyInsert.properties.cnpj,
  email: companyInsert.properties.email,
  phone: companyInsert.properties.phone,
});

export const updateCompanyBody = t.Object({
  name: companyInsert.properties.name,
  email: companyInsert.properties.email,
  phone: companyInsert.properties.phone,
});

export const attachUserBody = t.Union([
  t.Object({
    mode: t.Literal("link"),
    userId: t.String({ minLength: 1 }),
  }),
  t.Object({
    mode: t.Literal("create"),
    user: t.Object({
      name: userInsert.properties.name,
      email: userInsert.properties.email,
      cpf: userInsert.properties.cpf,
      phone: userInsert.properties.phone,
      password: t.String({ minLength: 8 }),
      role: t.Union([t.Literal("COMPANY_ADMIN"), t.Literal("USER")]),
    }),
  }),
]);
