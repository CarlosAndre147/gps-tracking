import { Elysia } from "elysia";
import { ok } from "@/lib/core/response";
import { accessJwtPlugin } from "@/plugins/access-jwt.plugin";
import { authMacroPlugin } from "@/macros/auth.macro";
import { systemAdminOnly } from "./model";
import { loadDashboardStats } from "./service";

export const dashboardModule = new Elysia({ name: "dashboard-module" })
  .use(accessJwtPlugin())
  .use(authMacroPlugin())
  .get(
    "/dashboard/stats",
    async () => {
      return ok(await loadDashboardStats());
    },
    { ...systemAdminOnly },
  );
