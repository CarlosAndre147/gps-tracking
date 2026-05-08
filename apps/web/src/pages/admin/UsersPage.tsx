import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useDebouncedValue } from "@/lib/debounce";
import { formatPhoneDisplay, maskCnpjInput, maskCpfInput, maskPhoneBrInput } from "@/lib/masks";
import { api } from "@/lib/api";
import { isApiError, unwrapData, unwrapPaginated } from "@/lib/api-result";
import { roleLabelPtBr } from "@/lib/role-label";
import { useAuthStore } from "@/store/auth.store";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Eye,
  EyeOff,
  KeyRound,
  SquarePen,
  UserCheck,
  UserX,
  Users as UsersIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Link } from "react-router";
import { toast } from "sonner";
import { roleBadgeClass, formatLastAccess } from "./users-page.formatters";
import { mapCreateUserPayload } from "./users-page.mappers";
import { getSortTooltip, toggleSortState } from "./users-page.sort";
import { createUserSchema, resetPwSchema, type CreateUserForm, type ResetPwForm } from "./users-page.schemas";
import { UserStatusConfirmDialog } from "./UserStatusConfirmDialog";
import { UsersPagination } from "./UsersPagination";

type UserRow = {
  id: string;
  name: string;
  email: string;
  cpf: string;
  phone: string;
  role: string;
  isActive: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
  companies: { id: string; name: string; cnpj: string }[];
};

type CompanyOption = { id: string; name: string };

function CompanyBadges({ companies }: { companies: { id: string; name: string }[] }) {
  const head = companies.slice(0, 2);
  const more = companies.length - head.length;
  return (
    <div className="flex max-w-[320px] flex-col gap-1">
      {head[0] ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-block w-fit max-w-[220px] truncate rounded-md bg-layout-body px-2 py-1 text-xs font-medium text-text-secondary">
              {head[0].name}
            </span>
          </TooltipTrigger>
          <TooltipContent>{head[0].name}</TooltipContent>
        </Tooltip>
      ) : null}
      {(head[1] || more > 0) && (
        <div className="flex items-center gap-1">
          {head[1] ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block max-w-[220px] truncate rounded-md bg-layout-body px-2 py-1 text-xs font-medium text-text-secondary">
                  {head[1].name}
                </span>
              </TooltipTrigger>
              <TooltipContent>{head[1].name}</TooltipContent>
            </Tooltip>
          ) : null}
          {more > 0 && (
            <span className="rounded-md bg-layout-body px-2 py-1 text-xs font-medium text-text-muted">+{more}</span>
          )}
        </div>
      )}
    </div>
  );
}

export function UsersPage() {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [roleFilter, setRoleFilter] = useState<"" | "SYSTEM_ADMIN" | "COMPANY_ADMIN" | "USER">("");
  const [statusFilter, setStatusFilter] = useState<"" | "true" | "false">("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [companyFilterSearch, setCompanyFilterSearch] = useState("");
  const [companyFilterOpen, setCompanyFilterOpen] = useState(false);
  const companyFilterRef = useRef<HTMLDivElement | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [showCreateConfirmPassword, setShowCreateConfirmPassword] = useState(false);
  const [companyLinkSearch, setCompanyLinkSearch] = useState("");
  const [pwUser, setPwUser] = useState<UserRow | null>(null);
  const [deactivateUser, setDeactivateUser] = useState<UserRow | null>(null);
  const [activateUser, setActivateUser] = useState<UserRow | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "lastSeenAt" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, roleFilter, statusFilter, companyFilter]);

  useEffect(() => {
    if (!companyFilterOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (companyFilterRef.current?.contains(target)) return;
      setCompanyFilterOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [companyFilterOpen]);

  const companiesOptionsQuery = useQuery({
    queryKey: ["companies-options"],
    queryFn: async () => {
      const res = await api.companies.get({ query: { page: 1, limit: 100, activeOnly: "true" } });
      const body = res.data as unknown;
      if (res.status !== 200 || !body || isApiError(body)) {
        throw new Error(isApiError(body) ? body.error.message : "Falha ao listar empresas");
      }
      const { items } = unwrapPaginated<CompanyOption & { cnpj: string }>(body);
      return items.map((c) => ({ id: c.id, name: c.name }));
    },
  });

  const listQuery = useQuery({
    queryKey: ["users", page, debouncedSearch, roleFilter, statusFilter, companyFilter, sortBy, sortDir],
    queryFn: async () => {
      const res = await api.users.get({
        query: {
          page,
          limit: 20,
          search: debouncedSearch.trim() || undefined,
          role: roleFilter || undefined,
          companyId: companyFilter || undefined,
          isActive: statusFilter || undefined,
          sortBy: sortBy ?? undefined,
          sortDir: sortDir ?? undefined,
        },
      });
      const body = res.data as unknown;
      if (res.status !== 200 || !body || isApiError(body)) {
        throw new Error(isApiError(body) ? body.error.message : "Falha ao listar usuários");
      }
      return unwrapPaginated<UserRow>(body);
    },
    refetchInterval: 30_000,
  });

  const createForm = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      name: "",
      email: "",
      cpf: "",
      phone: "",
      password: "",
      confirmPassword: "",
      role: "USER",
      companyMode: "none",
      companyIds: [],
      companyName: "",
      companyCnpj: "",
      companyEmail: "",
      companyPhone: "",
    },
  });

  const pwForm = useForm<ResetPwForm>({
    resolver: zodResolver(resetPwSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  useEffect(() => {
    if (pwUser) pwForm.reset({ newPassword: "", confirmPassword: "" });
  }, [pwUser, pwForm]);

  const createMut = useMutation({
    mutationFn: async (data: CreateUserForm) => {
      const res = await api.users.post(mapCreateUserPayload(data));
      const body = res.data as unknown;
      if (res.status !== 201 || !body || isApiError(body)) {
        throw new Error(isApiError(body) ? body.error.message : "Não foi possível criar usuário");
      }
      return unwrapData(body);
    },
    onSuccess: () => {
      toast.success("Usuário criado");
      setCreateOpen(false);
      setShowCreatePassword(false);
      setShowCreateConfirmPassword(false);
      createForm.reset();
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const passwordMut = useMutation({
    mutationFn: async (payload: { userId: string; newPassword: string }) => {
      const res = await api.users({ id: payload.userId }).password.patch({
        newPassword: payload.newPassword,
      });
      const body = res.data as unknown;
      if (res.status !== 200 || !body || isApiError(body)) {
        throw new Error(isApiError(body) ? body.error.message : "Falha ao alterar senha");
      }
    },
    onSuccess: () => {
      toast.success("Senha atualizada");
      setPwUser(null);
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deactivateMut = useMutation({
    mutationFn: async (userId: string) => {
      const res = await api.users({ id: userId }).delete();
      const body = res.data as unknown;
      if (res.status !== 200 || !body || isApiError(body)) {
        throw new Error(isApiError(body) ? body.error.message : "Falha ao desativar");
      }
    },
    onSuccess: () => {
      toast.success("Usuário desativado");
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activateMut = useMutation({
    mutationFn: async (userId: string) => {
      const res = await api.users({ id: userId }).activate.patch();
      const body = res.data as unknown;
      if (res.status !== 200 || !body || isApiError(body)) {
        throw new Error(isApiError(body) ? body.error.message : "Falha ao ativar");
      }
    },
    onSuccess: () => {
      toast.success("Usuário ativado");
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function toggleSort(target: "name" | "lastSeenAt") {
    setPage(1);
    const next = toggleSortState(sortBy, sortDir, target);
    setSortBy(next.sortBy);
    setSortDir(next.sortDir);
  }

  const { items, meta } = listQuery.data ?? { items: [], meta: { page: 1, limit: 20, total: 0 } };
  const pageCount = Math.max(1, Math.ceil(meta.total / Math.max(1, meta.limit)));
  const canPrev = meta.page > 1;
  const canNext = meta.page < pageCount;
  const companyOptions = companiesOptionsQuery.data ?? [];
  const filteredCompanyFilterOptions = companyOptions.filter((c) =>
    c.name.toLowerCase().includes(companyFilterSearch.trim().toLowerCase()),
  );
  const filteredCompanyOptions = companyOptions.filter((c) =>
    c.name.toLowerCase().includes(companyLinkSearch.trim().toLowerCase()),
  );

  return (
    <TooltipProvider delayDuration={120}>
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Usuários</h1>
        <Button onClick={() => setCreateOpen(true)}>Novo usuário</Button>
      </div>

      <div className="rounded-xl border border-layout-border bg-layout-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium">Filtros</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setRoleFilter("");
              setStatusFilter("");
              setCompanyFilter("");
              setCompanyFilterSearch("");
            }}
          >
            Limpar
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-12">
        <div className="space-y-1 sm:col-span-2 xl:col-span-5">
          <Label htmlFor="user-search">Buscar nome, e-mail ou telefone</Label>
          <Input
            id="user-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Digite nome, e-mail ou telefone"
          />
        </div>
        <div className="space-y-1 xl:col-span-2">
          <Label>Papel</Label>
          <select
            className="flex h-10 w-full rounded-md border border-layout-border bg-layout-card px-3 text-sm"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
          >
            <option value="">Todos</option>
            <option value="SYSTEM_ADMIN">Admin sistema</option>
            <option value="COMPANY_ADMIN">Admin empresa</option>
            <option value="USER">Usuário</option>
          </select>
        </div>
        <div className="space-y-1 xl:col-span-2">
          <Label>Status</Label>
          <select
            className="flex h-10 w-full rounded-md border border-layout-border bg-layout-card px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          >
            <option value="">Todos</option>
            <option value="true">Ativo</option>
            <option value="false">Inativo</option>
          </select>
        </div>
        <div className="space-y-1 sm:col-span-2 xl:col-span-3">
          <Label>Empresa</Label>
          <div className="relative" ref={companyFilterRef}>
            <button
              type="button"
              className="flex h-10 w-full items-center justify-between rounded-md border border-layout-border bg-layout-card px-3 text-sm"
              onClick={() => setCompanyFilterOpen((v) => !v)}
            >
              <span className="truncate text-left">
                {companyFilter
                  ? (companyOptions.find((c) => c.id === companyFilter)?.name ?? "Empresa selecionada")
                  : "Todas"}
              </span>
              <span className="text-text-secondary">▾</span>
            </button>
            {companyFilterOpen && (
              <div className="absolute z-20 mt-1 w-full rounded-md border border-layout-border bg-layout-card p-2 shadow-md">
                <Input
                  value={companyFilterSearch}
                  onChange={(e) => setCompanyFilterSearch(e.target.value)}
                  placeholder="Digite nome da empresa"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setCompanyFilterOpen(false);
                  }}
                />
                <div className="mt-2 max-h-44 overflow-y-auto">
                  <button
                    type="button"
                    className={cn(
                      "w-full rounded px-2 py-1 text-left text-sm hover:bg-layout-body",
                      !companyFilter && "bg-layout-body",
                    )}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setCompanyFilter("");
                      setCompanyFilterSearch("");
                      setCompanyFilterOpen(false);
                    }}
                  >
                    Todas
                  </button>
                  {filteredCompanyFilterOptions.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={cn(
                        "w-full rounded px-2 py-1 text-left text-sm hover:bg-layout-body",
                        companyFilter === c.id && "bg-layout-body",
                      )}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setCompanyFilter(c.id);
                        setCompanyFilterSearch(c.name);
                        setCompanyFilterOpen(false);
                      }}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {listQuery.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={UsersIcon}
              title="Nenhum usuário encontrado"
              description="Ajuste os filtros ou cadastre um novo usuário."
              action={
                <Button type="button" onClick={() => setCreateOpen(true)}>
                  Novo usuário
                </Button>
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-layout-border bg-layout-body text-xs uppercase text-text-secondary">
                    <tr>
                    <th className="px-4 py-3">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 font-semibold"
                            onClick={() => toggleSort("name")}
                            aria-label="Ordenar por nome"
                          >
                            Nome
                            {sortBy === "name" ? (
                              sortDir === "asc" ? (
                                <ArrowUp className="h-3.5 w-3.5" />
                              ) : sortDir === "desc" ? (
                                <ArrowDown className="h-3.5 w-3.5" />
                              ) : (
                                <ArrowUpDown className="h-3.5 w-3.5" />
                              )
                            ) : (
                              <ArrowUpDown className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{getSortTooltip(sortBy, sortDir, "name")}</TooltipContent>
                      </Tooltip>
                    </th>
                    <th className="px-4 py-3">E-mail</th>
                    <th className="px-4 py-3">Telefone</th>
                    <th className="px-4 py-3">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 font-semibold"
                            onClick={() => toggleSort("lastSeenAt")}
                            aria-label="Ordenar por último acesso"
                          >
                            Último acesso
                            {sortBy === "lastSeenAt" ? (
                              sortDir === "asc" ? (
                                <ArrowUp className="h-3.5 w-3.5" />
                              ) : sortDir === "desc" ? (
                                <ArrowDown className="h-3.5 w-3.5" />
                              ) : (
                                <ArrowUpDown className="h-3.5 w-3.5" />
                              )
                            ) : (
                              <ArrowUpDown className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{getSortTooltip(sortBy, sortDir, "lastSeenAt")}</TooltipContent>
                      </Tooltip>
                    </th>
                    <th className="px-4 py-3">Papel</th>
                    <th className="px-4 py-3">Empresas</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((u) => (
                      <tr key={u.id} className="border-b border-layout-border/80 hover:bg-layout-body">
                      <td className="px-4 py-3 font-medium">{u.name}</td>
                      <td className="px-4 py-3 text-text-secondary">{u.email}</td>
                      <td className="px-4 py-3 text-text-secondary">{formatPhoneDisplay(u.phone)}</td>
                      <td className="px-4 py-3 text-text-secondary">{formatLastAccess(u.lastSeenAt)}</td>
                      <td className="px-4 py-3">
                        <span className={cn("rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap", roleBadgeClass(u.role))}>
                          {roleLabelPtBr(u.role)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <CompanyBadges companies={u.companies} />
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={u.isActive ? "success" : "muted"}>{u.isActive ? "Ativo" : "Inativo"}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-nowrap justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Link to={`/admin/users/${u.id}`}>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Editar usuário">
                                  <SquarePen className="h-4 w-4" />
                                </Button>
                              </Link>
                            </TooltipTrigger>
                            <TooltipContent>Editar usuário</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                aria-label="Redefinir senha"
                                onClick={() => setPwUser(u)}
                              >
                                <KeyRound className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Redefinir senha</TooltipContent>
                          </Tooltip>
                          {u.isActive ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-feedback-error hover:text-feedback-error"
                                  aria-label="Desativar usuário"
                                  disabled={deactivateMut.isPending || me?.id === u.id}
                                  onClick={() => setDeactivateUser(u)}
                                >
                                  <UserX className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {me?.id === u.id ? "Você não pode desativar o próprio usuário" : "Desativar usuário"}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-feedback-success hover:text-feedback-success"
                                  aria-label="Ativar usuário"
                                  disabled={activateMut.isPending}
                                  onClick={() => setActivateUser(u)}
                                >
                                  <UserCheck className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Ativar usuário</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <UsersPagination
                page={meta.page}
                pageCount={pageCount}
                canPrev={canPrev}
                canNext={canNext}
                isFetching={listQuery.isFetching}
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => p + 1)}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo usuário</DialogTitle>
            <DialogDescription>Cadastre usuário comum ou admin de empresa e opcionalmente associe a uma empresa.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={createForm.handleSubmit((d) => createMut.mutate(d))}>
            <div className="sm:col-span-2 rounded-lg border border-layout-border p-3">
              <p className="mb-3 text-sm font-semibold">Dados do usuário</p>
            <div className="space-y-1 sm:col-span-2">
              <Label>Nome</Label>
              <Input {...createForm.register("name")} />
              {createForm.formState.errors.name && (
                <p className="text-xs text-feedback-error">{createForm.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>E-mail</Label>
              <Input type="email" {...createForm.register("email")} />
              {createForm.formState.errors.email && (
                <p className="text-xs text-feedback-error">{createForm.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>CPF</Label>
              <Controller
                name="cpf"
                control={createForm.control}
                render={({ field }) => (
                  <Input {...field} onChange={(e) => field.onChange(maskCpfInput(e.target.value))} inputMode="numeric" />
                )}
              />
              {createForm.formState.errors.cpf && (
                <p className="text-xs text-feedback-error">{createForm.formState.errors.cpf.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Telefone</Label>
              <Controller
                name="phone"
                control={createForm.control}
                render={({ field }) => (
                  <Input {...field} onChange={(e) => field.onChange(maskPhoneBrInput(e.target.value))} inputMode="tel" />
                )}
              />
              {createForm.formState.errors.phone && (
                <p className="text-xs text-feedback-error">{createForm.formState.errors.phone.message}</p>
              )}
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Papel</Label>
              <select className="flex h-10 w-full rounded-md border border-layout-border bg-layout-card px-3 text-sm" {...createForm.register("role")}>
                <option value="USER">Usuário</option>
                <option value="COMPANY_ADMIN">Admin empresa</option>
              </select>
            </div>
            </div>
            <div className="sm:col-span-2 rounded-lg border border-layout-border p-3">
              <p className="mb-3 text-sm font-semibold">Vínculo com empresa</p>
            <div className="space-y-1 sm:col-span-2">
              <Label>Associação com empresa</Label>
              <select
                className="flex h-10 w-full rounded-md border border-layout-border bg-layout-card px-3 text-sm"
                {...createForm.register("companyMode")}
              >
                <option value="none">Sem vínculo agora</option>
                <option value="link">Vincular empresa(s) existente(s)</option>
                <option value="create">Criar nova empresa e vincular</option>
              </select>
            </div>
            {createForm.watch("companyMode") === "link" && (
              <div className="space-y-1 sm:col-span-2">
                <Label>Empresas existentes</Label>
                <Input
                  value={companyLinkSearch}
                  onChange={(e) => setCompanyLinkSearch(e.target.value)}
                  placeholder="Pesquisar empresa por nome"
                />
                <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-layout-border bg-layout-card p-2">
                  {filteredCompanyOptions.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-layout-body">
                      <input
                        type="checkbox"
                        checked={createForm.watch("companyIds").includes(c.id)}
                        onChange={(e) => {
                          const current = createForm.getValues("companyIds");
                          const next = e.target.checked
                            ? [...current, c.id]
                            : current.filter((id) => id !== c.id);
                          createForm.setValue("companyIds", next, { shouldValidate: true });
                        }}
                      />
                      <span className="text-sm">{c.name}</span>
                    </label>
                  ))}
                  {filteredCompanyOptions.length === 0 && (
                    <p className="px-2 py-1 text-sm text-text-secondary">Nenhuma empresa encontrada.</p>
                  )}
                </div>
                {createForm.formState.errors.companyIds && (
                  <p className="text-xs text-feedback-error">{createForm.formState.errors.companyIds.message}</p>
                )}
              </div>
            )}
            {createForm.watch("companyMode") === "create" && (
              <>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Nome da empresa</Label>
                  <Input {...createForm.register("companyName")} />
                  {createForm.formState.errors.companyName && (
                    <p className="text-xs text-feedback-error">{createForm.formState.errors.companyName.message}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>CNPJ</Label>
                  <Controller
                    name="companyCnpj"
                    control={createForm.control}
                    render={({ field }) => (
                      <Input {...field} onChange={(e) => field.onChange(maskCnpjInput(e.target.value))} inputMode="numeric" />
                    )}
                  />
                  {createForm.formState.errors.companyCnpj && (
                    <p className="text-xs text-feedback-error">{createForm.formState.errors.companyCnpj.message}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Telefone da empresa</Label>
                  <Controller
                    name="companyPhone"
                    control={createForm.control}
                    render={({ field }) => (
                      <Input {...field} onChange={(e) => field.onChange(maskPhoneBrInput(e.target.value))} inputMode="tel" />
                    )}
                  />
                  {createForm.formState.errors.companyPhone && (
                    <p className="text-xs text-feedback-error">{createForm.formState.errors.companyPhone.message}</p>
                  )}
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>E-mail da empresa</Label>
                  <Input type="email" {...createForm.register("companyEmail")} />
                  {createForm.formState.errors.companyEmail && (
                    <p className="text-xs text-feedback-error">{createForm.formState.errors.companyEmail.message}</p>
                  )}
                </div>
              </>
            )}
            </div>
            <div className="sm:col-span-2 rounded-lg border border-layout-border p-3">
              <p className="mb-3 text-sm font-semibold">Segurança</p>
            <div className="space-y-1 sm:col-span-2">
              <Label>Senha</Label>
              <div className="relative">
                <Input
                  type={showCreatePassword ? "text" : "password"}
                  autoComplete="new-password"
                  className="pr-10"
                  {...createForm.register("password")}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                  onClick={() => setShowCreatePassword((v) => !v)}
                  aria-label={showCreatePassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showCreatePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-text-secondary">Mínimo 8 caracteres, com letra maiúscula, minúscula e número.</p>
              {createForm.formState.errors.password && (
                <p className="text-xs text-feedback-error">{createForm.formState.errors.password.message}</p>
              )}
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Confirmar senha</Label>
              <div className="relative">
                <Input
                  type={showCreateConfirmPassword ? "text" : "password"}
                  className="pr-10"
                  {...createForm.register("confirmPassword")}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                  onClick={() => setShowCreateConfirmPassword((v) => !v)}
                  aria-label={showCreateConfirmPassword ? "Ocultar confirmação de senha" : "Mostrar confirmação de senha"}
                >
                  {showCreateConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {createForm.formState.errors.confirmPassword && (
                <p className="text-xs text-feedback-error">{createForm.formState.errors.confirmPassword.message}</p>
              )}
            </div>
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={createMut.isPending}>
                {createMut.isPending ? "Salvando…" : "Salvar"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pwUser} onOpenChange={(o) => !o && setPwUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
            <DialogDescription>
              {pwUser ? (
                <>
                  Usuário: <strong>{pwUser.name}</strong> — como administrador do sistema, a senha atual não é
                  necessária.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={pwForm.handleSubmit((data) => {
              if (!pwUser) return;
              passwordMut.mutate({ userId: pwUser.id, newPassword: data.newPassword });
            })}
          >
            <div className="space-y-1">
              <Label>Nova senha</Label>
              <Input type="password" autoComplete="new-password" {...pwForm.register("newPassword")} />
              {pwForm.formState.errors.newPassword && (
                <p className="text-xs text-feedback-error">{pwForm.formState.errors.newPassword.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Confirmar nova senha</Label>
              <Input type="password" {...pwForm.register("confirmPassword")} />
              {pwForm.formState.errors.confirmPassword && (
                <p className="text-xs text-feedback-error">{pwForm.formState.errors.confirmPassword.message}</p>
              )}
            </div>
            <Button type="submit" disabled={passwordMut.isPending}>
              {passwordMut.isPending ? "Salvando…" : "Atualizar senha"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <UserStatusConfirmDialog
        open={!!deactivateUser}
        onOpenChange={(open) => !open && setDeactivateUser(null)}
        title="Desativar usuário"
        description={
          deactivateUser
            ? `Tem certeza que deseja desativar ${deactivateUser.name}?`
            : "Tem certeza que deseja desativar este usuário?"
        }
        confirmLabel="Confirmar desativação"
        onConfirm={() => {
          if (!deactivateUser) return;
          deactivateMut.mutate(deactivateUser.id);
          setDeactivateUser(null);
        }}
      />

      <UserStatusConfirmDialog
        open={!!activateUser}
        onOpenChange={(open) => !open && setActivateUser(null)}
        title="Ativar usuário"
        description={
          activateUser
            ? `Tem certeza que deseja ativar ${activateUser.name}?`
            : "Tem certeza que deseja ativar este usuário?"
        }
        confirmLabel="Confirmar ativação"
        onConfirm={() => {
          if (!activateUser) return;
          activateMut.mutate(activateUser.id);
          setActivateUser(null);
        }}
      />
    </div>
    </TooltipProvider>
  );
}
