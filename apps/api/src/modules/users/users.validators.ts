import { isValidCnpj, isValidCpf, normalizeCnpj, normalizeCpf } from "@/lib/utils/br-documents";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeAndValidateEmail(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  return EMAIL_RE.test(normalized) ? normalized : null;
}

export function normalizeAndValidateCpf(cpf: string): string | null {
  const normalized = normalizeCpf(cpf);
  return isValidCpf(normalized) ? normalized : null;
}

export function normalizeAndValidateCnpj(cnpj: string): string | null {
  const normalized = normalizeCnpj(cnpj);
  return isValidCnpj(normalized) ? normalized : null;
}
