/** Labels em pt-BR para códigos de ação de auditoria (lista completa + fallback). */
export const AUDIT_ACTION_LABELS = {
  LOGIN: "Login",
  LOGOUT: "Logout",
  LOGIN_FAILED: "Falha de login",
  LOGIN_BLOCKED: "Login bloqueado",
  USER_CREATED: "Usuário criado",
  USER_UPDATED: "Usuário atualizado",
  USER_ACTIVATED: "Usuário ativado",
  USER_DEACTIVATED: "Usuário desativado",
  PASSWORD_CHANGED: "Senha alterada",
  COMPANY_CREATED: "Empresa criada",
  COMPANY_UPDATED: "Empresa atualizada",
  COMPANY_DEACTIVATED: "Empresa desativada",
  COMPANY_USER_LINKED: "Usuário vinculado à empresa",
  COMPANY_USER_UNLINKED: "Usuário desvinculado da empresa",
} as const;

export function formatAuditAction(action: string): string {
  return (AUDIT_ACTION_LABELS as Record<string, string>)[action] ?? action;
}

/** Estilo para dashboard e linhas compactas (dot + texto). */
export type AuditActionVisual = {
  label: string;
  dotClass: string;
  textClass: string;
};

export function getAuditActionVisual(action: string): AuditActionVisual {
  const preset = AUDIT_ACTION_VISUAL[action];
  if (preset) return preset;
  return {
    label: formatAuditAction(action),
    dotClass: "bg-zinc-400",
    textClass: "text-text-secondary",
  };
}

const AUDIT_ACTION_VISUAL: Record<string, AuditActionVisual> = {
  LOGIN: {
    label: AUDIT_ACTION_LABELS.LOGIN,
    dotClass: "bg-zinc-500",
    textClass: "text-zinc-500 dark:text-zinc-400",
  },
  LOGOUT: {
    label: AUDIT_ACTION_LABELS.LOGOUT,
    dotClass: "bg-zinc-400",
    textClass: "text-zinc-400 dark:text-zinc-500",
  },
  LOGIN_FAILED: {
    label: AUDIT_ACTION_LABELS.LOGIN_FAILED,
    dotClass: "bg-orange-500",
    textClass: "text-orange-600 dark:text-orange-400",
  },
  LOGIN_BLOCKED: {
    label: AUDIT_ACTION_LABELS.LOGIN_BLOCKED,
    dotClass: "bg-red-500",
    textClass: "text-red-600 dark:text-red-400",
  },
  USER_CREATED: {
    label: AUDIT_ACTION_LABELS.USER_CREATED,
    dotClass: "bg-blue-600",
    textClass: "text-blue-600 dark:text-blue-400",
  },
  USER_UPDATED: {
    label: AUDIT_ACTION_LABELS.USER_UPDATED,
    dotClass: "bg-blue-500",
    textClass: "text-blue-500 dark:text-blue-300",
  },
  USER_ACTIVATED: {
    label: AUDIT_ACTION_LABELS.USER_ACTIVATED,
    dotClass: "bg-emerald-500",
    textClass: "text-emerald-600 dark:text-emerald-400",
  },
  USER_DEACTIVATED: {
    label: AUDIT_ACTION_LABELS.USER_DEACTIVATED,
    dotClass: "bg-red-500",
    textClass: "text-red-500 dark:text-red-400",
  },
  PASSWORD_CHANGED: {
    label: AUDIT_ACTION_LABELS.PASSWORD_CHANGED,
    dotClass: "bg-amber-500",
    textClass: "text-amber-600 dark:text-amber-400",
  },
  COMPANY_CREATED: {
    label: AUDIT_ACTION_LABELS.COMPANY_CREATED,
    dotClass: "bg-violet-600",
    textClass: "text-violet-600 dark:text-violet-400",
  },
  COMPANY_UPDATED: {
    label: AUDIT_ACTION_LABELS.COMPANY_UPDATED,
    dotClass: "bg-violet-500",
    textClass: "text-violet-500 dark:text-violet-300",
  },
  COMPANY_DEACTIVATED: {
    label: AUDIT_ACTION_LABELS.COMPANY_DEACTIVATED,
    dotClass: "bg-red-500",
    textClass: "text-red-500 dark:text-red-400",
  },
  COMPANY_USER_LINKED: {
    label: AUDIT_ACTION_LABELS.COMPANY_USER_LINKED,
    dotClass: "bg-teal-500",
    textClass: "text-teal-600 dark:text-teal-400",
  },
  COMPANY_USER_UNLINKED: {
    label: AUDIT_ACTION_LABELS.COMPANY_USER_UNLINKED,
    dotClass: "bg-slate-500",
    textClass: "text-slate-600 dark:text-slate-400",
  },
};
