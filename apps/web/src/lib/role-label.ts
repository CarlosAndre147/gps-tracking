export type FrontRole = "SYSTEM_ADMIN" | "COMPANY_ADMIN" | "USER";

export function roleLabelPtBr(role: string): string {
  if (role === "SYSTEM_ADMIN") return "Admin sistema";
  if (role === "COMPANY_ADMIN") return "Admin empresa";
  if (role === "USER") return "Usuário";
  return role;
}
