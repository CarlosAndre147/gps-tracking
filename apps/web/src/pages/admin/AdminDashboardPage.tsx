import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { isApiError, unwrapData } from "@/lib/api-result";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth.store";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Activity, ArrowUpRight, Building2, Satellite, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

type DashboardStatsPayload = {
  stats: {
    companies: number;
    users: number;
    activeTracking: number;
    todaySessions: number;
  };
  recentActivity: Array<{
    id: string;
    action: string;
    targetType: string | null;
    createdAt: string;
    user: { name: string; email: string | null } | null;
  }>;
};

type ActionVisual = { label: string; dotClass: string; textClass: string };

const actionConfig: Record<string, ActionVisual> = {
  LOGIN: {
    label: "Login",
    dotClass: "bg-zinc-400",
    textClass: "text-zinc-500 dark:text-zinc-400",
  },
  LOGOUT: {
    label: "Logout",
    dotClass: "bg-zinc-300",
    textClass: "text-zinc-400",
  },
  USER_CREATED: {
    label: "Usuário criado",
    dotClass: "bg-blue-500",
    textClass: "text-blue-600 dark:text-blue-400",
  },
  USER_UPDATED: {
    label: "Usuário editado",
    dotClass: "bg-blue-400",
    textClass: "text-blue-500 dark:text-blue-300",
  },
  USER_DEACTIVATED: {
    label: "Usuário desativado",
    dotClass: "bg-red-500",
    textClass: "text-red-600 dark:text-red-400",
  },
  PASSWORD_CHANGED: {
    label: "Senha alterada",
    dotClass: "bg-amber-400",
    textClass: "text-amber-600 dark:text-amber-400",
  },
  COMPANY_CREATED: {
    label: "Empresa criada",
    dotClass: "bg-violet-500",
    textClass: "text-violet-600 dark:text-violet-400",
  },
  COMPANY_UPDATED: {
    label: "Empresa editada",
    dotClass: "bg-violet-400",
    textClass: "text-violet-500 dark:text-violet-300",
  },
  COMPANY_DEACTIVATED: {
    label: "Empresa desativada",
    dotClass: "bg-red-500",
    textClass: "text-red-600 dark:text-red-400",
  },
};

function StatCard({
  label,
  value,
  icon: Icon,
  isLoading,
  href,
  highlight,
}: {
  label: string;
  value: number | undefined;
  icon: LucideIcon;
  isLoading: boolean;
  href?: string;
  highlight?: boolean;
}) {
  const isHighlighted = highlight === true && value != null && value > 0;
  const clickable = Boolean(href);

  const inner = (
    <Card
      className={cn(
        "relative h-full overflow-hidden p-0 transition-all duration-200",
        clickable &&
          "group-hover:-translate-y-0.5 group-hover:border-brand-secondary/50 group-hover:shadow-md group-active:translate-y-0 group-active:shadow-sm",
        isHighlighted && "border-emerald-200 dark:border-emerald-800/60",
      )}
    >
      {clickable && (
        <span
          aria-hidden
          className="pointer-events-none absolute right-3 top-3 z-10 flex h-5 w-5 origin-bottom-left items-center justify-center rounded-full text-brand-secondary opacity-0 translate-x-[-14px] translate-y-[14px] scale-75 transition-all duration-300 ease-out group-hover:translate-x-0 group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100"
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      )}
      <CardContent className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-widest text-text-secondary">{label}</span>
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md transition-all duration-300 ease-out",
              isHighlighted
                ? "bg-emerald-50 dark:bg-emerald-900/30"
                : "bg-layout-body",
              clickable && !isHighlighted && "group-hover:scale-90 group-hover:bg-brand-secondary/10",
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4 transition-all duration-300 ease-out",
                isHighlighted ? "text-emerald-600 dark:text-emerald-400" : "text-text-secondary",
                clickable && !isHighlighted && "group-hover:scale-110 group-hover:text-brand-secondary",
              )}
            />
          </div>
        </div>
        {isLoading ? (
          <Skeleton className="mt-1 h-9 w-16" />
        ) : (
          <span
            className={cn(
              "block text-4xl font-bold tracking-tight tabular-nums",
              isHighlighted ? "text-emerald-600 dark:text-emerald-400" : "text-text-main",
            )}
          >
            {value ?? "—"}
          </span>
        )}
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link
        to={href}
        className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary"
      >
        {inner}
      </Link>
    );
  }
  return inner;
}

export function AdminDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const firstName = user?.name?.trim().split(/\s+/)[0] ?? "";

  const q = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const res = await api.dashboard.stats.get();
      const body = res.data as unknown;
      if (res.status !== 200 || !body || isApiError(body)) {
        throw new Error(isApiError(body) ? body.error.message : "Falha ao carregar o dashboard");
      }
      return unwrapData<DashboardStatsPayload>(body);
    },
    refetchInterval: 30_000,
  });

  const stats = q.data?.stats;
  const activity = q.data?.recentActivity ?? [];
  const isLoading = q.isLoading;

  /* Único interval no nível da página: evita N intervals (um por linha) e mantém os textos sincronizados. */
  const [relativeTimeMap, setRelativeTimeMap] = useState<Record<string, string>>({});
  useEffect(() => {
    function recalculate() {
      const next: Record<string, string> = {};
      for (const entry of activity) {
        next[entry.id] = formatDistanceToNow(new Date(entry.createdAt), {
          addSuffix: true,
          locale: ptBR,
        });
      }
      setRelativeTimeMap(next);
    }
    recalculate();
    const interval = setInterval(recalculate, 15_000);
    return () => clearInterval(interval);
  }, [activity]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-text-secondary">
        {firstName ? <>Bem-vindo, {firstName}.</> : "Bem-vindo."}
      </p>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Empresas ativas"
          value={stats?.companies}
          icon={Building2}
          isLoading={isLoading}
          href="/admin/companies"
        />
        <StatCard
          label="Usuários cadastrados"
          value={stats?.users}
          icon={Users}
          isLoading={isLoading}
          href="/admin/users"
        />
        <StatCard
          label="Rastreando agora"
          value={stats?.activeTracking}
          icon={Satellite}
          isLoading={isLoading}
          highlight
        />
        <StatCard label="Sessões hoje" value={stats?.todaySessions} icon={Activity} isLoading={isLoading} />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-layout-border bg-layout-body px-6 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-text-secondary">
            Atividade recente
          </h2>
        </div>

        <div>
          {isLoading ? (
            <>
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 border-b border-layout-border/80 px-6 py-4 last:border-0"
                >
                  <Skeleton className="h-2 w-2 shrink-0 rounded-full" />
                  <Skeleton className="h-4 w-44 shrink-0" />
                  <Skeleton className="h-4 w-40 flex-1" />
                  <Skeleton className="ml-auto h-4 w-20 shrink-0" />
                </div>
              ))}
            </>
          ) : activity.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-text-secondary">Nenhuma atividade registrada ainda.</p>
            </div>
          ) : (
            activity.map((entry) => {
              const cfg =
                actionConfig[entry.action] ?? {
                  label: entry.action,
                  dotClass: "bg-zinc-300",
                  textClass: "text-text-secondary",
                };
              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-4 border-b border-layout-border/80 px-6 py-4 transition-colors last:border-0 hover:bg-layout-body"
                >
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", cfg.dotClass)} />
                  <span className={cn("w-44 shrink-0 text-sm font-medium", cfg.textClass)}>
                    {cfg.label}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-text-main">
                    {entry.user?.name ?? <span className="italic text-text-secondary">sistema</span>}
                  </span>
                  <span className="ml-auto shrink-0 text-xs tabular-nums text-text-secondary">
                    {relativeTimeMap[entry.id] ?? ""}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}
