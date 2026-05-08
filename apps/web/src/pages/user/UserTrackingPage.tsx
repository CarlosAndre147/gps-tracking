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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useTracking, type SessionRow } from "@/hooks/useTracking";
import { api } from "@/lib/api";
import { isApiError, unwrapPaginated } from "@/lib/api-result";
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { formatDuration, formatHistoryClosedRange, weekdayLabelPt } from "@/lib/user-tracking-format";
import { useAuthStore } from "@/store/auth.store";
import { useInfiniteQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Info, Loader2, Satellite, WifiOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

export function UserTrackingPage() {
  const companies = useAuthStore((s) => s.companies);
  const { isTracking, permissionDenied, geoError, startTracking, stopTracking } = useTracking();
  const [isToggling, setIsToggling] = useState(false);
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [nowTs, setNowTs] = useState(() => Date.now());

  const historyQuery = useInfiniteQuery({
    queryKey: ["tracking-history"],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const res = await api.tracking.history.get({ query: { page: pageParam, limit: 10 } });
      const body = res.data as unknown;
      if (res.status !== 200 || !body || isApiError(body)) {
        throw new Error(isApiError(body) ? body.error.message : "Histórico indisponível");
      }
      return unwrapPaginated<SessionRow>(body);
    },
    getNextPageParam: (last) => {
      const { page, limit, total } = last.meta;
      const loaded = page * limit;
      return loaded < total ? page + 1 : undefined;
    },
    refetchInterval: 10_000,
  });

  const sessions = useMemo(
    () => historyQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [historyQuery.data],
  );

  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        const [e] = entries;
        if (e?.isIntersecting && historyQuery.hasNextPage && !historyQuery.isFetchingNextPage) {
          void historyQuery.fetchNextPage();
        }
      },
      { root: null, rootMargin: "160px", threshold: 0 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [historyQuery.hasNextPage, historyQuery.isFetchingNextPage, historyQuery.fetchNextPage]);

  const invalidateHistory = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["tracking-history"] });
  }, []);

  const runStart = useCallback(async () => {
    setIsToggling(true);
    try {
      await startTracking();
      invalidateHistory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível iniciar o rastreamento.");
    } finally {
      setIsToggling(false);
    }
  }, [startTracking, invalidateHistory]);

  const runStop = useCallback(async () => {
    setStopConfirmOpen(false);
    setIsToggling(true);
    try {
      await stopTracking();
      invalidateHistory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível parar o rastreamento.");
    } finally {
      setIsToggling(false);
    }
  }, [stopTracking, invalidateHistory]);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-1 sm:px-0">
      <Card
        className={cn(
          "relative overflow-hidden border",
          isTracking
            ? "border-2 border-feedback-success/80 bg-brand-primary/[0.08] shadow-[0_0_0_1px_rgba(103,154,164,0.25)]"
            : "border-layout-border",
        )}
      >
        <button
          type="button"
          className="absolute right-3 top-3 z-10 rounded-lg border border-brand-accent/40 bg-brand-accent/10 p-1.5 text-brand-accent transition-colors hover:bg-brand-accent/15"
          onClick={() => setInfoOpen(true)}
          aria-label="Informações do app e empresas vinculadas"
        >
          <Info className="h-[18px] w-[18px]" strokeWidth={2} />
        </button>
        <CardHeader className="pb-2 pt-10 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center">
            <Satellite
              className={cn(
                "h-12 w-12 shrink-0",
                isTracking ? "text-brand-primary" : "text-text-muted",
                isTracking && "animate-spin [animation-duration:4s]",
              )}
            />
          </div>
          <CardTitle className="mt-3 text-base font-bold tracking-wide text-text-main">
            RASTREAMENTO DE LOCALIZAÇÃO
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex items-center justify-center gap-3">
            <span
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-semibold",
                !isTracking
                  ? "border-feedback-error/50 bg-feedback-error/10 text-feedback-error"
                  : "border-layout-border bg-layout-body text-text-secondary",
              )}
            >
              Inativo
            </span>
            <span
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-semibold",
                isTracking
                  ? "border-feedback-success/60 bg-feedback-success/15 text-brand-secondary"
                  : "border-layout-border bg-layout-body text-text-secondary",
              )}
            >
              Ativo
            </span>
          </div>

          <Button
            type="button"
            size="lg"
            className={cn(
              "h-12 w-full font-bold",
              isTracking ? "bg-feedback-error text-text-inverted hover:brightness-95" : "bg-feedback-success text-text-inverted hover:brightness-95",
            )}
            disabled={isToggling}
            onClick={() => {
              if (isTracking) {
                setStopConfirmOpen(true);
                return;
              }
              void runStart();
            }}
          >
            {isToggling ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Atualizando…
              </>
            ) : isTracking ? (
              "Parar rastreamento"
            ) : (
              "Iniciar rastreamento"
            )}
          </Button>

          {permissionDenied && (
            <div className="rounded-lg border border-feedback-error/30 bg-feedback-error/10 px-3 py-2 text-feedback-error">
              <p className="font-medium">Localização bloqueada</p>
              <p className="mt-1 text-xs opacity-90">
                Sem permissão não dá para ativar rastreamento. Use o botão abixo para o navegador pedir de novo.
              </p>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => void runStart()}>
                Solicitar localização
              </Button>
            </div>
          )}
          {geoError && !permissionDenied && (
            <div className="rounded-lg border border-layout-border bg-layout-body px-3 py-2 text-text-secondary">
              <p className="text-xs">{geoError}</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => void runStart()}>
                Tentar de novo
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {historyQuery.isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          )}
          {historyQuery.isError && (
            <div className="flex flex-col items-start gap-2 rounded-lg border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm text-feedback-error">
              <span className="flex items-center gap-2">
                <WifiOff className="h-4 w-4" />
                {historyQuery.error instanceof Error ? historyQuery.error.message : "Falha ao carregar histórico."}
              </span>
              <Button size="sm" variant="outline" onClick={() => void historyQuery.refetch()}>
                Tentar novamente
              </Button>
            </div>
          )}
          {!historyQuery.isLoading &&
            !historyQuery.isError &&
            sessions.map((s) => (
              <div
                key={s.id}
                className="rounded-xl border border-layout-border bg-layout-card p-3.5 shadow-sm"
              >
                {s.stoppedAt == null ? (
                  <>
                    <p className="text-sm font-bold text-feedback-success">
                      Em andamento desde {format(new Date(s.startedAt), "dd/MM/yy", { locale: ptBR })},{" "}
                      {weekdayLabelPt(new Date(s.startedAt))} · {format(new Date(s.startedAt), "HH:mm", { locale: ptBR })}
                    </p>
                    <p className="mt-1.5 text-sm text-text-secondary">
                      Duração até agora: {formatDuration(nowTs - new Date(s.startedAt).getTime())}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-text-main">{formatHistoryClosedRange(s.startedAt, s.stoppedAt)}</p>
                    <p className="mt-1.5 text-sm text-text-secondary">Duração: {formatDuration(s.durationMs)}</p>
                  </>
                )}
              </div>
            ))}
          {!historyQuery.isLoading && !historyQuery.isError && sessions.length === 0 && (
            <div className="rounded-xl border border-layout-border bg-layout-card p-4">
              <p className="text-sm font-semibold text-text-main">Nenhum registro por enquanto</p>
              <p className="mt-1.5 text-sm text-text-secondary">
                Quando você iniciar o rastreamento, suas sessões vão aparecer aqui.
              </p>
            </div>
          )}
          <div ref={loadMoreRef} className="h-1 w-full shrink-0" aria-hidden />
          {historyQuery.isFetchingNextPage && (
            <div className="flex justify-center py-2">
              <Loader2 className="h-6 w-6 animate-spin text-brand-primary" />
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={stopConfirmOpen} onOpenChange={setStopConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Parar rastreamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Você deixará de enviar sua localização até iniciar de novo. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runStop()}>Parar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Informações</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-4 pt-1 text-left text-sm text-text-secondary">
                <p>
                  Com o rastreamento ligado, sua posição é enviada às empresas da sua conta para apoio à jornada e
                  segurança no trabalho.
                </p>
                <div>
                  <p className="font-semibold text-text-main">Suas empresas</p>
                  {companies.length === 0 ? (
                    <p className="mt-1">Nenhuma empresa associada à sua conta.</p>
                  ) : (
                    <>
                      <p className="mt-1">
                        Você está vinculado a {companies.length} {companies.length === 1 ? "empresa" : "empresas"}:
                      </p>
                      <ul className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-layout-border bg-layout-body py-1">
                        {companies.map((c) => (
                          <li key={c.id} className="border-b border-layout-border px-3 py-2.5 text-sm font-medium text-text-main last:border-b-0">
                            {c.name}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
