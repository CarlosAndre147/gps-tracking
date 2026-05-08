import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  fetchMyCompanyUserTrackingHistory,
  fetchMyCompanyUsers,
  type CompanyUserTrackingHistoryRow,
} from "@/lib/backend-fetch";
import { formatPhoneDisplay } from "@/lib/masks";
import { roleLabelPtBr } from "@/lib/role-label";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpDown, History, UserCheck, UserX, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";

type CompanyUserRow = Awaited<ReturnType<typeof fetchMyCompanyUsers>>[number];

function statusLabel(active: boolean): string {
  return active ? "Ativo" : "Inativo";
}

function trackingLabel(active: boolean): string {
  return active ? "Ativo" : "Inativo";
}

function formatLastAccess(lastSeenAt: string | null | undefined): string {
  if (!lastSeenAt) return "Nunca acessou";
  return new Date(lastSeenAt).toLocaleString("pt-BR");
}

function CompanyListCell({ companies }: { companies: { id: string; name: string }[] }) {
  if (companies.length === 0) {
    return <span className="text-text-secondary">Sem empresa</span>;
  }

  const primary = companies[0];
  const hidden = companies.slice(1);

  return (
    <div className="flex max-w-[320px] items-center gap-1">
      <span className="inline-block w-fit max-w-[220px] truncate rounded-md bg-layout-body px-2 py-1 text-xs font-medium text-text-secondary">
        {primary?.name}
      </span>
      {hidden.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-block w-fit cursor-default rounded-md bg-layout-body px-2 py-1 text-xs font-medium text-text-muted">
              +{hidden.length}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-64 text-xs">
            <div className="space-y-1">
              {hidden.map((company) => (
                <div key={company.id}>{company.name}</div>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function filterUsers(users: CompanyUserRow[], userSearch: string): CompanyUserRow[] {
  const term = userSearch.trim().toLowerCase();
  if (!term) return users;
  const digits = term.replace(/\D/g, "");
  return users.filter((u) => {
    const byName = u.name.toLowerCase().includes(term);
    const byEmail = u.email.toLowerCase().includes(term);
    const phone = u.phone ?? "";
    const byPhoneText = phone.toLowerCase().includes(term) || formatPhoneDisplay(phone).toLowerCase().includes(term);
    const byPhoneDigits = digits.length > 0 && phone.replace(/\D/g, "").includes(digits);
    return byName || byEmail || byPhoneText || byPhoneDigits;
  });
}

function formatHistorySession(row: CompanyUserTrackingHistoryRow): string {
  const started = new Date(row.startedAt);
  if (!row.stoppedAt) return `Em andamento desde ${started.toLocaleString("pt-BR")}`;
  const stopped = new Date(row.stoppedAt);
  return `${started.toLocaleString("pt-BR")} - ${stopped.toLocaleString("pt-BR")}`;
}

function formatDurationMs(durationMs: number | null): string {
  if (durationMs == null) return "Em andamento";
  const totalSec = Math.floor(durationMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function CompanyUsersPage() {
  const [searchParams] = useSearchParams();
  const selectedCompanyId = searchParams.get("companyId") ?? "";
  const headerUserSearch = searchParams.get("userSearch") ?? "";
  const [search, setSearch] = useState(headerUserSearch);
  const [companyFilter, setCompanyFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [trackingFilter, setTrackingFilter] = useState<"ALL" | "ON" | "OFF">("ALL");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<"name" | "email" | "role" | "isActive" | "trackingActive" | "lastAccess" | null>(
    "name",
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>("asc");
  const [page, setPage] = useState(1);
  const [historyUser, setHistoryUser] = useState<CompanyUserRow | null>(null);
  const [historyPage, setHistoryPage] = useState(1);

  const usersQuery = useQuery({
    queryKey: ["my-company-users", "list", selectedCompanyId],
    queryFn: () => fetchMyCompanyUsers(selectedCompanyId || undefined),
  });

  const roleOptions = useMemo(() => {
    const roles = new Set((usersQuery.data ?? []).map((u) => u.role));
    return Array.from(roles).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [usersQuery.data]);

  const companyOptions = useMemo(() => {
    const all = (usersQuery.data ?? []).flatMap((u) => u.companies);
    const unique = new Map<string, string>();
    for (const c of all) {
      if (!unique.has(c.id)) unique.set(c.id, c.name);
    }
    return Array.from(unique.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [usersQuery.data]);

  useEffect(() => {
    setSearch(headerUserSearch);
  }, [headerUserSearch]);

  useEffect(() => {
    setPage(1);
  }, [companyFilter, roleFilter, search, sortBy, sortDir, statusFilter, trackingFilter]);

  useEffect(() => {
    setHistoryPage(1);
  }, [historyUser?.id]);

  function toggleSort(target: "name" | "email" | "role" | "isActive" | "trackingActive" | "lastAccess") {
    if (sortBy !== target) {
      setSortBy(target);
      setSortDir("asc");
      return;
    }
    if (sortDir === "asc") {
      setSortDir("desc");
      return;
    }
    if (sortDir === "desc") {
      setSortBy(null);
      setSortDir(null);
      return;
    }
    setSortDir("asc");
  }

  const filteredUsers = useMemo(() => {
    const withSearch = filterUsers(usersQuery.data ?? [], search);
    const withFilters = withSearch
      .filter((u) => {
        if (companyFilter !== "ALL" && !u.companies.some((c) => c.id === companyFilter)) return false;
        if (statusFilter === "ACTIVE" && !u.isActive) return false;
        if (statusFilter === "INACTIVE" && u.isActive) return false;
        if (trackingFilter === "ON" && !u.trackingActive) return false;
        if (trackingFilter === "OFF" && u.trackingActive) return false;
        if (roleFilter !== "ALL" && u.role !== roleFilter) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    if (!sortBy || !sortDir) return withFilters;

    const sorted = [...withFilters].sort((a, b) => {
      if (sortBy === "name" || sortBy === "email" || sortBy === "role") {
        return String(a[sortBy]).localeCompare(String(b[sortBy]), "pt-BR");
      }
      if (sortBy === "lastAccess") {
        return new Date(a.lastSeenAt ?? 0).getTime() - new Date(b.lastSeenAt ?? 0).getTime();
      }
      if (sortBy === "isActive" || sortBy === "trackingActive") {
        return Number(a[sortBy]) - Number(b[sortBy]);
      }
      return 0;
    });

    return sortDir === "asc" ? sorted : sorted.reverse();
  }, [companyFilter, roleFilter, search, sortBy, sortDir, statusFilter, trackingFilter, usersQuery.data]);

  const activeCount = filteredUsers.filter((u) => u.isActive).length;
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const historyQuery = useQuery({
    queryKey: ["my-company-user-history", historyUser?.id, historyPage, selectedCompanyId],
    queryFn: () =>
      fetchMyCompanyUserTrackingHistory(historyUser!.id, {
        page: historyPage,
        limit: 10,
        companyId: selectedCompanyId || undefined,
      }),
    enabled: !!historyUser,
  });

  function SortIcon({ target }: { target: "name" | "email" | "role" | "isActive" | "trackingActive" | "lastAccess" }) {
    if (sortBy !== target || sortDir === null) return <ArrowUpDown className="h-3.5 w-3.5" />;
    if (sortDir === "asc") return <ArrowUp className="h-3.5 w-3.5" />;
    return <ArrowDown className="h-3.5 w-3.5" />;
  }

  return (
    <TooltipProvider delayDuration={120}>
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <Users className="h-5 w-5" />
              Usuários da empresa
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
              <Badge variant="outline">Total: {filteredUsers.length}</Badge>
              <Badge variant="outline">Ativos: {activeCount}</Badge>
              <Badge variant="outline">Inativos: {Math.max(0, filteredUsers.length - activeCount)}</Badge>
            </div>

            <div className="rounded-lg border border-layout-border bg-layout-card p-3">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium">Filtros</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setCompanyFilter("ALL");
                    setStatusFilter("ALL");
                    setTrackingFilter("ALL");
                    setRoleFilter("ALL");
                  }}
                >
                  Limpar
                </Button>
              </div>

              <div className="grid gap-3 md:grid-cols-12">
                <div className="space-y-1 md:col-span-4">
                  <Label htmlFor="company-users-search">Buscar nome, e-mail ou telefone</Label>
                  <Input
                    id="company-users-search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Digite nome, e-mail ou telefone"
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <Label>Empresa</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-layout-border bg-layout-card px-3 text-sm"
                    value={companyFilter}
                    onChange={(e) => setCompanyFilter(e.target.value)}
                  >
                    <option value="ALL">Todas</option>
                    {companyOptions.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1 md:col-span-2">
                  <Label>Status</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-layout-border bg-layout-card px-3 text-sm"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                  >
                    <option value="ALL">Todos</option>
                    <option value="ACTIVE">Ativo</option>
                    <option value="INACTIVE">Inativo</option>
                  </select>
                </div>

                <div className="space-y-1 md:col-span-2">
                  <Label>Rastreamento</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-layout-border bg-layout-card px-3 text-sm"
                    value={trackingFilter}
                    onChange={(e) => setTrackingFilter(e.target.value as typeof trackingFilter)}
                  >
                    <option value="ALL">Todos</option>
                    <option value="ON">Ativo</option>
                    <option value="OFF">Inativo</option>
                  </select>
                </div>

                <div className="space-y-1 md:col-span-2">
                  <Label>Papel</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-layout-border bg-layout-card px-3 text-sm"
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                  >
                    <option value="ALL">Todos</option>
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {roleLabelPtBr(role)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {usersQuery.isLoading && (
              <div className="space-y-2">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            )}

          {usersQuery.isError && (
            <div className="rounded-lg border border-feedback-error/40 bg-feedback-error/10 p-3 text-sm text-feedback-error">
              Não foi possível carregar os usuários.
            </div>
          )}

          {!usersQuery.isLoading && !usersQuery.isError && filteredUsers.length === 0 && (
            <div className="rounded-lg border border-layout-border bg-layout-card p-4 text-sm text-text-secondary">
              Nenhum usuário encontrado para os filtros atuais.
            </div>
          )}

            {!usersQuery.isLoading && !usersQuery.isError && filteredUsers.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-layout-border">
                <div className="overflow-x-auto">
                <table className="w-full min-w-[1120px] text-left text-sm">
                  <thead className="border-b border-layout-border bg-layout-body text-xs uppercase text-text-secondary">
                    <tr>
                    <th className="px-4 py-3">
                      <button type="button" className="inline-flex items-center gap-1 font-semibold" onClick={() => toggleSort("name")}>
                        Nome
                        <SortIcon target="name" />
                      </button>
                    </th>
                    <th className="px-4 py-3">
                      <button type="button" className="inline-flex items-center gap-1 font-semibold" onClick={() => toggleSort("email")}>
                        E-mail
                        <SortIcon target="email" />
                      </button>
                    </th>
                    <th className="px-4 py-3">Telefone</th>
                    <th className="px-4 py-3">Empresas</th>
                    <th className="px-4 py-3">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 font-semibold"
                        onClick={() => toggleSort("lastAccess")}
                      >
                        Último acesso
                        <SortIcon target="lastAccess" />
                      </button>
                    </th>
                    <th className="px-4 py-3">
                      <button type="button" className="inline-flex items-center gap-1 font-semibold" onClick={() => toggleSort("role")}>
                        Papel
                        <SortIcon target="role" />
                      </button>
                    </th>
                    <th className="px-4 py-3">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 font-semibold"
                        onClick={() => toggleSort("isActive")}
                      >
                        Status
                        <SortIcon target="isActive" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                  {pagedUsers.map((user) => (
                      <tr key={user.id} className="border-b border-layout-border/80 bg-layout-card align-middle hover:bg-layout-body">
                        <td className="px-4 py-3 font-medium text-text-main">{user.name}</td>
                        <td className="px-4 py-3 text-text-secondary">{user.email}</td>
                        <td className="px-4 py-3 text-text-secondary">{formatPhoneDisplay(user.phone)}</td>
                        <td className="px-4 py-3 text-text-secondary">
                          <CompanyListCell companies={user.companies} />
                        </td>
                        <td className="px-4 py-3 text-text-secondary">{formatLastAccess(user.lastSeenAt)}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{roleLabelPtBr(user.role)}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            className={cn(
                              user.isActive ? "bg-feedback-success/15 text-feedback-success" : "bg-feedback-error/15 text-feedback-error",
                            )}
                          >
                            {user.isActive ? <UserCheck className="mr-1 h-3.5 w-3.5" /> : <UserX className="mr-1 h-3.5 w-3.5" />}
                            {statusLabel(user.isActive)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => setHistoryUser(user)}
                                aria-label="Ver histórico de rastreamento"
                              >
                                <History className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Ver histórico de rastreamento</TooltipContent>
                          </Tooltip>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                <div className="flex items-center justify-between border-t border-layout-border bg-layout-card px-4 py-3 text-sm">
                  <span className="text-text-secondary">
                    Página {currentPage} de {pageCount}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage >= pageCount}
                      onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!historyUser} onOpenChange={(open) => !open && setHistoryUser(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico de rastreamento</DialogTitle>
            <DialogDescription>
              {historyUser ? `Usuário: ${historyUser.name}` : "Histórico do usuário selecionado"}
            </DialogDescription>
          </DialogHeader>

          {historyQuery.isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}

          {historyQuery.isError && (
            <div className="rounded-lg border border-feedback-error/40 bg-feedback-error/10 p-3 text-sm text-feedback-error">
              {historyQuery.error instanceof Error ? historyQuery.error.message : "Falha ao carregar histórico."}
            </div>
          )}

          {!historyQuery.isLoading && !historyQuery.isError && (
            <>
              {(historyQuery.data?.items ?? []).length === 0 ? (
                <div className="rounded-lg border border-layout-border bg-layout-card p-3 text-sm text-text-secondary">
                  Nenhum histórico para este usuário.
                </div>
              ) : (
                (() => {
                  const historyMeta = historyQuery.data?.meta ?? { page: 1, limit: 10, total: 0 };
                  const historyPageCount = Math.max(
                    1,
                    Math.ceil(historyMeta.total / Math.max(1, historyMeta.limit)),
                  );
                  return (
                    <div className="overflow-hidden rounded-lg border border-layout-border">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead className="border-b border-layout-border bg-layout-body text-xs uppercase text-text-secondary">
                            <tr>
                              <th className="px-3 py-2">Sessão</th>
                              <th className="px-3 py-2">Duração</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(historyQuery.data?.items ?? []).map((row) => (
                              <tr key={row.id} className="border-b border-layout-border/80">
                                <td className="px-3 py-2">{formatHistorySession(row)}</td>
                                <td className="px-3 py-2">{formatDurationMs(row.durationMs)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex items-center justify-between border-t border-layout-border bg-layout-card px-4 py-3 text-sm">
                        <span className="text-text-secondary">
                          Página {historyMeta.page} de {historyPageCount}
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={historyMeta.page <= 1 || historyQuery.isFetching}
                            onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                          >
                            Anterior
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={historyQuery.isFetching || historyMeta.page >= historyPageCount}
                            onClick={() => setHistoryPage((p) => Math.min(historyPageCount, p + 1))}
                          >
                            Próxima
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
