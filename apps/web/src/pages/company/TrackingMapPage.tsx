import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCompanyTracking, type CompanyUserRow, type MarkerState } from "@/hooks/useCompanyTracking";
import { fetchMyCompanyUsers } from "@/lib/backend-fetch";
import { useDebouncedValue } from "@/lib/debounce";
import { hslFromUserId, initialFromName } from "@/lib/hash-color";
import { formatPhoneDisplay } from "@/lib/masks";
import { cn } from "@/lib/utils";
import appleLogo from "@/assets/map-apps/apple-maps.svg";
import googleMapsLogo from "@/assets/map-apps/google-maps.svg";
import wazeLogo from "@/assets/map-apps/waze.svg";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import L, { type Marker as LeafletMarker } from "leaflet";
import { Building2, ChevronDown, Crosshair, ExternalLink, MapPin } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { useSearchParams } from "react-router";

const LOCATION_RECENT_MS = 10_000;
const LOCATION_WARN_MS = 2 * 60_000;
const LOCATION_STALE_MS = 10 * 60_000;

function mapInitialsFromName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return initialFromName(parts[0]);
  return `${initialFromName(parts[0])}${initialFromName(parts[parts.length - 1])}`;
}

function initialCharForMarkerHtml(name: string): string {
  const ch = mapInitialsFromName(name);
  if (ch === "&") return "&amp;";
  if (ch === "<") return "&lt;";
  if (ch === ">") return "&gt;";
  if (ch === `"`) return "&quot;";
  return ch;
}

function formatAccuracy(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 10) / 10;
  const fractionDigits = Number.isInteger(rounded) ? 0 : 1;
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: 1,
    useGrouping: false,
  }).format(rounded);
}

function lastPositionToneClass(timestamp: number | undefined, isActive: boolean): string {
  if (!isActive) return "text-text-secondary";
  if (timestamp == null) return "text-text-secondary";
  const ageMs = Date.now() - timestamp;
  if (ageMs <= LOCATION_RECENT_MS) return "text-feedback-success";
  if (ageMs <= LOCATION_WARN_MS) return "text-brand-secondary";
  if (ageMs <= LOCATION_STALE_MS) return "text-amber-600";
  return "text-feedback-error";
}

function companySummary(
  marker: MarkerState,
  selectedCompanyId: string,
): { primary: string; moreCount: number; allNames: string[] } | null {
  if (marker.companies.length === 0) return null;
  const selected = selectedCompanyId ? marker.companies.find((c) => c.id === selectedCompanyId) : undefined;
  const sorted = [...marker.companies].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const ordered = selected ? [selected, ...sorted.filter((c) => c.id !== selected.id)] : sorted;
  const primary = ordered[0]?.name ?? "Sem empresa";
  return {
    primary,
    moreCount: Math.max(0, ordered.length - 1),
    allNames: ordered.map((c) => c.name),
  };
}

function makeUserIcon(m: MarkerState): L.DivIcon {
  const initial = initialCharForMarkerHtml(m.name);
  const bg = m.isActive ? hslFromUserId(m.userId) : "hsl(220 9% 46%)";
  const recent = m.isActive && m.timestamp != null && Date.now() - m.timestamp < LOCATION_RECENT_MS;
  const html = `
    <div class="relative flex items-center justify-center" style="width:32px;height:32px;box-sizing:border-box">
      ${
        recent
          ? `<span class="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40" style="background:${bg}"></span>`
          : ""
      }
      <span class="relative z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-white p-0 text-[10px] font-bold leading-none text-white shadow-md" style="background:${bg};box-sizing:border-box;letter-spacing:0">${initial}</span>
    </div>
  `;
  return L.divIcon({
    className: "leaflet-div-icon-custom bg-transparent !border-0",
    html,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function TrackingMarker({
  m,
  selectedCompanyId,
  openPopupUserId,
  onOpenPopup,
}: {
  m: MarkerState;
  selectedCompanyId: string;
  openPopupUserId: string | null;
  onOpenPopup: (userId: string) => void;
}) {
  const ref = useRef<LeafletMarker | null>(null);
  const accuracyText = formatAccuracy(m.accuracy);
  const companiesInfo = companySummary(m, selectedCompanyId);
  const hasCoords = m.lat != null && m.lng != null;
  const coordsQuery = hasCoords ? `${m.lat},${m.lng}` : "";
  const googleMapsUrl = hasCoords ? `https://www.google.com/maps/search/?api=1&query=${coordsQuery}` : "";
  const wazeUrl = hasCoords ? `https://www.waze.com/ul?ll=${coordsQuery}&navigate=yes` : "";
  const appleMapsUrl = hasCoords ? `https://maps.apple.com/?q=${coordsQuery}` : "";

  useEffect(() => {
    if (openPopupUserId === m.userId) {
      ref.current?.openPopup();
    }
  }, [openPopupUserId, m.userId]);

  return (
    <Marker
      ref={ref}
      position={[m.lat!, m.lng!]}
      icon={makeUserIcon(m)}
      eventHandlers={{
        click: () => onOpenPopup(m.userId),
      }}
    >
      <Popup autoClose={false} closeOnClick={false} className="tracking-popup">
        <div className="w-64 rounded-lg border border-layout-border bg-layout-card p-3 text-text-main shadow-lg">
          <div className="mb-2 flex items-start gap-2">
            <span
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ background: hslFromUserId(m.userId) }}
            >
              {mapInitialsFromName(m.name)}
            </span>
            <div className="min-w-0">
              <div className="truncate font-semibold">{m.name}</div>
              <div className="truncate text-xs text-text-secondary">{m.email}</div>
              <div className="truncate text-xs text-text-secondary">{formatPhoneDisplay(m.phone)}</div>
            </div>
          </div>

          <div className="space-y-1 border-t border-layout-border/70 pt-2 text-xs">
            {companiesInfo && (
              <div className="flex items-center gap-1 text-text-secondary">
                <Building2 className="h-3.5 w-3.5" />
                <span className="truncate">{companiesInfo.primary}</span>
                {companiesInfo.moreCount > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="rounded-md bg-layout-body px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
                        +{companiesInfo.moreCount}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-64 text-xs">
                      <div className="space-y-0.5">
                        {companiesInfo.allNames.map((name) => (
                          <div key={name}>{name}</div>
                        ))}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}
            {m.timestamp != null && (
              <div className="text-text-secondary">
                Atualizado: {format(m.timestamp, "dd/MM 'às' HH:mm:ss", { locale: ptBR })}
              </div>
            )}
          </div>
          <div className="mt-2 border-t border-layout-border/70 pt-2">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="inline-flex min-w-0 items-center gap-1 text-text-main">
                    <MapPin className="h-3.5 w-3.5 text-text-secondary" />
                    <span className="truncate text-text-secondary">
                      {m.lat?.toFixed(5) ?? "—"}, {m.lng?.toFixed(5) ?? "—"}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-56 text-xs">
                  <div className="space-y-1">
                    <div className="font-medium text-text-main">Latitude/Longitude</div>
                    {hasCoords ? (
                      <div className="flex flex-col gap-1.5">
                        <a
                          href={googleMapsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex w-full items-center gap-2 rounded-md border border-layout-border bg-layout-body px-2 py-1 text-text-main transition-colors hover:bg-layout-card hover:text-brand-secondary"
                        >
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-blue-500/15 text-blue-700">
                            <img src={googleMapsLogo} alt="" className="h-3.5 w-3.5" />
                          </span>
                          Google Maps
                          <ExternalLink className="ml-auto h-3.5 w-3.5" />
                        </a>
                        <a
                          href={wazeUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex w-full items-center gap-2 rounded-md border border-layout-border bg-layout-body px-2 py-1 text-text-main transition-colors hover:bg-layout-card hover:text-brand-secondary"
                        >
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-cyan-500/15 text-cyan-700">
                            <img src={wazeLogo} alt="" className="h-3.5 w-3.5" />
                          </span>
                          Waze
                          <ExternalLink className="ml-auto h-3.5 w-3.5" />
                        </a>
                        <a
                          href={appleMapsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex w-full items-center gap-2 rounded-md border border-layout-border bg-layout-body px-2 py-1 text-text-main transition-colors hover:bg-layout-card hover:text-brand-secondary"
                        >
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-zinc-500/15 text-zinc-700">
                            <img src={appleLogo} alt="" className="h-3.5 w-3.5" />
                          </span>
                          Apple Maps
                          <ExternalLink className="ml-auto h-3.5 w-3.5" />
                        </a>
                      </div>
                    ) : (
                      <div className="text-text-secondary">Coordenadas indisponíveis</div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="inline-flex min-w-0 items-center gap-1 text-text-main">
                    <Crosshair className="h-3.5 w-3.5 text-text-secondary" />
                    <span className="truncate text-text-secondary">{accuracyText ? `${accuracyText} m` : "—"}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Precisão</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </Popup>
    </Marker>
  );
}

function MapExtras({
  withCoords,
  selectedCompanyId,
  fitSeed,
  focusPoint,
  focusRequestSeq,
  openPopupUserId,
  onOpenPopup,
}: {
  withCoords: MarkerState[];
  selectedCompanyId: string;
  fitSeed: string;
  focusPoint: { lat: number; lng: number } | null;
  focusRequestSeq: number;
  openPopupUserId: string | null;
  onOpenPopup: (userId: string) => void;
}) {
  const map = useMap();
  const lastFitSeed = useRef<string>("");
  const lastHandledFocusRequest = useRef(0);

  useEffect(() => {
    if (!fitSeed || withCoords.length === 0) return;
    if (lastFitSeed.current === fitSeed) return;
    lastFitSeed.current = fitSeed;

    const b = L.latLngBounds(withCoords.map((m) => [m.lat!, m.lng!] as [number, number]));
    map.fitBounds(b, { padding: [56, 56], maxZoom: 15 });
  }, [fitSeed, map, withCoords]);

  useEffect(() => {
    if (focusRequestSeq <= 0) return;
    if (lastHandledFocusRequest.current === focusRequestSeq) return;
    if (!focusPoint) return;
    lastHandledFocusRequest.current = focusRequestSeq;
    map.flyTo([focusPoint.lat, focusPoint.lng], Math.max(map.getZoom(), 14), { duration: 0.45 });
  }, [focusPoint, focusRequestSeq, map]);

  return (
    <>
      {withCoords.map((m) => (
        <TrackingMarker
          key={m.userId}
          m={m}
          selectedCompanyId={selectedCompanyId}
          openPopupUserId={openPopupUserId}
          onOpenPopup={onOpenPopup}
        />
      ))}
    </>
  );
}

type UserListBlockProps = {
  usersQueryLoading: boolean;
  activeMarkers: MarkerState[];
  inactiveMarkers: MarkerState[];
  selectedCompanyId: string;
  focusUserId: string | null;
  onPickUser: (userId: string) => void;
};

function UserListBlock({
  usersQueryLoading,
  activeMarkers,
  inactiveMarkers,
  selectedCompanyId,
  focusUserId,
  onPickUser,
}: UserListBlockProps) {
  const [activeOpen, setActiveOpen] = useState(true);
  const [inactiveOpen, setInactiveOpen] = useState(true);

  const renderRow = useCallback(
    (m: MarkerState) => {
      const hasPos = m.lat != null && m.lng != null;
      const companiesInfo = companySummary(m, selectedCompanyId);
      const lastPositionClass = lastPositionToneClass(m.timestamp, m.isActive);
      return (
        <li key={m.userId}>
          <button
            type="button"
            disabled={!hasPos}
            onClick={() => hasPos && onPickUser(m.userId)}
            className={cn(
              "w-full rounded-lg border border-layout-border bg-layout-body/80 p-3 text-left text-sm outline-none transition-colors",
              focusUserId === m.userId && "bg-brand-primary/10 border-brand-primary/60",
              hasPos && "hover:border-brand-primary/40 hover:bg-layout-card",
              !hasPos && "cursor-not-allowed opacity-50",
            )}
          >
            <div className="flex items-start gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/30 text-xs font-semibold text-white shadow"
                style={{ background: hslFromUserId(m.userId) }}
              >
                {mapInitialsFromName(m.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="min-w-0 font-medium">{m.name}</div>
                <div className="truncate text-xs text-text-secondary">{m.email}</div>
                <div className="truncate text-xs text-text-secondary">{formatPhoneDisplay(m.phone)}</div>
                {companiesInfo && (
                  <div className="mt-1 flex items-center gap-1 text-xs text-brand-secondary">
                    <span className="truncate">{companiesInfo.primary}</span>
                    {companiesInfo.moreCount > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className={cn(
                              "rounded px-1 py-0.5 text-[10px] font-medium text-text-secondary",
                              focusUserId === m.userId ? "bg-layout-border/80" : "bg-layout-body",
                            )}
                          >
                            +{companiesInfo.moreCount}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-64 text-xs">
                          <div className="space-y-0.5">
                            {companiesInfo.allNames.map((name) => (
                              <div key={name}>{name}</div>
                            ))}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                )}
                {m.timestamp != null && (
                  <div className={cn("mt-1 text-xs", lastPositionClass)}>
                    Última posição: {formatDistanceToNow(m.timestamp, { addSuffix: true, locale: ptBR })}
                  </div>
                )}
              </div>
            </div>
          </button>
        </li>
      );
    },
    [focusUserId, onPickUser, selectedCompanyId],
  );

  if (usersQueryLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {activeMarkers.length > 0 && (
        <div>
          <button
            type="button"
            className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700/80 dark:text-emerald-300/80"
            onClick={() => setActiveOpen((v) => !v)}
            aria-expanded={activeOpen}
          >
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500/80" />
            Ativos
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", activeOpen && "rotate-180")} />
          </button>
          <div
            className={cn(
              "grid overflow-hidden transition-all duration-200 ease-out",
              activeOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
            )}
          >
            <ul className="min-h-0 space-y-2">{activeMarkers.map((m) => renderRow(m))}</ul>
          </div>
        </div>
      )}
      {inactiveMarkers.length > 0 && (
        <div>
          {activeMarkers.length > 0 && <div className="border-t border-layout-border pt-3" />}
          <button
            type="button"
            className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600/85 dark:text-zinc-300/80"
            onClick={() => setInactiveOpen((v) => !v)}
            aria-expanded={inactiveOpen}
          >
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-zinc-500/80" />
            Inativos
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", inactiveOpen && "rotate-180")} />
          </button>
          <div
            className={cn(
              "grid overflow-hidden transition-all duration-200 ease-out",
              inactiveOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
            )}
          >
            <ul className="min-h-0 space-y-2">{inactiveMarkers.map((m) => renderRow(m))}</ul>
          </div>
        </div>
      )}
    </div>
  );
}

export function TrackingMapPage() {
  const [searchParams] = useSearchParams();
  const userSearch = searchParams.get("userSearch") ?? "";
  const debouncedUserSearch = useDebouncedValue(userSearch, 250);
  const [focusUserId, setFocusUserId] = useState<string | null>(null);
  const [focusRequestSeq, setFocusRequestSeq] = useState(0);
  const [openPopupUserId, setOpenPopupUserId] = useState<string | null>(null);
  const selectedCompanyId = searchParams.get("companyId") ?? "";

  const usersQuery = useQuery({
    queryKey: ["my-company-users", selectedCompanyId],
    queryFn: () => fetchMyCompanyUsers(selectedCompanyId || undefined),
  });

  const users: CompanyUserRow[] = useMemo(
    () =>
      (usersQuery.data ?? [])
        .filter((u) => u.role === "USER")
        .map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone,
          role: u.role,
          isActive: u.isActive,
          trackingActive: u.trackingActive,
          companies: u.companies,
          lastLocation: u.lastLocation,
        })),
    [usersQuery.data],
  );

  const { markers } = useCompanyTracking(users);

  const withCoords = useMemo(() => {
    return [...markers.values()].filter((m) => typeof m.lat === "number" && typeof m.lng === "number");
  }, [markers]);

  const sortedMarkers = useMemo(() => [...markers.values()].sort((a, b) => Number(b.isActive) - Number(a.isActive)), [markers]);

  const filteredMarkers = useMemo(() => {
    const term = debouncedUserSearch.trim().toLowerCase();
    if (!term) return sortedMarkers;
    const termDigits = term.replace(/\D/g, "");
    return sortedMarkers.filter((m) => {
      const byName = m.name.toLowerCase().includes(term);
      const byEmail = m.email.toLowerCase().includes(term);
      const phone = m.phone ?? "";
      const byPhoneText = phone.toLowerCase().includes(term) || formatPhoneDisplay(phone).toLowerCase().includes(term);
      const byPhoneDigits = termDigits.length > 0 && phone.replace(/\D/g, "").includes(termDigits);
      return byName || byEmail || byPhoneText || byPhoneDigits;
    });
  }, [debouncedUserSearch, sortedMarkers]);

  const activeMarkers = filteredMarkers.filter((m) => m.isActive);
  const inactiveMarkers = filteredMarkers.filter((m) => !m.isActive);
  const activeCount = activeMarkers.length;

  const center: [number, number] = useMemo(() => {
    const first = withCoords[0];
    if (!first) return [-14.235, -51.925];
    return [first.lat!, first.lng!];
  }, [withCoords]);

  const fitSeed = useMemo(() => {
    const ids = withCoords.map((m) => m.userId).sort().join("|");
    return `${selectedCompanyId}|${ids}`;
  }, [selectedCompanyId, withCoords]);

  const focusPoint = useMemo(() => {
    if (!focusUserId) return null;
    const m = markers.get(focusUserId);
    if (!m || m.lat == null || m.lng == null) return null;
    return { lat: m.lat, lng: m.lng };
  }, [focusUserId, markers]);

  useEffect(() => {
    setFocusUserId(null);
    setFocusRequestSeq(0);
    setOpenPopupUserId(null);
  }, [selectedCompanyId]);

  const handlePickUser = useCallback((userId: string) => {
    setFocusUserId(userId);
    setFocusRequestSeq((n) => n + 1);
    setOpenPopupUserId(userId);
  }, []);

  const listProps: UserListBlockProps = {
    usersQueryLoading: usersQuery.isLoading,
    activeMarkers,
    inactiveMarkers,
    selectedCompanyId,
    focusUserId,
    onPickUser: handlePickUser,
  };

  return (
    <TooltipProvider delayDuration={120}>
      <div className="relative flex h-full min-h-0 flex-col gap-3 md:flex-row">
      <div className="relative order-1 min-h-[42vh] flex-1 overflow-hidden rounded-xl border border-layout-border md:order-2 md:min-h-0">
        <MapContainer center={center} zoom={5} className="h-full min-h-0 w-full" scrollWheelZoom>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapExtras
            withCoords={withCoords}
            selectedCompanyId={selectedCompanyId}
            fitSeed={fitSeed}
            focusPoint={focusPoint}
            focusRequestSeq={focusRequestSeq}
            openPopupUserId={openPopupUserId}
            onOpenPopup={setOpenPopupUserId}
          />
        </MapContainer>
      </div>

      <Card className="order-2 flex h-[38vh] min-h-0 w-full shrink-0 flex-col md:hidden">
        <CardHeader className="space-y-3 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Usuários ativos ({activeCount})</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-y-auto p-2">
          <UserListBlock {...listProps} />
        </CardContent>
      </Card>

      <Card className="order-2 hidden h-full min-h-0 w-full shrink-0 flex-col md:flex md:w-80">
        <CardHeader className="space-y-3 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Usuários ativos ({activeCount})</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-y-auto p-2">
          <UserListBlock {...listProps} />
        </CardContent>
      </Card>
      </div>
    </TooltipProvider>
  );
}
