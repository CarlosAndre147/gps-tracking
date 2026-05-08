import { wsBaseUrl } from "@/lib/env";

import { useAuthStore } from "@/store/auth.store";

import { useRealtimeWsStore } from "@/store/realtime-ws.store";

import { useCallback, useEffect, useRef, useState } from "react";



export type CompanyUserRow = {

  id: string;

  name: string;

  email: string;

  phone: string;

  role: string;

  isActive: boolean;

  trackingActive: boolean;

  companies: { id: string; name: string; cnpj: string }[];

  lastLocation?: {
    lat: number;
    lng: number;
    accuracy: number | null;
    timestamp: number;
    isActive: boolean;
  } | null;

};



export type MarkerState = {

  userId: string;

  name: string;

  email: string;

  phone: string;

  companies: { id: string; name: string; cnpj: string }[];

  lat?: number;

  lng?: number;

  accuracy?: number | null;

  timestamp?: number;

  isActive: boolean;

};



function parseJson(raw: unknown): unknown {

  if (typeof raw === "string") {

    try {

      return JSON.parse(raw) as unknown;

    } catch {

      return undefined;

    }

  }

  return raw;

}



export function useCompanyTracking(users: CompanyUserRow[]) {

  const token = useAuthStore((s) => s.accessToken);
  const refreshSession = useAuthStore((s) => s.refreshSession);

  const [markers, setMarkers] = useState<Map<string, MarkerState>>(new Map());

  const [wsStatus, setWsStatus] = useState<"connecting" | "open" | "closed">("closed");

  const setGlobalWsStatus = useRealtimeWsStore((s) => s.setStatus);

  const wsRef = useRef<WebSocket | null>(null);

  const attemptRef = useRef(0);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);



  useEffect(() => {

    setGlobalWsStatus(wsStatus);

    return () => setGlobalWsStatus("closed");

  }, [wsStatus, setGlobalWsStatus]);



  const applyUsers = useCallback((list: CompanyUserRow[]) => {

    setMarkers((prev) => {

      const allowedIds = new Set(list.map((u) => u.id));
      const next = new Map<string, MarkerState>();

      for (const u of list) {

        const cur = prev.get(u.id);

        next.set(u.id, {

          userId: u.id,

          name: u.name,

          email: u.email,

          phone: u.phone,

          companies: u.companies,

          isActive: u.trackingActive,

          lat: cur?.lat ?? u.lastLocation?.lat,

          lng: cur?.lng ?? u.lastLocation?.lng,

          accuracy: cur?.accuracy ?? u.lastLocation?.accuracy,

          timestamp: cur?.timestamp ?? u.lastLocation?.timestamp,

        });

      }

      for (const [userId, marker] of prev.entries()) {
        if (!allowedIds.has(userId)) continue;
        if (next.has(userId)) continue;
        next.set(userId, marker);
      }

      return next;

    });

  }, []);



  useEffect(() => {

    applyUsers(users);

  }, [users, applyUsers]);

  const handleMessage = useCallback((raw: unknown) => {

    const msg = parseJson(raw);

    if (!msg || typeof msg !== "object") return;

    const m = msg as Record<string, unknown>;

    if (m.type === "SNAPSHOT" && m.data && typeof m.data === "object") {

      const d = m.data as { locationsByUserId?: Record<string, unknown> };

      if (!d.locationsByUserId) return;

      setMarkers((prev) => {

        const next = new Map(prev);

        for (const [userId, loc] of Object.entries(d.locationsByUserId!)) {
          if (!next.has(userId)) continue;

          if (!loc || typeof loc !== "object") continue;

          const l = loc as Record<string, unknown>;

          const cur = next.get(userId);

          next.set(userId, {

            userId,

            name: cur?.name ?? userId,

            email: cur?.email ?? "",

            phone: cur?.phone ?? "",

            companies: cur?.companies ?? [],

            lat: typeof l.lat === "number" ? l.lat : cur?.lat,

            lng: typeof l.lng === "number" ? l.lng : cur?.lng,

            accuracy: (l.accuracy as number | null | undefined) ?? cur?.accuracy,

            timestamp: typeof l.timestamp === "number" ? l.timestamp : cur?.timestamp,

            isActive: typeof l.isActive === "boolean" ? l.isActive : (cur?.isActive ?? false),

          });

        }

        return next;

      });

      return;

    }

    if (m.type === "USER_LOCATION") {

      const userId = m.userId as string;

      setMarkers((prev) => {
        if (!prev.has(userId)) return prev;

        const next = new Map(prev);

        const cur = next.get(userId);

        next.set(userId, {

          userId,

          name: cur?.name ?? userId,

          email: cur?.email ?? "",

          phone: cur?.phone ?? "",

          companies: cur?.companies ?? [],

          lat: m.lat as number,

          lng: m.lng as number,

          accuracy: (m.accuracy as number | null) ?? null,

          timestamp: m.timestamp as number,

          isActive: (m.isActive as boolean) ?? true,

        });

        return next;

      });

      return;

    }

    if (m.type === "TRACKING_STARTED") {

      const userId = m.userId as string;

      setMarkers((prev) => {

        const next = new Map(prev);

        const cur = next.get(userId);

        if (!cur) return next;

        next.set(userId, { ...cur, isActive: true });

        return next;

      });

    }

    if (m.type === "TRACKING_STOPPED") {

      const userId = m.userId as string;

      setMarkers((prev) => {

        const next = new Map(prev);

        const cur = next.get(userId);

        if (!cur) return next;

        next.set(userId, { ...cur, isActive: false });

        return next;

      });

    }

  }, []);



  useEffect(() => {

    if (!token) return;

    let disposed = false;

    const connect = async () => {

      if (disposed) return;

      if (timerRef.current) {

        clearTimeout(timerRef.current);

        timerRef.current = null;

      }

      const currentToken = useAuthStore.getState().accessToken;
      if (!currentToken) {
        setWsStatus("closed");
        return;
      }

      // Garante token atualizado antes de abrir/reabrir WS.
      try {
        await refreshSession();
      } catch {
        // Evita abrir WS com token possivelmente expirado (gera 401 em loop).
        if (disposed) return;
        setWsStatus("closed");
        const delay = Math.min(1000 * 2 ** attemptRef.current, 30_000);
        attemptRef.current += 1;
        timerRef.current = setTimeout(() => {
          void connect();
        }, delay);
        return;
      }
      const nextToken = useAuthStore.getState().accessToken ?? currentToken;
      if (!nextToken || disposed) {
        setWsStatus("closed");
        return;
      }

      setWsStatus("connecting");

      const ws = new WebSocket(`${wsBaseUrl()}/ws/tracking?token=${encodeURIComponent(nextToken)}`);

      wsRef.current = ws;



      ws.onopen = () => {
        setWsStatus("open");

        attemptRef.current = 0;

      };



      ws.onmessage = (ev) => handleMessage(ev.data);



      ws.onclose = () => {

        if (disposed) return;
        setWsStatus("closed");

        wsRef.current = null;

        const delay = Math.min(1000 * 2 ** attemptRef.current, 30_000);

        attemptRef.current += 1;

        timerRef.current = setTimeout(() => {
          void connect();
        }, delay);

      };



      ws.onerror = () => {

        ws.close();

      };

    };



    void connect();



    return () => {

      disposed = true;
      if (timerRef.current) clearTimeout(timerRef.current);

      wsRef.current?.close();

      wsRef.current = null;

    };

  }, [token, handleMessage, refreshSession]);



  return { markers, wsStatus };

}

