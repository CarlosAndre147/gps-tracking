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
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { isApiError, unwrapData } from "@/lib/api-result";
import { api } from "@/lib/api";
import { fetchCompaniesOptions, linkUserToCompany, unlinkUserFromCompany } from "@/lib/backend-fetch";
import { formatPhoneDisplay, maskCpfForList, maskCpfInput, maskPhoneBrInput } from "@/lib/masks";
import { useAuthStore } from "@/store/auth.store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

type UserDetail = {
  id: string;
  name: string;
  email: string;
  cpf: string;
  phone: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  companies: { id: string; name: string; cnpj: string; email: string; phone: string }[];
  recentSessions: { id: string; startedAt: string; stoppedAt: string | null; source: string }[];
};

const strongPassword = z
  .string()
  .min(8, "Mínimo 8 caracteres")
  .regex(/[A-Z]/, "Inclua uma letra maiúscula")
  .regex(/[a-z]/, "Inclua uma letra minúscula")
  .regex(/[0-9]/, "Inclua um número");

const passwordSelfSchema = z
  .object({
    currentPassword: z.string().min(1, "Senha atual obrigatória"),
    newPassword: strongPassword,
    confirmPassword: z.string().min(1, "Confirme a senha"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { message: "Senhas não conferem", path: ["confirmPassword"] });

const passwordAdminSchema = z
  .object({
    newPassword: strongPassword,
    confirmPassword: z.string().min(1, "Confirme a senha"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { message: "Senhas não conferem", path: ["confirmPassword"] });

type PasswordSelfForm = z.infer<typeof passwordSelfSchema>;
type PasswordAdminForm = z.infer<typeof passwordAdminSchema>;

function isValidCpf(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const calcCheckDigit = (base: string, factor: number) => {
    let total = 0;
    for (const char of base) {
      total += Number(char) * factor--;
    }
    const mod = (total * 10) % 11;
    return mod === 10 ? 0 : mod;
  };

  const check1 = calcCheckDigit(digits.slice(0, 9), 10);
  const check2 = calcCheckDigit(digits.slice(0, 10), 11);
  return check1 === Number(digits[9]) && check2 === Number(digits[10]);
}

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const [edit, setEdit] = useState({ name: "", email: "", cpf: "", phone: "" });
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [linkCompanyId, setLinkCompanyId] = useState("");
  const [confirmDeactivateOpen, setConfirmDeactivateOpen] = useState(false);
  const [unlinkCompany, setUnlinkCompany] = useState<{ id: string; name: string } | null>(null);

  const userQuery = useQuery({
    queryKey: ["user", id],
    enabled: !!id,
    queryFn: async () => {
      const res = await api.users({ id: id! }).get();
      const body = res.data as unknown;
      if (res.status !== 200 || !body || isApiError(body)) {
        throw new Error(isApiError(body) ? body.error.message : "Usuário não encontrado");
      }
      return unwrapData<UserDetail>(body);
    },
  });

  const companiesOptionsQuery = useQuery({
    queryKey: ["companies-options", "user-detail", id],
    enabled: !!id && !!me,
    queryFn: fetchCompaniesOptions,
  });

  const user = userQuery.data;
  const isSelf = me?.id === user?.id;

  const selfPwForm = useForm<PasswordSelfForm>({
    resolver: zodResolver(passwordSelfSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const adminPwForm = useForm<PasswordAdminForm>({
    resolver: zodResolver(passwordAdminSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  useEffect(() => {
    if (user && !isEditingProfile) {
      setEdit({
        name: user.name,
        email: user.email,
        cpf: maskCpfInput(user.cpf),
        phone: formatPhoneDisplay(user.phone),
      });
    }
  }, [user, isEditingProfile]);

  const updateMut = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("id");
      const res = await api.users({ id }).put({
        name: edit.name.trim(),
        email: edit.email.trim(),
        cpf: edit.cpf.trim(),
        phone: edit.phone.replace(/\D/g, ""),
      });
      const body = res.data as unknown;
      if (res.status !== 200 || !body || isApiError(body)) {
        if (res.status === 422) {
          throw new Error("CPF inválido. Use o formato 000.000.000-00.");
        }
        throw new Error(isApiError(body) ? body.error.message : "Falha ao atualizar");
      }
      return unwrapData(body);
    },
    onSuccess: () => {
      toast.success("Usuário atualizado");
      setIsEditingProfile(false);
      void qc.invalidateQueries({ queryKey: ["user", id] });
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const passwordMut = useMutation({
    mutationFn: async (payload: { currentPassword?: string; newPassword: string }) => {
      if (!id) throw new Error("id");
      const res = await api.users({ id }).password.patch({
        currentPassword: payload.currentPassword,
        newPassword: payload.newPassword,
      });
      const body = res.data as unknown;
      if (res.status !== 200 || !body || isApiError(body)) {
        throw new Error(isApiError(body) ? body.error.message : "Falha ao alterar senha");
      }
    },
    onSuccess: () => {
      toast.success("Senha alterada (sessões revogadas)");
      selfPwForm.reset();
      adminPwForm.reset();
      void qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deactivateMut = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("id");
      const res = await api.users({ id }).delete();
      const body = res.data as unknown;
      if (res.status !== 200 || !body || isApiError(body)) {
        throw new Error(isApiError(body) ? body.error.message : "Falha ao desativar");
      }
    },
    onSuccess: () => {
      toast.success("Usuário desativado");
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      navigate("/admin/users");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const linkCompanyMut = useMutation({
    mutationFn: async (companyId: string) => {
      if (!id) throw new Error("id");
      await linkUserToCompany(companyId, id);
    },
    onSuccess: () => {
      toast.success("Empresa vinculada");
      setLinkCompanyId("");
      void qc.invalidateQueries({ queryKey: ["user", id] });
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unlinkCompanyMut = useMutation({
    mutationFn: async (companyId: string) => {
      if (!id) throw new Error("id");
      await unlinkUserFromCompany(companyId, id);
    },
    onSuccess: () => {
      toast.success("Vínculo removido");
      void qc.invalidateQueries({ queryKey: ["user", id] });
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (userQuery.isLoading || !user) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const linkedIds = new Set(user.companies.map((c) => c.id));
  const linkableCompanies = (companiesOptionsQuery.data ?? []).filter((c) => !linkedIds.has(c.id));
  const cpfIsComplete = edit.cpf.replace(/\D/g, "").length === 11;
  const cpfIsValid = isValidCpf(edit.cpf);
  const cpfError = isEditingProfile && cpfIsComplete && !cpfIsValid ? "CPF inválido." : "";
  const disableSaveProfile = updateMut.isPending || !cpfIsValid;

  return (
    <TooltipProvider delayDuration={120}>
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/admin/users" className="text-sm text-text-secondary hover:text-brand-primary">
          ← Voltar
        </Link>
        <h1 className="text-2xl font-semibold">{user.name}</h1>
        <Badge variant={user.isActive ? "success" : "muted"}>{user.isActive ? "Ativo" : "Inativo"}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Perfil</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Nome</Label>
            <Input
              value={edit.name}
              onChange={(e) => setEdit((x) => ({ ...x, name: e.target.value }))}
              disabled={!isEditingProfile}
            />
          </div>
          <div className="space-y-1">
            <Label>E-mail</Label>
            <Input
              value={edit.email}
              onChange={(e) => setEdit((x) => ({ ...x, email: e.target.value }))}
              disabled={!isEditingProfile}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="user-cpf">CPF</Label>
            <Input
              id="user-cpf"
              value={isEditingProfile ? edit.cpf : maskCpfForList(user.cpf)}
              onChange={(e) => setEdit((x) => ({ ...x, cpf: maskCpfInput(e.target.value) }))}
              inputMode="numeric"
              disabled={!isEditingProfile}
            />
            {cpfError && <p className="text-xs text-feedback-error">{cpfError}</p>}
          </div>
          <div className="space-y-1">
            <Label>Telefone</Label>
            <Input
              value={edit.phone}
              onChange={(e) => setEdit((x) => ({ ...x, phone: maskPhoneBrInput(e.target.value) }))}
              inputMode="tel"
              disabled={!isEditingProfile}
            />
          </div>
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            {!isEditingProfile ? (
              <Button type="button" onClick={() => setIsEditingProfile(true)}>
                Editar
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsEditingProfile(false);
                    setEdit({
                      name: user.name,
                      email: user.email,
                      cpf: maskCpfInput(user.cpf),
                      phone: formatPhoneDisplay(user.phone),
                    });
                  }}
                >
                  Cancelar
                </Button>
                <Button type="button" onClick={() => updateMut.mutate()} disabled={disableSaveProfile}>
                  Salvar
                </Button>
              </>
            )}
            {!isSelf && (
              <Button
                variant="destructive"
                className="bg-red-600 hover:bg-red-700"
                disabled={!user.isActive || deactivateMut.isPending}
                onClick={() => setConfirmDeactivateOpen(true)}
              >
                Desativar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{isSelf ? "Alterar sua senha" : "Redefinir senha (admin)"}</CardTitle>
        </CardHeader>
        <CardContent>
          {isSelf ? (
            <form
              className="grid max-w-md gap-3"
              onSubmit={selfPwForm.handleSubmit((data) =>
                passwordMut.mutate({ currentPassword: data.currentPassword, newPassword: data.newPassword }),
              )}
            >
              <div className="space-y-1">
                <Label>Senha atual</Label>
                <Input type="password" autoComplete="current-password" {...selfPwForm.register("currentPassword")} />
                {selfPwForm.formState.errors.currentPassword && (
                  <p className="text-xs text-feedback-error">{selfPwForm.formState.errors.currentPassword.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Nova senha</Label>
                <Input type="password" autoComplete="new-password" {...selfPwForm.register("newPassword")} />
                {selfPwForm.formState.errors.newPassword && (
                  <p className="text-xs text-feedback-error">{selfPwForm.formState.errors.newPassword.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Confirmar nova senha</Label>
                <Input type="password" {...selfPwForm.register("confirmPassword")} />
                {selfPwForm.formState.errors.confirmPassword && (
                  <p className="text-xs text-feedback-error">{selfPwForm.formState.errors.confirmPassword.message}</p>
                )}
              </div>
              <Button type="submit" disabled={passwordMut.isPending}>
                Atualizar senha
              </Button>
            </form>
          ) : (
            <form
              className="grid max-w-md gap-3"
              onSubmit={adminPwForm.handleSubmit((data) => passwordMut.mutate({ newPassword: data.newPassword }))}
            >
              <p className="text-sm text-text-secondary">
                Como administrador do sistema, você pode redefinir a senha sem informar a senha atual do usuário.
              </p>
              <div className="space-y-1">
                <Label>Nova senha</Label>
                <Input type="password" autoComplete="new-password" {...adminPwForm.register("newPassword")} />
                {adminPwForm.formState.errors.newPassword && (
                  <p className="text-xs text-feedback-error">{adminPwForm.formState.errors.newPassword.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Confirmar nova senha</Label>
                <Input type="password" {...adminPwForm.register("confirmPassword")} />
                {adminPwForm.formState.errors.confirmPassword && (
                  <p className="text-xs text-feedback-error">{adminPwForm.formState.errors.confirmPassword.message}</p>
                )}
              </div>
              <Button type="submit" disabled={passwordMut.isPending}>
                Atualizar senha
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Empresas vinculadas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-1">
              <Label>Vincular empresa</Label>
              <select
                className="flex h-10 w-full rounded-md border border-layout-border bg-layout-card px-3 text-sm"
                value={linkCompanyId}
                onChange={(e) => setLinkCompanyId(e.target.value)}
              >
                <option value="">Selecione…</option>
                {linkableCompanies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {companiesOptionsQuery.isError && (
                <p className="text-xs text-feedback-error">
                  {companiesOptionsQuery.error instanceof Error
                    ? companiesOptionsQuery.error.message
                    : "Falha ao carregar empresas para vínculo."}
                </p>
              )}
              {!companiesOptionsQuery.isLoading && !companiesOptionsQuery.isError && linkableCompanies.length === 0 && (
                <p className="text-xs text-text-secondary">
                  Não há empresas disponíveis para vincular (todas já estão vinculadas ou sem cadastro).
                </p>
              )}
            </div>
            <Button
              disabled={!linkCompanyId || linkCompanyMut.isPending}
              onClick={() => linkCompanyId && linkCompanyMut.mutate(linkCompanyId)}
            >
              Vincular
            </Button>
          </div>
          <ul className="divide-y divide-layout-border rounded-lg border border-layout-border">
            {user.companies.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <div>
                  <Link to={`/admin/companies/${c.id}`} className="font-medium text-brand-secondary hover:underline">
                    {c.name}
                  </Link>
                  <div className="text-xs text-text-secondary">{c.cnpj}</div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-feedback-error"
                  disabled={unlinkCompanyMut.isPending}
                  onClick={() => setUnlinkCompany({ id: c.id, name: c.name })}
                >
                  Remover
                </Button>
              </li>
            ))}
            {user.companies.length === 0 && (
              <li className="px-3 py-4 text-sm text-text-secondary">Nenhuma empresa vinculada.</li>
            )}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sessões recentes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-text-secondary">
          {user.recentSessions.map((s) => (
            <div key={s.id} className="flex justify-between border-b border-layout-border/80 py-2">
              <span>
                {new Date(s.startedAt).toLocaleString("pt-BR")}
              </span>
              <span>{s.stoppedAt ? "Encerrada" : "Em andamento"}</span>
            </div>
          ))}
          {user.recentSessions.length === 0 && <p>Nenhuma sessão.</p>}
        </CardContent>
      </Card>
      <AlertDialog open={confirmDeactivateOpen} onOpenChange={setConfirmDeactivateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar usuário</AlertDialogTitle>
            <AlertDialogDescription>
              O usuário perderá acesso até ser reativado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deactivateMut.mutate();
                setConfirmDeactivateOpen(false);
              }}
            >
              Confirmar desativação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!unlinkCompany} onOpenChange={(open) => !open && setUnlinkCompany(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover vínculo de empresa</AlertDialogTitle>
            <AlertDialogDescription>
              {unlinkCompany
                ? `Tem certeza que deseja remover o vínculo com ${unlinkCompany.name}?`
                : "Tem certeza que deseja remover este vínculo?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!unlinkCompany) return;
                unlinkCompanyMut.mutate(unlinkCompany.id);
                setUnlinkCompany(null);
              }}
            >
              Confirmar remoção
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TooltipProvider>
  );
}
