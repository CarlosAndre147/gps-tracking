import { apiBaseUrl } from "@/lib/env";
import { authFetch } from "@/lib/auth-fetch";
import { isApiError, unwrapData, unwrapPaginated } from "@/lib/api-result";

/** Rota com hífen / path não inferido pelo Eden de forma estável no cliente. */
export async function fetchMyCompanyUsers(companyId?: string): Promise<
  {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
    isActive: boolean;
    lastSeenAt: string | null;
    trackingActive: boolean;
    companies: { id: string; name: string; cnpj: string }[];
    lastLocation: {
      lat: number;
      lng: number;
      accuracy: number | null;
      timestamp: number;
      isActive: boolean;
    } | null;
  }[]
> {
  const q = new URLSearchParams();
  if (companyId?.trim()) q.set("companyId", companyId.trim());
  const qs = q.size > 0 ? `?${q}` : "";
  const res = await authFetch(`${apiBaseUrl()}/my-companies/users${qs}`);
  const body: unknown = await res.json();
  if (!res.ok || isApiError(body)) {
    throw new Error(isApiError(body) ? body.error.message : "Falha ao listar usuários da empresa");
  }
  return unwrapData(body);
}

export type CompanyUserTrackingHistoryRow = {
  id: string;
  startedAt: string;
  stoppedAt: string | null;
  durationMs: number | null;
  source: string;
};

export async function fetchMyCompanyUserTrackingHistory(
  userId: string,
  opts?: { page?: number; limit?: number; companyId?: string },
): Promise<{
  items: CompanyUserTrackingHistoryRow[];
  meta: { page: number; limit: number; total: number };
}> {
  const q = new URLSearchParams();
  q.set("page", String(opts?.page ?? 1));
  q.set("limit", String(opts?.limit ?? 10));
  if (opts?.companyId?.trim()) q.set("companyId", opts.companyId.trim());
  const res = await authFetch(`${apiBaseUrl()}/my-companies/users/${userId}/tracking-history?${q}`);
  const body: unknown = await res.json();
  if (!res.ok || isApiError(body)) {
    throw new Error(isApiError(body) ? body.error.message : "Falha ao listar histórico de rastreamento");
  }
  return unwrapPaginated<CompanyUserTrackingHistoryRow>(body);
}

export type AuditRow = {
  id: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  action: string;
  target: string | null;
  targetType: string | null;
  targetLabel: string | null;
  targetSubtitle: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

export async function fetchAuditLogs(opts: {
  page: number;
  limit: number;
  action?: string;
  userId?: string;
  from?: string;
  to?: string;
}): Promise<{
  items: AuditRow[];
  meta: { page: number; limit: number; total: number };
}> {
  const q = new URLSearchParams({
    page: String(opts.page),
    limit: String(opts.limit),
  });
  if (opts.action?.trim()) q.set("action", opts.action.trim());
  if (opts.userId?.trim()) q.set("userId", opts.userId.trim());
  if (opts.from?.trim()) q.set("from", opts.from.trim());
  if (opts.to?.trim()) q.set("to", opts.to.trim());
  const res = await authFetch(`${apiBaseUrl()}/audit-logs?${q}`);
  const body: unknown = await res.json();
  if (!res.ok || isApiError(body)) {
    throw new Error(isApiError(body) ? body.error.message : "Falha ao listar auditoria");
  }
  return unwrapPaginated<AuditRow>(body);
}

export async function fetchCompaniesOptions(): Promise<{ id: string; name: string; isActive: boolean }[]> {
  const q = new URLSearchParams({
    page: "1",
    limit: "100",
    sort: "name",
    dir: "asc",
  });
  const res = await authFetch(`${apiBaseUrl()}/companies?${q}`);
  const body: unknown = await res.json();
  if (!res.ok || isApiError(body)) {
    throw new Error(isApiError(body) ? body.error.message : "Falha ao listar empresas");
  }
  const { items } = unwrapPaginated<{ id: string; name: string; isActive: boolean }>(body);
  return items.filter((c) => c.isActive);
}

export async function linkUserToCompany(companyId: string, userId: string): Promise<void> {
  const res = await authFetch(`${apiBaseUrl()}/companies/${companyId}/users`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "link", userId }),
  });
  const body: unknown = await res.json();
  if (!res.ok || isApiError(body)) {
    throw new Error(isApiError(body) ? body.error.message : "Falha ao vincular empresa");
  }
}

export async function unlinkUserFromCompany(companyId: string, userId: string): Promise<void> {
  const res = await authFetch(`${apiBaseUrl()}/companies/${companyId}/users/${userId}`, {
    method: "DELETE",
  });
  const body: unknown = await res.json();
  if (!res.ok || isApiError(body)) {
    throw new Error(isApiError(body) ? body.error.message : "Falha ao remover vínculo");
  }
}
