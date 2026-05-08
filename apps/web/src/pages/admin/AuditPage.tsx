import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatAuditAction } from "@/lib/audit-actions";
import { useDebouncedValue } from "@/lib/debounce";
import { fetchAuditLogs, type AuditRow } from "@/lib/backend-fetch";
import { api } from "@/lib/api";
import { isApiError, unwrapPaginated } from "@/lib/api-result";
import { useQuery } from "@tanstack/react-query";
import { RefreshCcw, ScrollText } from "lucide-react";
import { useEffect, useState } from "react";

const AUDIT_ACTIONS = [
  "",
  "LOGIN",
  "LOGOUT",
  "USER_CREATED",
  "USER_UPDATED",
  "USER_DEACTIVATED",
  "PASSWORD_CHANGED",
  "COMPANY_CREATED",
  "COMPANY_UPDATED",
  "COMPANY_DEACTIVATED",
  "COMPANY_USER_LINKED",
  "COMPANY_USER_UNLINKED",
] as const;

type UserPick = { id: string; name: string; email: string };

function compactId(id: string | null): string {
  if (!id) return "—";
  return id.length <= 12 ? id : `${id.slice(0, 8)}...`;
}

function formatAuditResource(row: AuditRow): string {
  if (row.targetLabel?.trim()) {
    return row.targetSubtitle?.trim() ? `${row.targetLabel} (${row.targetSubtitle})` : row.targetLabel;
  }

  if (row.metadata && typeof row.metadata === "object") {
    const meta = row.metadata as Record<string, unknown>;
    if (typeof meta.targetLabel === "string" && meta.targetLabel.trim()) {
      const subtitle = typeof meta.targetSubtitle === "string" ? meta.targetSubtitle.trim() : "";
      return subtitle ? `${meta.targetLabel} (${subtitle})` : meta.targetLabel;
    }
  }

  if (!row.target && !row.targetType) return "—";
  const kind = row.targetType ?? "Recurso";
  const target = row.target ?? "";
  if (!target) return kind;
  return `${kind} #${compactId(target)}`;
}

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const debouncedUserSearch = useDebouncedValue(userSearch, 300);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserLabel, setSelectedUserLabel] = useState("");
  const [detailRow, setDetailRow] = useState<AuditRow | null>(null);

  const userPickQuery = useQuery({
    queryKey: ["audit-user-pick", debouncedUserSearch],
    enabled: debouncedUserSearch.trim().length >= 2,
    queryFn: async () => {
      const res = await api.users.get({
        query: { search: debouncedUserSearch.trim(), page: 1, limit: 15 },
      });
      const body = res.data as unknown;
      if (res.status !== 200 || !body || isApiError(body)) {
        throw new Error(isApiError(body) ? body.error.message : "Falha na busca");
      }
      return unwrapPaginated<UserPick>(body).items;
    },
  });

  useEffect(() => {
    setPage(1);
  }, [action, selectedUserId, from, to]);

  const q = useQuery({
    queryKey: ["audit", page, action, selectedUserId, from, to],
    queryFn: () =>
      fetchAuditLogs({
        page,
        limit: 25,
        action: action.trim() || undefined,
        userId: selectedUserId ?? undefined,
        from: from.trim() || undefined,
        to: to.trim() || undefined,
      }),
    refetchInterval: 30_000,
  });

  const { items, meta } = q.data ?? { items: [], meta: { page: 1, limit: 25, total: 0 } };
  const pageCount = Math.max(1, Math.ceil(meta.total / Math.max(1, meta.limit)));
  const canPrev = meta.page > 1;
  const canNext = meta.page < pageCount;

  const metadataJson =
    detailRow?.metadata && typeof detailRow.metadata === "object"
      ? JSON.stringify(detailRow.metadata, null, 2)
      : detailRow?.metadata
        ? String(detailRow.metadata)
        : "Sem metadados adicionais.";

  return (
    <TooltipProvider delayDuration={120}>
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Logs de auditoria</h1>
        <Button type="button" variant="outline" onClick={() => void q.refetch()} disabled={q.isFetching}>
          <RefreshCcw className="mr-2 h-4 w-4" />
          {q.isFetching ? "Atualizando..." : "Atualizar"}
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-1">
          <Label>Usuário (autocomplete)</Label>
          <Input
            value={userSearch}
            onChange={(e) => {
              setUserSearch(e.target.value);
              if (!e.target.value.trim()) {
                setSelectedUserId(null);
                setSelectedUserLabel("");
              }
            }}
            placeholder="Nome ou e-mail (mín. 2 caracteres)"
          />
          {debouncedUserSearch.trim().length >= 2 && userPickQuery.data && userPickQuery.data.length > 0 && (
            <ul className="z-10 mt-1 max-h-40 overflow-y-auto rounded-md border border-layout-border bg-layout-card text-sm shadow-md">
              {userPickQuery.data.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    className="flex w-full flex-col px-3 py-2 text-left hover:bg-layout-body"
                    onClick={() => {
                      setSelectedUserId(u.id);
                      setSelectedUserLabel(`${u.name} (${u.email})`);
                      setUserSearch(`${u.name} — ${u.email}`);
                    }}
                  >
                    <span className="font-medium">{u.name}</span>
                    <span className="text-xs text-text-secondary">{u.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selectedUserId && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1 h-8 px-2 text-xs"
              onClick={() => {
                setSelectedUserId(null);
                setSelectedUserLabel("");
                setUserSearch("");
              }}
            >
              Limpar usuário
            </Button>
          )}
        </div>
        <div className="space-y-1">
          <Label>Ação</Label>
          <select
            className="flex h-10 w-full rounded-md border border-layout-border bg-layout-card px-3 text-sm"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            {AUDIT_ACTIONS.map((a) => (
              <option key={a || "all"} value={a}>
                {a || "Todas"}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label>De (data)</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Até (data)</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>
      {selectedUserLabel && <p className="text-xs text-text-secondary">Filtro: {selectedUserLabel}</p>}

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {q.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : q.isError ? (
            <div className="space-y-3 p-6">
              <p className="text-sm text-feedback-error">
                {q.error instanceof Error ? q.error.message : "Falha ao carregar logs de auditoria."}
              </p>
              <Button size="sm" variant="outline" onClick={() => void q.refetch()}>
                Tentar novamente
              </Button>
            </div>
          ) : items.length === 0 ? (
            <EmptyState icon={ScrollText} title="Sem registros" description="Ajuste filtros ou período." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full table-fixed text-left text-sm">
                  <thead className="border-b border-layout-border bg-layout-body text-xs uppercase text-text-secondary">
                    <tr>
                      <th className="w-[170px] px-4 py-3">Quando</th>
                      <th className="w-[260px] px-4 py-3">Usuário</th>
                      <th className="w-[200px] px-4 py-3">Ação</th>
                      <th className="px-4 py-3">Recurso</th>
                      <th className="w-[140px] px-4 py-3">IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r) => (
                      <tr
                        key={r.id}
                        className="cursor-pointer border-b border-layout-border/80 hover:bg-layout-body"
                        onClick={() => setDetailRow(r)}
                      >
                        <td className="px-4 py-3 text-text-secondary">{new Date(r.createdAt).toLocaleString("pt-BR")}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-text-main">{r.userName ?? "—"}</div>
                          <div className="text-xs text-text-secondary">{r.userEmail ?? r.userId ?? "—"}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge variant="default" className="whitespace-nowrap font-mono text-[10px]">
                            {formatAuditAction(r.action)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="block truncate">{formatAuditResource(r)}</span>
                            </TooltipTrigger>
                            <TooltipContent>{formatAuditResource(r)}</TooltipContent>
                          </Tooltip>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-text-secondary">{r.ip ?? "—"}</td>
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
                    disabled={!canPrev || q.isFetching}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!canNext || q.isFetching}
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

      <Dialog open={!!detailRow} onOpenChange={(o) => !o && setDetailRow(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-hidden">
          <DialogHeader>
            <DialogTitle>Metadados do evento</DialogTitle>
          </DialogHeader>
          {detailRow && (
            <div className="space-y-2 text-sm">
              <p className="text-text-secondary">
                <span className="font-medium text-text-main">{formatAuditAction(detailRow.action)}</span> em{" "}
                {new Date(detailRow.createdAt).toLocaleString("pt-BR")}
              </p>
              <p className="text-text-secondary">
                Recurso: <span className="text-text-main">{formatAuditResource(detailRow)}</span>
              </p>
              <p className="text-text-secondary">
                Usuário: <span className="text-text-main">{detailRow.userName ?? detailRow.userEmail ?? "—"}</span>
              </p>
              <pre className="max-h-[50vh] overflow-auto rounded-lg border border-layout-border bg-layout-body p-3 text-xs text-text-main">
                {metadataJson}
              </pre>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}
