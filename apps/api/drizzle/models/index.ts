import { t } from "elysia";
import { createInsertSchema, createSelectSchema } from "drizzle-typebox";
import { toSchemas } from "../utils";
import { users, companies, locations, trackingSessions, roleEnum } from "../schema";
import { registerBrazilianDocumentFormats } from "../../src/lib/utils/br-documents";

registerBrazilianDocumentFormats();

const roleLiterals = roleEnum.enumValues.map((role) => t.Literal(role));
const roleSchema = t.Union(
  roleLiterals as [typeof roleLiterals[number], ...Array<typeof roleLiterals[number]>],
);

/**
 * TypeBox models derivados do schema Drizzle. Os overrides documentam
 * regras de domínio (mín/máx, formato e1-mail, role válida) e são reutilizados
 * pelos handlers Elysia via destructuring — eliminando a duplicação de schemas.
 *
 * Padrão recomendado pela doc oficial Elysia + Drizzle:
 * https://elysiajs.com/integrations/drizzle.html
 */
const _insertUser = createInsertSchema(users, {
  name: t.String({ minLength: 1 }),
  email: t.String({ format: "email", minLength: 3 }),
  cpf: t.String({ format: "cpf" }),
  phone: t.String({ minLength: 8, maxLength: 20 }),
  role: roleSchema,
});

const _insertCompany = createInsertSchema(companies, {
  name: t.String({ minLength: 1 }),
  cnpj: t.String({ format: "cnpj" }),
  email: t.String({ format: "email", minLength: 3 }),
  phone: t.String({ minLength: 8, maxLength: 20 }),
});

const _insertLocation = createInsertSchema(locations, {
  lat: t.Number({ minimum: -90, maximum: 90 }),
  lng: t.Number({ minimum: -180, maximum: 180 }),
});

const _insertTrackingSession = createInsertSchema(trackingSessions);

export const drizzleModels = {
  insert: toSchemas(
    {
      user: _insertUser,
      company: _insertCompany,
      location: _insertLocation,
      trackingSession: _insertTrackingSession,
    },
    "insert",
  ),

  select: toSchemas(
    {
      user: createSelectSchema(users),
      company: createSelectSchema(companies),
      location: createSelectSchema(locations),
      trackingSession: createSelectSchema(trackingSessions),
    },
    "select",
  ),
} as const;
