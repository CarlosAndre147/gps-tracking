export function roleBadgeClass(role: string): string {
  if (role === "SYSTEM_ADMIN") return "bg-brand-secondary/20 text-brand-secondary";
  if (role === "COMPANY_ADMIN") return "bg-feedback-success/20 text-feedback-success";
  return "bg-layout-border/80 text-text-secondary";
}

export function formatLastAccess(lastSeenAt: string | null): string {
  if (!lastSeenAt) return "Nunca acessou";
  return new Date(lastSeenAt).toLocaleString("pt-BR");
}
