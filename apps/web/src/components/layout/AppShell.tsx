import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchMyCompanyUsers } from "@/lib/backend-fetch";
import { firstLastDisplayName } from "@/lib/user-tracking-format";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import type { Role } from "@/store/auth.store";
import { useAuthStore } from "@/store/auth.store";
import { Building2, ChevronRight, Filter, Home, LogOut, Map, ScrollText, Search, Users } from "lucide-react";
import { NavLink, Outlet, Link, useLocation, useNavigate } from "react-router";

const links: { to: string; label: string; icon: typeof Building2; roles: Role[]; end?: boolean }[] = [
  { to: "/admin", label: "Início", icon: Home, roles: ["SYSTEM_ADMIN"], end: true },
  { to: "/admin/companies", label: "Empresas", icon: Building2, roles: ["SYSTEM_ADMIN"] },
  { to: "/admin/users", label: "Usuários", icon: Users, roles: ["SYSTEM_ADMIN"] },
  { to: "/admin/audit-logs", label: "Auditoria", icon: ScrollText, roles: ["SYSTEM_ADMIN"] },
  { to: "/company/dashboard", label: "Mapa ao vivo", icon: Map, roles: ["COMPANY_ADMIN"] },
  { to: "/company/users", label: "Usuários", icon: Users, roles: ["COMPANY_ADMIN"] },
];

function roleHome(role: Role): string {
  if (role === "SYSTEM_ADMIN") return "/admin";
  if (role === "COMPANY_ADMIN") return "/company/dashboard";
  return "/user/dashboard";
}

function roleLabel(role: Role): string {
  if (role === "SYSTEM_ADMIN") return "Admin sistema";
  if (role === "COMPANY_ADMIN") return "Admin empresa";
  return "Usuário";
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return (p[0]![0]! + p[p.length - 1]![0]!).toUpperCase();
}

function useBreadcrumbs(role: Role | undefined): { label: string; to?: string }[] {
  const { pathname } = useLocation();
  if (!role) return [];

  const home = roleHome(role);
  const crumbs: { label: string; to?: string }[] = [{ label: "Início", to: home }];

  if (pathname === "/admin") {
    return [{ label: "Início" }];
  }

  if (pathname === "/admin/companies" || pathname.startsWith("/admin/companies/")) {
    crumbs.push({
      label: "Empresas",
      to: pathname === "/admin/companies" ? undefined : "/admin/companies",
    });
    if (/^\/admin\/companies\/[^/]+$/.test(pathname)) {
      crumbs.push({ label: "Detalhe da empresa" });
    }
  } else if (pathname === "/admin/users" || pathname.startsWith("/admin/users/")) {
    crumbs.push({
      label: "Usuários",
      to: pathname === "/admin/users" ? undefined : "/admin/users",
    });
    if (/^\/admin\/users\/[^/]+$/.test(pathname)) {
      crumbs.push({ label: "Detalhe do usuário" });
    }
  } else if (pathname.startsWith("/admin/audit-logs")) {
    crumbs.push({ label: "Auditoria" });
  } else if (pathname.startsWith("/company/dashboard")) {
    crumbs.push({ label: "Mapa ao vivo" });
  } else if (pathname.startsWith("/company/users")) {
    crumbs.push({ label: "Usuários" });
  }

  return crumbs;
}

export function AppShell() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const visible = links.filter((l) => user && l.roles.includes(user.role));
  const crumbs = useBreadcrumbs(user?.role);
  const isCompanyPage = pathname.startsWith("/company/dashboard");
  const showCompanyFilter = isCompanyPage && user?.role === "COMPANY_ADMIN";
  const selectedCompanyId = new URLSearchParams(search).get("companyId") ?? "";
  const selectedUserSearch = new URLSearchParams(search).get("userSearch") ?? "";
  const hasActiveFilters = selectedCompanyId.length > 0 || selectedUserSearch.length > 0;

  const companiesSeedQuery = useQuery({
    queryKey: ["my-company-users", "seed"],
    queryFn: () => fetchMyCompanyUsers(),
    enabled: showCompanyFilter,
  });

  const companyOptions = (companiesSeedQuery.data ?? [])
    .flatMap((u) => u.companies)
    .reduce<{ id: string; name: string }[]>((acc, c) => {
      if (!acc.some((x) => x.id === c.id)) acc.push({ id: c.id, name: c.name });
      return acc;
    }, [])
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const shouldShowCompanySelect = companyOptions.length > 1;
  const singleCompanyName = companyOptions.length === 1 ? companyOptions[0]?.name ?? "" : "";

  /** Layout estilo app mobile: sem sidebar, sem breadcrumbs. */
  if (user?.role === "USER") {
    const displayName = firstLastDisplayName(user.name);
    return (
      <div className="flex min-h-screen flex-col bg-layout-body">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-layout-border bg-layout-header px-4 py-3 md:px-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-secondary text-sm font-bold text-text-inverted">
            {initials(user.name)}
          </div>
          <p className="min-w-0 flex-1 truncate text-lg font-semibold text-text-main">{displayName}</p>
          <Button
            variant="ghost"
            className="shrink-0 gap-2 px-2 font-semibold text-text-main hover:bg-layout-body"
            onClick={async () => {
              await logout();
              navigate("/login", { replace: true });
            }}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Deslogar
          </Button>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden flex-col md:flex-row">
      <aside className="flex w-full flex-row items-center gap-2 border-b border-white/10 bg-layout-sidebar-bg p-3 md:h-screen md:w-56 md:flex-col md:items-stretch md:border-b-0 md:border-r md:border-white/10 md:overflow-hidden">
        <div className="mb-2 hidden md:block">
          <div className="text-sm font-semibold text-text-inverted">GPS Tracker</div>
        </div>
        <nav className="flex flex-1 flex-wrap gap-1 md:min-h-0 md:flex-col md:overflow-y-auto">
          {visible.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end === true}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-brand-primary/20 text-layout-sidebar-active"
                    : "text-layout-sidebar-text hover:bg-white/5 hover:text-text-inverted",
                )
              }
            >
              <l.icon className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{l.label}</span>
            </NavLink>
          ))}
        </nav>
        <Button
          variant="ghost"
          className="shrink-0 md:mt-auto justify-start gap-2 text-layout-sidebar-text hover:bg-white/5 hover:text-text-inverted"
          onClick={async () => {
            await logout();
            navigate("/login", { replace: true });
          }}
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sair</span>
        </Button>
      </aside>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-layout-body">
        <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-layout-border bg-layout-body/95 px-4 py-3 backdrop-blur md:px-6">
          <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1 text-sm text-text-secondary">
            {crumbs.map((c, i) => (
              <span key={`${c.label}-${i}`} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" />}
                {c.to ? (
                  <Link to={c.to} className="truncate text-text-main hover:text-brand-secondary">
                    {c.label}
                  </Link>
                ) : (
                  <span className="truncate font-medium text-text-main">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-3">
            {showCompanyFilter && (
              <div className="hidden items-end gap-2 rounded-xl border border-layout-border bg-layout-card/90 px-3 py-2 md:flex">
                <div className="flex items-end gap-2">
                  <Filter className="mb-2 h-4 w-4 text-text-secondary" />
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Empresa</p>
                    {shouldShowCompanySelect ? (
                      <select
                        value={selectedCompanyId}
                        onChange={(e) => {
                          const params = new URLSearchParams(search);
                          const next = e.target.value.trim();
                          if (next) params.set("companyId", next);
                          else params.delete("companyId");
                          const nextSearch = params.toString();
                          navigate(`${pathname}${nextSearch ? `?${nextSearch}` : ""}`, { replace: true });
                        }}
                        className="h-10 min-w-52 rounded-md border border-layout-border bg-layout-body px-2 text-sm text-text-main"
                      >
                        <option value="">Todas as empresas</option>
                        {companyOptions.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="inline-flex h-10 min-w-52 items-center rounded-md border border-layout-border bg-layout-body px-3 text-sm font-medium text-text-main">
                        {singleCompanyName || "Empresa não identificada"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-end gap-2">
                  <Search className="mb-2 h-4 w-4 text-text-secondary" />
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Buscar usuário</p>
                    <Input
                      value={selectedUserSearch}
                      onChange={(e) => {
                        const params = new URLSearchParams(search);
                        const next = e.target.value.trim();
                        if (next) params.set("userSearch", next);
                        else params.delete("userSearch");
                        const nextSearch = params.toString();
                        navigate(`${pathname}${nextSearch ? `?${nextSearch}` : ""}`, { replace: true });
                      }}
                      placeholder="Nome, e-mail ou telefone"
                      autoComplete="off"
                      className="h-10 w-72 border-layout-border bg-layout-body text-sm"
                    />
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="h-10"
                  disabled={!hasActiveFilters}
                  onClick={() => {
                    const params = new URLSearchParams(search);
                    params.delete("companyId");
                    params.delete("userSearch");
                    const nextSearch = params.toString();
                    navigate(`${pathname}${nextSearch ? `?${nextSearch}` : ""}`, { replace: true });
                  }}
                >
                  Limpar
                </Button>
              </div>
            )}
            {user && (
              <div className="flex items-center gap-2 rounded-lg border border-layout-border bg-layout-card px-2 py-1.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-primary/20 text-xs font-semibold text-brand-secondary">
                  {initials(user.name)}
                </div>
                <div className="hidden min-w-0 sm:block">
                  <p className="truncate text-sm font-medium text-text-main">{user.name}</p>
                  <Badge
                    variant="default"
                    className={cn(
                      "mt-0.5",
                      user.role === "SYSTEM_ADMIN" && "bg-brand-secondary/25",
                      user.role === "COMPANY_ADMIN" && "bg-feedback-success/15",
                    )}
                  >
                    {roleLabel(user.role)}
                  </Badge>
                </div>
              </div>
            )}
          </div>
        </header>
        <main className={cn("flex-1 p-4 md:p-6", isCompanyPage ? "overflow-hidden" : "overflow-auto")}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
