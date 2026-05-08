import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDebouncedValue } from "@/lib/debounce";
import { isValidCpf, normalizeCpf } from "@/lib/br-documents";
import { formatPhoneDisplay, maskCpfInput, maskPhoneBrInput } from "@/lib/masks";
import { api } from "@/lib/api";
import { isApiError, unwrapData, unwrapPaginated } from "@/lib/api-result";
import { roleLabelPtBr } from "@/lib/role-label";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserMinus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { cn } from "@/lib/utils";

type CompanyDetail = {
  id: string;
  name: string;
  cnpj: string;
  email: string;
  phone: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  users: {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
    isActive: boolean;
    trackingActive: boolean;
  }[];
};

type UserSearchRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
};

type MemberRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  isActive: boolean;
  trackingActive: boolean;
};

const strongPassword = z
  .string()
  .min(8, "Mínimo 8 caracteres")
  .regex(/[A-Z]/, "Inclua uma letra maiúscula")
  .regex(/[a-z]/, "Inclua uma letra minúscula")
  .regex(/[0-9]/, "Inclua um número");

const createMemberSchema = z
  .object({
    name: z.string().min(1, "Nome obrigatório"),
    email: z.string().email("E-mail inválido"),
    cpf: z.string().refine((v) => isValidCpf(v), "CPF inválido"),
    phone: z
      .string()
      .min(1, "Telefone obrigatório")
      .refine((v) => v.replace(/\D/g, "").length >= 10, "Telefone inválido"),
    password: strongPassword,
    confirmPassword: z.string().min(1, "Confirme a senha"),
    role: z.enum(["COMPANY_ADMIN", "USER"]),
  })
  .refine((d) => d.password === d.confirmPassword, { message: "Senhas não conferem", path: ["confirmPassword"] });

type CreateMemberForm = z.infer<typeof createMemberSchema>;

function roleBadgeClass(role: string): string {
  if (role === "SYSTEM_ADMIN") return "bg-brand-secondary/25 text-brand-secondary";
  if (role === "COMPANY_ADMIN") return "bg-feedback-success/20 text-brand-secondary";
  return "bg-layout-border/80 text-text-secondary";
}

export function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [edit, setEdit] = useState({ name: "", email: "", phone: "" });
  const [addOpen, setAddOpen] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const debouncedUserSearch = useDebouncedValue(userSearch, 300);
  const [memberSearch, setMemberSearch] = useState("");
  const debouncedMemberSearch = useDebouncedValue(memberSearch, 300);
  const [membersPage, setMembersPage] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [confirmDeactivateCompany, setConfirmDeactivateCompany] = useState(false);
  const [confirmActivateCompany, setConfirmActivateCompany] = useState(false);
  const [unlinkUser, setUnlinkUser] = useState<{ id: string; name: string } | null>(null);

  const companyQuery = useQuery({
    queryKey: ["company", id],
    enabled: !!id,
    queryFn: async () => {
      const res = await api.companies({ id: id! }).get();
      const body = res.data as unknown;
      if (res.status !== 200 || !body || isApiError(body)) {
        throw new Error(isApiError(body) ? body.error.message : "Empresa não encontrada");
      }
      return unwrapData<CompanyDetail>(body);
    },
  });

  const company = companyQuery.data;

  const memberIds = useMemo(() => new Set((company?.users ?? []).map((u) => u.id)), [company?.users]);

  const userSearchQuery = useQuery({
    queryKey: ["users-search", debouncedUserSearch],
    enabled: addOpen && debouncedUserSearch.trim().length >= 2,
    queryFn: async () => {
      const res = await api.users.get({
        query: {
          search: debouncedUserSearch.trim(),
          page: 1,
          limit: 20,
        },
      });
      const body = res.data as unknown;
      if (res.status !== 200 || !body || isApiError(body)) {
        throw new Error(isApiError(body) ? body.error.message : "Falha na busca");
      }
      return unwrapPaginated<UserSearchRow>(body);
    },
  });

  const membersQuery = useQuery({
    queryKey: ["company-members", id, membersPage, debouncedMemberSearch],
    enabled: !!id,
    queryFn: async () => {
      const res = await api.companies({ id: id! }).users.get({
        query: {
          page: membersPage,
          limit: 20,
          search: debouncedMemberSearch.trim() || undefined,
        },
      });
      const body = res.data as unknown;
      if (res.status !== 200 || !body || isApiError(body)) {
        throw new Error(isApiError(body) ? body.error.message : "Falha ao carregar membros");
      }
      return unwrapPaginated<MemberRow>(body);
    },
  });

  useEffect(() => {
    if (company) {
      setEdit({ name: company.name, email: company.email, phone: formatPhoneDisplay(company.phone) });
    }
  }, [company]);

  useEffect(() => {
    if (!addOpen) {
      setUserSearch("");
      setSelectedUserId(null);
    }
  }, [addOpen]);

  useEffect(() => {
    setMembersPage(1);
  }, [debouncedMemberSearch]);

  const createMemberForm = useForm<CreateMemberForm>({
    resolver: zodResolver(createMemberSchema),
    defaultValues: {
      name: "",
      email: "",
      cpf: "",
      phone: "",
      password: "",
      confirmPassword: "",
      role: "USER",
    },
  });

  useEffect(() => {
    if (addOpen) {
      createMemberForm.reset({
        name: "",
        email: "",
        cpf: "",
        phone: "",
        password: "",
        confirmPassword: "",
        role: "USER",
      });
    }
  }, [addOpen, createMemberForm]);

  const updateMut = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("id");
      const res = await api.companies({ id }).put({
        name: edit.name.trim(),
        email: edit.email.trim(),
        phone: edit.phone.replace(/\D/g, ""),
      });
      const body = res.data as unknown;
      if (res.status !== 200 || !body || isApiError(body)) {
        throw new Error(isApiError(body) ? body.error.message : "Falha ao atualizar");
      }
      return unwrapData(body);
    },
    onSuccess: () => {
      toast.success("Empresa atualizada");
      void qc.invalidateQueries({ queryKey: ["company", id] });
      void qc.invalidateQueries({ queryKey: ["companies"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deactivateMut = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("id");
      const res = await api.companies({ id }).delete();
      const body = res.data as unknown;
      if (res.status !== 200 || !body || isApiError(body)) {
        throw new Error(isApiError(body) ? body.error.message : "Não foi possível desativar");
      }
    },
    onSuccess: () => {
      toast.success("Empresa desativada");
      void qc.invalidateQueries({ queryKey: ["companies"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      navigate("/admin/companies");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activateMut = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("id");
      const res = await api.companies({ id }).activate.patch();
      const body = res.data as unknown;
      if (res.status !== 200 || !body || isApiError(body)) {
        throw new Error(isApiError(body) ? body.error.message : "Não foi possível ativar");
      }
    },
    onSuccess: () => {
      toast.success("Empresa ativada");
      void qc.invalidateQueries({ queryKey: ["company", id] });
      void qc.invalidateQueries({ queryKey: ["companies"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const linkMut = useMutation({
    mutationFn: async (userId: string) => {
      if (!id) throw new Error("id");
      const res = await api.companies({ id }).users.post({
        mode: "link",
        userId,
      });
      const body = res.data as unknown;
      if ((res.status !== 200 && res.status !== 201) || !body || isApiError(body)) {
        throw new Error(isApiError(body) ? body.error.message : "Falha ao vincular");
      }
    },
    onSuccess: () => {
      toast.success("Usuário vinculado");
      setSelectedUserId(null);
      setUserSearch("");
      void qc.invalidateQueries({ queryKey: ["company", id] });
      void qc.invalidateQueries({ queryKey: ["company-members", id] });
      void qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createMemberMut = useMutation({
    mutationFn: async (data: CreateMemberForm) => {
      if (!id) throw new Error("id");
      const res = await api.companies({ id }).users.post({
        mode: "create",
        user: {
          name: data.name.trim(),
          email: data.email.trim().toLowerCase(),
          cpf: normalizeCpf(data.cpf),
          phone: data.phone.replace(/\D/g, ""),
          password: data.password,
          role: data.role,
        },
      });
      const body = res.data as unknown;
      if ((res.status !== 200 && res.status !== 201) || !body || isApiError(body)) {
        throw new Error(isApiError(body) ? body.error.message : "Falha ao criar usuário");
      }
    },
    onSuccess: () => {
      toast.success("Usuário criado e vinculado");
      setAddOpen(false);
      void qc.invalidateQueries({ queryKey: ["company", id] });
      void qc.invalidateQueries({ queryKey: ["company-members", id] });
      void qc.invalidateQueries({ queryKey: ["companies"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unlinkMut = useMutation({
    mutationFn: async (userId: string) => {
      if (!id) throw new Error("id");
      const res = await api.companies({ id }).users({ userId }).delete();
      const body = res.data as unknown;
      if (res.status !== 200 || !body || isApiError(body)) {
        throw new Error(isApiError(body) ? body.error.message : "Falha ao remover vínculo");
      }
    },
    onSuccess: () => {
      toast.success("Vínculo removido");
      void qc.invalidateQueries({ queryKey: ["company", id] });
      void qc.invalidateQueries({ queryKey: ["company-members", id] });
      void qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (companyQuery.isLoading || !company) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const searchItems = (userSearchQuery.data?.items ?? []).filter(
    (u) => u.role !== "SYSTEM_ADMIN" && !memberIds.has(u.id) && u.isActive,
  );
  const members = membersQuery.data?.items ?? [];
  const membersMeta = membersQuery.data?.meta;
  const totalMembers = membersMeta?.total ?? company.users.length;
  const membersPageCount = Math.max(
    1,
    Math.ceil((membersMeta?.total ?? members.length) / Math.max(1, membersMeta?.limit ?? 20)),
  );
  const canPrevMembers = (membersMeta?.page ?? 1) > 1;
  const canNextMembers = (membersMeta?.page ?? 1) < membersPageCount;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/admin/companies" className="text-sm text-text-secondary hover:text-brand-primary">
          ← Voltar
        </Link>
        <h1 className="text-2xl font-semibold">{company.name}</h1>
        <Badge variant={company.isActive ? "success" : "muted"}>{company.isActive ? "Ativa" : "Inativa"}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label>Nome</Label>
            <Input value={edit.name} onChange={(e) => setEdit((x) => ({ ...x, name: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>CNPJ</Label>
            <Input value={company.cnpj} disabled className="opacity-60" />
          </div>
          <div className="space-y-1">
            <Label>E-mail</Label>
            <Input value={edit.email} onChange={(e) => setEdit((x) => ({ ...x, email: e.target.value }))} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Telefone</Label>
            <Input
              value={edit.phone}
              onChange={(e) => setEdit((x) => ({ ...x, phone: maskPhoneBrInput(e.target.value) }))}
              inputMode="tel"
            />
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button onClick={() => updateMut.mutate()} disabled={updateMut.isPending}>
              Salvar alterações
            </Button>
            {company.isActive ? (
              <Button
                variant="destructive"
                className="bg-red-600 hover:bg-red-700"
                disabled={deactivateMut.isPending}
                onClick={() => setConfirmDeactivateCompany(true)}
              >
                Desativar empresa
              </Button>
            ) : (
              <Button
                variant="outline"
                className="text-feedback-success hover:text-feedback-success"
                disabled={activateMut.isPending}
                onClick={() => setConfirmActivateCompany(true)}
              >
                Ativar empresa
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Membros ({totalMembers})</h2>
        <Button type="button" onClick={() => setAddOpen(true)} disabled={!company.isActive}>
          Adicionar usuário
        </Button>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="border-b border-layout-border p-4">
            <Label htmlFor="members-search">Buscar membros</Label>
            <Input
              id="members-search"
              className="mt-1"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Nome, e-mail ou telefone"
              autoComplete="off"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-layout-border bg-layout-body text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">E-mail</th>
                  <th className="px-4 py-3">Telefone</th>
                  <th className="px-4 py-3">Papel</th>
                  <th className="px-4 py-3">Conta</th>
                  <th className="px-4 py-3">Rastreio</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {members.map((u) => (
                  <tr key={u.id} className="border-b border-layout-border/80">
                    <td className="px-4 py-3 font-medium">{u.name}</td>
                    <td className="px-4 py-3 text-text-secondary">{u.email}</td>
                    <td className="px-4 py-3 text-text-secondary">{formatPhoneDisplay(u.phone)}</td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", roleBadgeClass(u.role))}>
                        {roleLabelPtBr(u.role)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={u.isActive ? "success" : "muted"}>{u.isActive ? "Ativa" : "Inativa"}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={u.trackingActive ? "success" : "muted"}>
                        {u.trackingActive ? "Ativo" : "Parado"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="inline-flex items-center whitespace-nowrap"
                        disabled={unlinkMut.isPending}
                        onClick={() => setUnlinkUser({ id: u.id, name: u.name })}
                      >
                        <UserMinus className="mr-1 h-3.5 w-3.5" />
                        Remover
                      </Button>
                    </td>
                  </tr>
                ))}
                {!membersQuery.isLoading && members.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-text-secondary">
                      Nenhum membro encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-layout-border px-4 py-3 text-sm">
            <span className="text-text-secondary">
              Página {membersMeta?.page ?? 1} de {membersPageCount}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!canPrevMembers || membersQuery.isFetching}
                onClick={() => setMembersPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!canNextMembers || membersQuery.isFetching}
                onClick={() => setMembersPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Adicionar usuário à empresa</SheetTitle>
          </SheetHeader>
          <Tabs defaultValue="existing" className="mt-2">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="existing">Usuário existente</TabsTrigger>
              <TabsTrigger value="new">Novo usuário</TabsTrigger>
            </TabsList>
            <TabsContent value="existing" className="space-y-3">
              <div className="space-y-1">
                <Label>Buscar por nome ou e-mail</Label>
                <Input
                  value={userSearch}
                  onChange={(e) => {
                    setUserSearch(e.target.value);
                    setSelectedUserId(null);
                  }}
                  placeholder="Mínimo 2 caracteres"
                  autoComplete="off"
                />
              </div>
              {debouncedUserSearch.trim().length >= 2 && userSearchQuery.isLoading && (
                <p className="text-sm text-text-secondary">Buscando…</p>
              )}
              {debouncedUserSearch.trim().length >= 2 && !userSearchQuery.isLoading && searchItems.length === 0 && (
                <p className="text-sm text-text-secondary">Nenhum usuário encontrado ou todos já vinculados.</p>
              )}
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-layout-border p-1">
                {searchItems.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      className={cn(
                        "w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-layout-body",
                        selectedUserId === u.id && "bg-brand-primary/15 ring-1 ring-brand-primary/40",
                      )}
                      onClick={() => setSelectedUserId(u.id)}
                    >
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs text-text-secondary">{u.email}</div>
                    </button>
                  </li>
                ))}
              </ul>
              <Button
                disabled={!selectedUserId || linkMut.isPending}
                onClick={() => selectedUserId && linkMut.mutate(selectedUserId)}
              >
                {linkMut.isPending ? "Vinculando…" : "Vincular usuário"}
              </Button>
            </TabsContent>
            <TabsContent value="new">
              <form
                className="mt-2 space-y-3"
                onSubmit={createMemberForm.handleSubmit((data) => createMemberMut.mutate(data))}
              >
                <div className="space-y-1">
                  <Label>Nome</Label>
                  <Input {...createMemberForm.register("name")} />
                  {createMemberForm.formState.errors.name && (
                    <p className="text-xs text-feedback-error">{createMemberForm.formState.errors.name.message}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>E-mail</Label>
                  <Input type="email" {...createMemberForm.register("email")} />
                  {createMemberForm.formState.errors.email && (
                    <p className="text-xs text-feedback-error">{createMemberForm.formState.errors.email.message}</p>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>CPF</Label>
                    <Controller
                      name="cpf"
                      control={createMemberForm.control}
                      render={({ field }) => (
                        <Input
                          {...field}
                          onChange={(e) => field.onChange(maskCpfInput(e.target.value))}
                          inputMode="numeric"
                        />
                      )}
                    />
                    {createMemberForm.formState.errors.cpf && (
                      <p className="text-xs text-feedback-error">{createMemberForm.formState.errors.cpf.message}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label>Telefone</Label>
                    <Controller
                      name="phone"
                      control={createMemberForm.control}
                      render={({ field }) => (
                        <Input
                          {...field}
                          onChange={(e) => field.onChange(maskPhoneBrInput(e.target.value))}
                          inputMode="tel"
                        />
                      )}
                    />
                    {createMemberForm.formState.errors.phone && (
                      <p className="text-xs text-feedback-error">{createMemberForm.formState.errors.phone.message}</p>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Papel na empresa</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-layout-border bg-layout-card px-3 text-sm"
                    {...createMemberForm.register("role")}
                  >
                    <option value="USER">Usuário</option>
                    <option value="COMPANY_ADMIN">Admin da empresa</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Senha inicial</Label>
                  <Input type="password" autoComplete="new-password" {...createMemberForm.register("password")} />
                  {createMemberForm.formState.errors.password && (
                    <p className="text-xs text-feedback-error">{createMemberForm.formState.errors.password.message}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Confirmar senha</Label>
                  <Input type="password" {...createMemberForm.register("confirmPassword")} />
                  {createMemberForm.formState.errors.confirmPassword && (
                    <p className="text-xs text-feedback-error">
                      {createMemberForm.formState.errors.confirmPassword.message}
                    </p>
                  )}
                </div>
                <Button type="submit" disabled={createMemberMut.isPending}>
                  {createMemberMut.isPending ? "Criando…" : "Criar e vincular"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>
      <AlertDialog open={confirmDeactivateCompany} onOpenChange={setConfirmDeactivateCompany}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar empresa</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação só é permitida se não houver usuários ativos vinculados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deactivateMut.mutate();
                setConfirmDeactivateCompany(false);
              }}
            >
              Confirmar desativação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmActivateCompany} onOpenChange={setConfirmActivateCompany}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ativar empresa</AlertDialogTitle>
            <AlertDialogDescription>
              A empresa voltará a ficar disponível para operações e vínculos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                activateMut.mutate();
                setConfirmActivateCompany(false);
              }}
            >
              Confirmar ativação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!unlinkUser} onOpenChange={(open) => !open && setUnlinkUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover vínculo</AlertDialogTitle>
            <AlertDialogDescription>
              {unlinkUser
                ? `Tem certeza que deseja remover ${unlinkUser.name} desta empresa?`
                : "Tem certeza que deseja remover este vínculo?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!unlinkUser) return;
                unlinkMut.mutate(unlinkUser.id);
                setUnlinkUser(null);
              }}
            >
              Confirmar remoção
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
