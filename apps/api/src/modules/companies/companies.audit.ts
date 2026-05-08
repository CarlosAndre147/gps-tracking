import { createAuditLog } from "@/lib/domain/audit";
import { getClientIp } from "@/lib/domain/client-ip";

type AuditRequest = Request;

function companyMeta(company: { name: string; cnpj: string }) {
  return {
    targetLabel: company.name,
    targetSubtitle: company.cnpj,
  };
}

export async function logCompanyEvent(
  action: "COMPANY_CREATED" | "COMPANY_UPDATED" | "COMPANY_DEACTIVATED" | "COMPANY_ACTIVATED",
  actorUserId: string,
  company: { id: string; name: string; cnpj: string },
  request: AuditRequest,
) {
  await createAuditLog({
    userId: actorUserId,
    action,
    target: company.id,
    targetType: "Company",
    metadata: companyMeta(company),
    ip: getClientIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  });
}
