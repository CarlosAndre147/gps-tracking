import { normalizeCnpj, normalizeCpf } from "@/lib/br-documents";
import type { CreateUserForm } from "./users-page.schemas";

export function mapCreateUserPayload(data: CreateUserForm) {
  return {
    name: data.name.trim(),
    email: data.email.trim().toLowerCase(),
    cpf: normalizeCpf(data.cpf),
    phone: data.phone.replace(/\D/g, ""),
    password: data.password,
    role: data.role,
    company:
      data.companyMode === "link"
        ? { mode: "link" as const, companyIds: data.companyIds }
        : data.companyMode === "create"
          ? {
              mode: "create" as const,
              company: {
                name: data.companyName!.trim(),
                cnpj: normalizeCnpj(data.companyCnpj!),
                email: data.companyEmail!.trim().toLowerCase(),
                phone: data.companyPhone!.replace(/\D/g, ""),
              },
            }
          : undefined,
  };
}
