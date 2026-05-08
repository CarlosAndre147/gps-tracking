import { TypeSystem } from "@sinclair/typebox/system";

/** Brazilian CPF (11 digits) validation with check digits. */
export function isValidCpf(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(digits[i]) * (10 - i);
  }
  let mod = (sum * 10) % 11;
  if (mod === 10) mod = 0;
  if (mod !== Number(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += Number(digits[i]) * (11 - i);
  }
  mod = (sum * 10) % 11;
  if (mod === 10) mod = 0;
  return mod === Number(digits[10]);
}

/** Brazilian CNPJ (14 digits) validation with check digits. */
export function isValidCnpj(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(digits[i]) * weights1[i];
  }
  let mod = sum % 11;
  const d1 = mod < 2 ? 0 : 11 - mod;
  if (d1 !== Number(digits[12])) return false;

  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += Number(digits[i]) * weights2[i];
  }
  mod = sum % 11;
  const d2 = mod < 2 ? 0 : 11 - mod;
  return d2 === Number(digits[13]);
}

export function normalizeCpf(cpf: string): string {
  return cpf.replace(/\D/g, "");
}

export function normalizeCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, "");
}

let formatsRegistered = false;

export function registerBrazilianDocumentFormats(): void {
  if (formatsRegistered) return;

  TypeSystem.Format("cpf", (value) => {
    if (typeof value !== "string") return false;
    return isValidCpf(value);
  });

  TypeSystem.Format("cnpj", (value) => {
    if (typeof value !== "string") return false;
    return isValidCnpj(value);
  });

  formatsRegistered = true;
}
