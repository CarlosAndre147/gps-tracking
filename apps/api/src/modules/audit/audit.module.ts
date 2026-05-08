import { Elysia } from "elysia";
import { ok } from "@/lib/core/response";
import { parsePagination } from "@/lib/domain/pagination";
import { accessJwtPlugin } from "@/plugins/access-jwt.plugin";
import { authMacroPlugin } from "@/macros/auth.macro";
import { listAuditLogsQuery, systemAdminOnly } from "./model";
import { listAuditLogs } from "./service";

export const auditModule = new Elysia({ name: "audit-module" })
  .use(accessJwtPlugin())
  .use(authMacroPlugin())
  .get(
    "/audit-logs",
      async ({ query }) => {
        const { skip, take, page, limit } = parsePagination({
          page: Number(query.page),
          limit: Number(query.limit),
        });
        const result = await listAuditLogs({
          skip,
          take,
          page,
          limit,
          action: query.action,
          userId: query.userId,
          from: query.from,
          to: query.to,
        });
        return ok(result.items, result.meta);
      },
    { query: listAuditLogsQuery, ...systemAdminOnly },
  );
