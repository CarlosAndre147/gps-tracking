import { and, count, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/lib/core/db";
import { auditLogs, companies, users } from "../../../drizzle/schema";
import { paginationMeta } from "@/lib/domain/pagination";

type ListParams = {
  skip: number;
  take: number;
  page: number;
  limit: number;
  action?: string;
  userId?: string;
  from?: string;
  to?: string;
};

export async function listAuditLogs(params: ListParams) {
  const filters = [];
  if (params.action?.trim()) {
    filters.push(eq(auditLogs.action, params.action.trim()));
  }
  if (params.userId?.trim()) {
    filters.push(eq(auditLogs.userId, params.userId.trim()));
  }
  if (params.from?.trim()) {
    const d = new Date(params.from.trim());
    if (!Number.isNaN(d.getTime())) filters.push(gte(auditLogs.createdAt, d));
  }
  if (params.to?.trim()) {
    const d = new Date(params.to.trim());
    if (!Number.isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999);
      filters.push(lte(auditLogs.createdAt, d));
    }
  }
  const whereClause = filters.length > 0 ? and(...filters) : undefined;

  const [countRow] = await db.select({ total: count() }).from(auditLogs).where(whereClause);
  const total = Number(countRow?.total ?? 0);

  const rows = await db
    .select({
      log: auditLogs,
      userName: users.name,
      userEmail: users.email,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(whereClause)
    .orderBy(desc(auditLogs.createdAt))
    .limit(params.take)
    .offset(params.skip);

  const userTargetIds = Array.from(
    new Set(
      rows
        .filter(({ log }) => log.targetType === "User" && typeof log.target === "string" && log.target.length > 0)
        .map(({ log }) => log.target as string),
    ),
  );
  const companyTargetIds = Array.from(
    new Set(
      rows
        .filter(({ log }) => log.targetType === "Company" && typeof log.target === "string" && log.target.length > 0)
        .map(({ log }) => log.target as string),
    ),
  );

  const targetUsers =
    userTargetIds.length === 0
      ? []
      : await db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(inArray(users.id, userTargetIds));

  const targetCompanies =
    companyTargetIds.length === 0
      ? []
      : await db
          .select({ id: companies.id, name: companies.name, cnpj: companies.cnpj })
          .from(companies)
          .where(inArray(companies.id, companyTargetIds));

  const targetUserMap = new Map(targetUsers.map((u) => [u.id, u] as const));
  const targetCompanyMap = new Map(targetCompanies.map((c) => [c.id, c] as const));

  return {
    items: rows.map(({ log: r, userName, userEmail }) => {
      const meta = r.metadata && typeof r.metadata === "object" ? (r.metadata as Record<string, unknown>) : null;
      const userTarget = r.targetType === "User" && r.target ? targetUserMap.get(r.target) : undefined;
      const companyTarget = r.targetType === "Company" && r.target ? targetCompanyMap.get(r.target) : undefined;
      const targetLabel =
        userTarget?.name ??
        companyTarget?.name ??
        (meta && typeof meta.targetLabel === "string" ? (meta.targetLabel as string) : null) ??
        null;
      const targetSubtitle =
        userTarget?.email ??
        companyTarget?.cnpj ??
        (meta && typeof meta.targetSubtitle === "string" ? (meta.targetSubtitle as string) : null) ??
        null;
      return {
        id: r.id,
        userId: r.userId,
        userName: userName ?? null,
        userEmail: userEmail ?? null,
        action: r.action,
        target: r.target,
        targetType: r.targetType,
        targetLabel,
        targetSubtitle,
        metadata: r.metadata ?? null,
        ip: r.ip ?? null,
        userAgent: r.userAgent ?? null,
        createdAt: r.createdAt.toISOString(),
      };
    }),
    meta: paginationMeta(params.page, params.limit, total),
  };
}
