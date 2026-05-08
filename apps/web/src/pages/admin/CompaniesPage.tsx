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
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/lib/debounce";
import { isValidCnpj, normalizeCnpj } from "@/lib/br-documents";
import { formatCnpjDisplay, formatPhoneDisplay, maskCnpjInput, maskPhoneBrInput } from "@/lib/masks";
import { api } from "@/lib/api";
import { isApiError, unwrapData, unwrapPaginated } from "@/lib/api-result";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Eye, SquarePen, UserMinus } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { Link } from "react-router";
import { toast } from "sonner";
import { z } from "zod";

type CompanyRow = {
  id: string;
  name: string;
  cnpj: string;
  email: string;
  phone: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  userCount: number;
};

const createSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  cnpj: z.string().refine((v) => isValidCnpj(v), "CNPJ inválido"),
  email: z.string().email("E-mail inválido"),
  phone: z
    .string()
    .min(1, "Telefone obrigatório")
    .refine((v) => v.replace(/\D/g, "").length >= 10, "Telefone inválido"),
});

const editSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  email: z.string().email("E-mail inválido"),
  phone: z
    .string()
    .min(1, "Telefone obrigatório")
    .refine((v) => v.replace(/\D/g, "").length >= 10, "Telefone inválido"),
});

type CreateForm = z.infer<typeof createSchema>;
type EditForm = z.infer<typeof editSchema>;

export function CompaniesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<CompanyRow | null>(null);
  const [deactivateCompany, setDeactivateCompany] = useState<CompanyRow | null>(null);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const listQuery = useQuery({
    queryKey: ["companies", page, debouncedSearch],
    queryFn: async () => {
      const res = await api.companies.get({
        query: {
          page,
          limit: 20,
          search: debouncedSearch.trim() || undefined,
        },
      });
      const body = res.data as unknown;
      if (res.status !== 200 || !body || isApiError(body)) {
        throw new Error(isApiError(body) ? body.error.message : "Falha ao listar empresas");
      }
      return unwrapPaginated<CompanyRow>(body);
    },
  });

  const createForm = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", cnpj: "", email: "", phone: "" },
  });

  const editForm = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: { name: "", email: "", phone: "" },
  });

  useEffect(() => {
    if (editRow) {
      editForm.reset({
        name: editRow.name,
        email: editRow.email,
        phone: formatPhoneDisplay(editRow.phone),
      });
    }
  }, [editRow, editForm]);

  const createMut = useMutation({
    mutationFn: async (data: CreateForm) => {
      const res = await api.companies.post({
        name: data.name.trim(),
        cnpj: normalizeCnpj(data.cnpj),
        email: data.email.trim().toLowerCase(),
        phone: data.phone.replace(/\D/g, ""),
      });
      const body = res.data as unknown;
      if (res.status !== 201 || !body || isApiError(body)) {
        throw new Error(isApiError(body) ? body.error.message : "Não foi possível criar");
      }
      return unwrapData<CompanyRow>(body);
    },
    onSuccess: () => {
      toast.success("Empresa criada");
      setCreateOpen(false);
      createForm.reset();
      void qc.invalidateQueries({ queryKey: ["companies"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: async (payload: EditForm & { id: string }) => {
      const res = await api.companies({ id: payload.id }).put({
        name: payload.name.trim(),
        email: payload.email.trim().toLowerCase(),
        phone: payload.phone.replace(/\D/g, ""),
      });
      const body = res.data as unknown;
      if (res.status !== 200 || !body || isApiError(body)) {
        throw new Error(isApiError(body) ? body.error.message : "Falha ao atualizar");
      }
    },
    onSuccess: () => {
      toast.success("Empresa atualizada");
      setEditRow(null);
      void qc.invalidateQueries({ queryKey: ["companies"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deactivateMut = useMutation({
    mutationFn: async (id: string) => {
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
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { items, meta } = listQuery.data ?? { items: [], meta: { page: 1, limit: 20, total: 0 } };
  const pageCount = Math.max(1, Math.ceil(meta.total / Math.max(1, meta.limit)));
  const canPrev = meta.page > 1;
  const canNext = meta.page < pageCount;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Empresas</h1>
        <Button onClick={() => setCreateOpen(true)}>Nova empresa</Button>
      </div>

      <div className="space-y-1">
        <Label htmlFor="company-search">Buscar por nome</Label>
        <Input
          id="company-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Digite para buscar"
        />
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {listQuery.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="Nenhuma empresa encontrada"
              description="Cadastre uma empresa ou ajuste o filtro de busca."
              action={
                <Button type="button" onClick={() => setCreateOpen(true)}>
                  Nova empresa
                </Button>
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-layout-border bg-layout-body text-xs uppercase text-text-secondary">
                    <tr>
                      <th className="px-4 py-3">Nome</th>
                      <th className="px-4 py-3">CNPJ</th>
                      <th className="px-4 py-3">E-mail</th>
                      <th className="px-4 py-3">Telefone</th>
                      <th className="px-4 py-3">Usuários</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((c) => (
                      <tr key={c.id} className="border-b border-layout-border/80 hover:bg-layout-body">
                        <td className="px-4 py-3 font-medium">{c.name}</td>
                        <td className="px-4 py-3 text-text-secondary">{formatCnpjDisplay(c.cnpj)}</td>
                        <td className="px-4 py-3 text-text-secondary">{c.email}</td>
                        <td className="px-4 py-3 text-text-secondary">{formatPhoneDisplay(c.phone)}</td>
                        <td className="px-4 py-3">{c.userCount}</td>
                        <td className="px-4 py-3">
                          <Badge variant={c.isActive ? "success" : "muted"}>{c.isActive ? "Ativa" : "Inativa"}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-nowrap justify-end gap-1">
                            <Link to={`/admin/companies/${c.id}`}>
                              <Button variant="ghost" size="sm" className="inline-flex items-center whitespace-nowrap">
                                <Eye className="mr-1 h-3.5 w-3.5" />
                                Ver
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="inline-flex items-center whitespace-nowrap"
                              onClick={() => setEditRow(c)}
                              disabled={!c.isActive}
                            >
                              <SquarePen className="mr-1 h-3.5 w-3.5" />
                              Editar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="inline-flex items-center whitespace-nowrap text-feedback-error hover:text-feedback-error"
                              disabled={!c.isActive || deactivateMut.isPending}
                              onClick={() => setDeactivateCompany(c)}
                            >
                              <UserMinus className="mr-1 h-3.5 w-3.5" />
                              Desativar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-layout-border px-4 py-3 text-sm">
                <span className="text-text-secondary">
                  Página {meta.page} de {pageCount}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!canPrev || listQuery.isFetching}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!canNext || listQuery.isFetching}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova empresa</DialogTitle>
            <DialogDescription>Preencha os dados. O CNPJ será validado com dígitos verificadores.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={createForm.handleSubmit((data) => createMut.mutate(data))}
          >
            <div className="space-y-1 sm:col-span-2">
              <Label>Nome</Label>
              <Input {...createForm.register("name")} />
              {createForm.formState.errors.name && (
                <p className="text-xs text-feedback-error">{createForm.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>CNPJ</Label>
              <Controller
                name="cnpj"
                control={createForm.control}
                render={({ field }) => (
                  <Input
                    {...field}
                    onChange={(e) => field.onChange(maskCnpjInput(e.target.value))}
                    inputMode="numeric"
                    autoComplete="off"
                  />
                )}
              />
              {createForm.formState.errors.cnpj && (
                <p className="text-xs text-feedback-error">{createForm.formState.errors.cnpj.message}</p>
              )}
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>E-mail</Label>
              <Input type="email" {...createForm.register("email")} />
              {createForm.formState.errors.email && (
                <p className="text-xs text-feedback-error">{createForm.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Telefone</Label>
              <Controller
                name="phone"
                control={createForm.control}
                render={({ field }) => (
                  <Input
                    {...field}
                    onChange={(e) => field.onChange(maskPhoneBrInput(e.target.value))}
                    inputMode="tel"
                  />
                )}
              />
              {createForm.formState.errors.phone && (
                <p className="text-xs text-feedback-error">{createForm.formState.errors.phone.message}</p>
              )}
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

      <Dialog open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar empresa</DialogTitle>
            <DialogDescription>CNPJ não pode ser alterado.</DialogDescription>
          </DialogHeader>
          {editRow && (
            <form
              className="grid gap-3"
              onSubmit={editForm.handleSubmit((data) => updateMut.mutate({ ...data, id: editRow.id }))}
            >
              <div className="space-y-1">
                <Label>Nome</Label>
                <Input {...editForm.register("name")} />
                {editForm.formState.errors.name && (
                  <p className="text-xs text-feedback-error">{editForm.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>CNPJ</Label>
                <Input value={formatCnpjDisplay(editRow.cnpj)} disabled className="opacity-60" />
              </div>
              <div className="space-y-1">
                <Label>E-mail</Label>
                <Input type="email" {...editForm.register("email")} />
                {editForm.formState.errors.email && (
                  <p className="text-xs text-feedback-error">{editForm.formState.errors.email.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Telefone</Label>
                <Controller
                  name="phone"
                  control={editForm.control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      onChange={(e) => field.onChange(maskPhoneBrInput(e.target.value))}
                      inputMode="tel"
                    />
                  )}
                />
                {editForm.formState.errors.phone && (
                  <p className="text-xs text-feedback-error">{editForm.formState.errors.phone.message}</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={updateMut.isPending}>
                  {updateMut.isPending ? "Salvando…" : "Salvar"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditRow(null)}>
                  Cancelar
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deactivateCompany} onOpenChange={(open) => !open && setDeactivateCompany(null)}>
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
                if (!deactivateCompany) return;
                deactivateMut.mutate(deactivateCompany.id);
                setDeactivateCompany(null);
              }}
            >
              Confirmar desativação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
