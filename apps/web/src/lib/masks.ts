import { normalizeCnpj, normalizeCpf } from "./br-documents";

/** `00.000.000/0000-00` enquanto digita. */
export function maskCnpjInput(raw: string): string {
  const d = normalizeCnpj(raw).slice(0, 14);
  const parts: string[] = [];
  if (d.length > 0) parts.push(d.slice(0, 2));
  if (d.length > 2) parts.push(d.slice(2, 5));
  if (d.length > 5) parts.push(d.slice(5, 8));
  if (d.length > 8) parts.push(d.slice(8, 12));
  if (d.length > 12) parts.push(d.slice(12, 14));
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts[0]}.${parts[1]}.${parts[2]}/${parts[3]}-${parts[4] ?? ""}`;
}

/** `000.000.000-00` enquanto digita. */
export function maskCpfInput(raw: string): string {
  const d = normalizeCpf(raw).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Telefone BR simples: (00) 00000-0000 */
export function maskPhoneBrInput(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Exibe CNPJ armazenado só com dígitos. */
export function formatCnpjDisplay(cnpj: string): string {
  return maskCnpjInput(normalizeCnpj(cnpj));
}

/** Exibe telefone armazenado (apenas dígitos). */
export function formatPhoneDisplay(phone: string): string {
  return maskPhoneBrInput(phone.replace(/\D/g, ""));
}

/** Listagem: `***.***.***-XX` (últimos 2 dígitos do CPF). */
export function maskCpfForList(cpf: string): string {
  const d = normalizeCpf(cpf);
  if (d.length !== 11) return cpf || "—";
  const last2 = d.slice(9, 11);
  return `***.***.***-${last2}`;
}
