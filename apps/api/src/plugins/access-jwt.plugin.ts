import { jwt } from "@elysiajs/jwt";
import { t } from "elysia";
import { getEnv } from "@/config/env";

const accessRoleSchema = t.Union([
  t.Literal("SYSTEM_ADMIN"),
  t.Literal("COMPANY_ADMIN"),
  t.Literal("USER"),
]);

export function accessJwtPlugin() {
  return jwt({
    name: "accessJwt",
    secret: getEnv().JWT_SECRET,
    exp: "15m",
    schema: t.Object({
      role: accessRoleSchema,
    }),
  });
}
