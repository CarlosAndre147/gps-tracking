import { timingSafeEqual } from "node:crypto";
import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { getEnv } from "@/config/env";

function timingSafeEqualUtf8(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

function isDocsPath(pathname: string): boolean {
  return pathname === "/docs" || pathname.startsWith("/docs/");
}

/**
 * Scalar API docs em `/docs` com HTTP Basic Auth (SCALAR_USER / SCALAR_PASSWORD).
 *
 * Sempre montado para manter o tipo do app determinístico (necessário para Eden Treaty
 * inferir o cliente sem unions). Em produção ou sem credenciais configuradas, o plugin
 * funciona como no-op — não registra a UI nem aceita requests em `/docs`.
 */
export function scalarPlugin() {
  const env = getEnv();
  const scalarUser = env.SCALAR_USER;
  const scalarPassword = env.SCALAR_PASSWORD;
  const enabled = env.NODE_ENV !== "production" && !!scalarUser && !!scalarPassword;

  const plugin = new Elysia({ name: "scalar-docs" });
  if (!enabled || !scalarUser || !scalarPassword) {
    return plugin;
  }
  const expectedUser = scalarUser;
  const expectedPassword = scalarPassword;

  return plugin
    .onBeforeHandle(({ request, set }) => {
      const pathname = new URL(request.url).pathname;
      if (!isDocsPath(pathname)) {
        return;
      }

      const header = request.headers.get("authorization");
      if (!header?.startsWith("Basic ")) {
        set.status = 401;
        set.headers["WWW-Authenticate"] = 'Basic realm="API Docs"';
        return "Unauthorized";
      }

      let decoded: string;
      try {
        decoded = Buffer.from(header.slice("Basic ".length).trim(), "base64").toString("utf8");
      } catch {
        set.status = 401;
        set.headers["WWW-Authenticate"] = 'Basic realm="API Docs"';
        return "Unauthorized";
      }

      const colon = decoded.indexOf(":");
      if (colon === -1) {
        set.status = 401;
        set.headers["WWW-Authenticate"] = 'Basic realm="API Docs"';
        return "Unauthorized";
      }

      const user = decoded.slice(0, colon);
      const password = decoded.slice(colon + 1);

      const userOk = timingSafeEqualUtf8(user, expectedUser);
      const passOk = timingSafeEqualUtf8(password, expectedPassword);
      if (!userOk || !passOk) {
        set.status = 401;
        set.headers["WWW-Authenticate"] = 'Basic realm="API Docs"';
        return "Unauthorized";
      }
    })
    .use(
      swagger({
        provider: "scalar",
        path: "/docs",
        documentation: {
          info: { title: "GPS Tracker API", version: "1.0.0" },
          tags: [
            { name: "Health", description: "Service health checks" },
            { name: "Auth", description: "Authentication and sessions" },
          ],
          components: {
            securitySchemes: {
              bearerAuth: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "JWT",
              },
            },
          },
          security: [{ bearerAuth: [] }],
        },
      }),
    );
}
