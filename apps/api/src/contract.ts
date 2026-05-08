import { Elysia, t } from "elysia";

/**
 * Contrato type-level para Eden Treaty nos clientes (web/mobile).
 * Mantém os endpoints reais; não acoplar inferência ao runtime dos módulos (`@ts-nocheck` nos handlers).
 */
export function buildContractApp() {
  return new Elysia()
    .get("/health", () => ({ success: true }))
    .group("/auth", (g) =>
      g
        .post(
          "/register",
          () => ({ success: true }),
          {
            body: t.Object({
              name: t.String(),
              email: t.String(),
              cpf: t.String(),
              phone: t.String(),
              password: t.String({ minLength: 8 }),
              role: t.Union([t.Literal("COMPANY_ADMIN"), t.Literal("USER")]),
            }),
          },
        )
        .post(
          "/login",
          () => ({ success: true }),
          {
            body: t.Object({
              email: t.String(),
              password: t.String(),
            }),
          },
        )
        .post(
          "/refresh",
          () => ({ success: true }),
          {
            body: t.Object({
              refreshToken: t.String(),
            }),
          },
        )
        .post(
          "/logout",
          () => ({ success: true }),
          {
            body: t.Object({
              refreshToken: t.String(),
            }),
          },
        )
        .get("/me", () => ({ success: true })),
    )
    .group("", (g) =>
      g
        .get(
          "/companies",
          () => ({ success: true }),
          {
            query: t.Object({
              page: t.Optional(t.Numeric()),
              limit: t.Optional(t.Numeric()),
              search: t.Optional(t.String()),
              sort: t.Optional(t.String()),
              dir: t.Optional(t.String()),
              activeOnly: t.Optional(t.String()),
            }),
          },
        )
        .post(
          "/companies",
          () => ({ success: true }),
          {
            body: t.Object({
              name: t.String(),
              cnpj: t.String(),
              email: t.String(),
              phone: t.String(),
            }),
          },
        )
        .group("/companies/:id", (cg) =>
          cg
            .get("", () => ({ success: true }), { params: t.Object({ id: t.String() }) })
            .put(
              "",
              () => ({ success: true }),
              {
                params: t.Object({ id: t.String() }),
                body: t.Object({
                  name: t.String(),
                  email: t.String(),
                  phone: t.String(),
                }),
              },
            )
            .delete("", () => ({ success: true }), { params: t.Object({ id: t.String() }) })
            .patch("/activate", () => ({ success: true }), { params: t.Object({ id: t.String() }) })
            .get(
              "/users",
              () => ({ success: true }),
              {
                params: t.Object({ id: t.String() }),
                query: t.Object({
                  page: t.Optional(t.Numeric()),
                  limit: t.Optional(t.Numeric()),
                  search: t.Optional(t.String()),
                }),
              },
            )
            .post(
              "/users",
              () => ({ success: true }),
              {
                params: t.Object({ id: t.String() }),
                body: t.Union([
                  t.Object({
                    mode: t.Literal("link"),
                    userId: t.String(),
                  }),
                  t.Object({
                    mode: t.Literal("create"),
                    user: t.Object({
                      name: t.String(),
                      email: t.String(),
                      cpf: t.String(),
                      phone: t.String(),
                      password: t.String(),
                      role: t.Union([t.Literal("COMPANY_ADMIN"), t.Literal("USER")]),
                    }),
                  }),
                ]),
              },
            )
            .delete(
              "/users/:userId",
              () => ({ success: true }),
              {
                params: t.Object({ id: t.String(), userId: t.String() }),
              },
            ),
        )
        .get(
          "/my-companies/users",
          () => ({ success: true }),
          {
            query: t.Object({
              companyId: t.Optional(t.String()),
            }),
          },
        )
        .get(
          "/users",
          () => ({ success: true }),
          {
            query: t.Object({
              page: t.Optional(t.Numeric()),
              limit: t.Optional(t.Numeric()),
              search: t.Optional(t.String()),
              role: t.Optional(
                t.Union([t.Literal("SYSTEM_ADMIN"), t.Literal("COMPANY_ADMIN"), t.Literal("USER")]),
              ),
              companyId: t.Optional(t.String()),
              isActive: t.Optional(t.Union([t.Literal("true"), t.Literal("false")])),
              sortBy: t.Optional(t.Union([t.Literal("name"), t.Literal("lastSeenAt")])),
              sortDir: t.Optional(t.Union([t.Literal("asc"), t.Literal("desc")])),
            }),
          },
        )
        .post(
          "/users",
          () => ({ success: true }),
          {
            body: t.Object({
              name: t.String(),
              email: t.String(),
              cpf: t.String(),
              phone: t.String(),
              password: t.String(),
              role: t.Union([t.Literal("COMPANY_ADMIN"), t.Literal("USER")]),
              company: t.Optional(
                t.Union([
                  t.Object({
                    mode: t.Literal("link"),
                    companyIds: t.Array(t.String(), { minItems: 1 }),
                  }),
                  t.Object({
                    mode: t.Literal("create"),
                    company: t.Object({
                      name: t.String(),
                      cnpj: t.String(),
                      email: t.String(),
                      phone: t.String(),
                    }),
                  }),
                ]),
              ),
            }),
          },
        )
        .get("/users/:id", () => ({ success: true }), { params: t.Object({ id: t.String() }) })
        .put(
          "/users/:id",
          () => ({ success: true }),
          {
            params: t.Object({ id: t.String() }),
            body: t.Object({
              name: t.String(),
              email: t.String(),
              phone: t.String(),
            }),
          },
        )
        .patch(
          "/users/:id/password",
          () => ({ success: true }),
          {
            params: t.Object({ id: t.String() }),
            body: t.Object({
              currentPassword: t.Optional(t.String()),
              newPassword: t.String({ minLength: 8 }),
            }),
          },
        )
        .patch(
          "/users/:id/activate",
          () => ({ success: true }),
          { params: t.Object({ id: t.String() }) },
        )
        .delete("/users/:id", () => ({ success: true }), { params: t.Object({ id: t.String() }) })
        .get(
          "/audit-logs",
          () => ({ success: true }),
          {
            query: t.Object({
              page: t.Optional(t.Numeric()),
              limit: t.Optional(t.Numeric()),
              action: t.Optional(t.String()),
              userId: t.Optional(t.String()),
              from: t.Optional(t.String()),
              to: t.Optional(t.String()),
            }),
          },
        )
        .get("/dashboard/stats", () => ({ success: true }))
        .group("/tracking", (tg) =>
          tg
            .post(
              "/start",
              () => ({ success: true }),
              { body: t.Object({ companyId: t.Optional(t.String()) }) },
            )
            .post("/stop", () => ({ success: true }))
            .get("/session-status", () => ({ success: true as const, data: { active: false, sessionId: null as string | null } }))
            .post(
              "/location",
              () => ({ success: true }),
              {
                body: t.Object({
                  lat: t.Number(),
                  lng: t.Number(),
                  accuracy: t.Optional(t.Number()),
                  speed: t.Optional(t.Number()),
                  heading: t.Optional(t.Number()),
                  altitude: t.Optional(t.Number()),
                }),
              },
            )
            .get(
              "/history",
              () => ({ success: true }),
              {
                query: t.Object({
                  page: t.Optional(t.Numeric()),
                  limit: t.Optional(t.Numeric()),
                }),
              },
            )
            .get("/active-users", () => ({ success: true })),
        ),
    );
}

export type App = ReturnType<typeof buildContractApp>;
