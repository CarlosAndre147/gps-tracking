import { format, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";

/** Primeiro e último nome (ex.: "Maria Silva Santos" → "Maria Santos"). */
export function firstLastDisplayName(name: string | undefined): string {
  if (name == null || !name.trim()) return "—";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]!} ${parts[parts.length - 1]!}`;
}

export function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  const m = Math.round(ms / 60000);
  if (m < 1) return "<1 min";
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem === 0 ? `${h}h` : `${h}h ${rem}min`;
  }
  return `${m} min`;
}

/** Tempo relativo em pt-BR (evento no passado): agora / há N min / há N h / há N d. */
export function formatRelativeTime(msSinceEpoch: number, nowMs: number = Date.now()): string {
  const diff = Math.max(0, nowMs - msSinceEpoch);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "agora";
  const min = Math.floor(diff / 60_000);
  if (min < 60) return min === 1 ? "há 1 min" : `há ${min} min`;
  const h = Math.floor(diff / 3_600_000);
  if (h < 24) return h === 1 ? "há 1 h" : `há ${h} h`;
  const d = Math.floor(diff / 86_400_000);
  return d === 1 ? "há 1 d" : `há ${d} d`;
}

/** Dia da semana em pt-BR sem "-feira", com primeira letra maiúscula (ex.: Segunda). */
export function weekdayLabelPt(date: Date): string {
  const raw = format(date, "EEEE", { locale: ptBR }).replace(/-feira$/i, "");
  if (!raw) return raw;
  return raw.charAt(0).toLocaleUpperCase("pt-BR") + raw.slice(1).toLocaleLowerCase("pt-BR");
}

export function formatHistoryClosedRange(startedAt: string, stoppedAt: string): string {
  const startD = new Date(startedAt);
  const endD = new Date(stoppedAt);
  if (isSameDay(startD, endD)) {
    return `${format(startD, "dd/MM/yy", { locale: ptBR })}, ${weekdayLabelPt(startD)} · ${format(startD, "HH:mm", { locale: ptBR })}–${format(endD, "HH:mm", { locale: ptBR })}`;
  }
  return `${format(startD, "dd/MM/yy HH:mm", { locale: ptBR })}, ${weekdayLabelPt(startD)} – ${format(endD, "dd/MM/yy HH:mm", { locale: ptBR })}, ${weekdayLabelPt(endD)}`;
}
