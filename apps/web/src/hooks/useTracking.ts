import { api } from "@/lib/api";

import { isApiError, unwrapData, unwrapPaginated } from "@/lib/api-result";

import { wsBaseUrl } from "@/lib/env";

import { useAuthStore } from "@/store/auth.store";

import { useCallback, useEffect, useRef, useState } from "react";

const MOBILE_MAX_ALLOWED_ACCURACY_M = 35;
const MOBILE_MAX_ALLOWED_FIRST_FIX_ACCURACY_M = 80;

function isLikelyMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  if ("userAgentData" in navigator) {
    const uaData = navigator.userAgentData as { mobile?: boolean };
    if (typeof uaData.mobile === "boolean") return uaData.mobile;
  }
  return /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(navigator.userAgent);
}



export type SessionRow = {

  id: string;

  startedAt: string;

  stoppedAt: string | null;

  durationMs: number | null;

  source: string;

};



export function useTracking() {

  const FIRST_FIX_OPTIONS: PositionOptions = {

    enableHighAccuracy: true,

    maximumAge: 0,

    timeout: 15_000,

  };

  const GEO_OPTIONS: PositionOptions = {

    enableHighAccuracy: true,

    maximumAge: 0,

    timeout: 20_000,

  };



  const token = useAuthStore((s) => s.accessToken);

  const [isTracking, setIsTracking] = useState(false);

  const [permissionDenied, setPermissionDenied] = useState(false);

  const [geoError, setGeoError] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  const periodicTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsReconnectAttemptsRef = useRef(0);
  const shouldKeepWsRef = useRef(false);

  const hasSentLocationRef = useRef(false);
  const isMobileRef = useRef(isLikelyMobileDevice());



  const getPermissionState = useCallback(async (): Promise<PermissionState | null> => {

    if (!("permissions" in navigator)) return null;

    try {

      const perm = await navigator.permissions.query({ name: "geolocation" });

      return perm.state;

    } catch {

      return null;

    }

  }, []);



  const requestLocationPrompt = useCallback(async (): Promise<void> => {

    await new Promise<void>((resolve, reject) => {

      navigator.geolocation.getCurrentPosition(

        () => resolve(),

        (err) => reject(err),

        FIRST_FIX_OPTIONS,

      );

    });

  }, []);



  const stopWatch = useCallback(() => {

    if (watchIdRef.current != null) {

      navigator.geolocation.clearWatch(watchIdRef.current);

      watchIdRef.current = null;

    }

  }, []);



  const closeWs = useCallback(() => {
    shouldKeepWsRef.current = false;
    if (wsReconnectTimerRef.current) {
      clearTimeout(wsReconnectTimerRef.current);
      wsReconnectTimerRef.current = null;
    }

    wsRef.current?.close();

    wsRef.current = null;

  }, []);

  const clearPeriodicTimer = useCallback(() => {
    if (periodicTimerRef.current) {
      clearTimeout(periodicTimerRef.current);
      periodicTimerRef.current = null;
    }
  }, []);

  const trySendPosition = useCallback(async (coords: GeolocationCoordinates) => {
    const accuracy = coords.accuracy;
    if (!Number.isFinite(accuracy)) return false;

    if (isMobileRef.current) {
      const maxAccuracy = hasSentLocationRef.current
        ? MOBILE_MAX_ALLOWED_ACCURACY_M
        : MOBILE_MAX_ALLOWED_FIRST_FIX_ACCURACY_M;
      if (accuracy > maxAccuracy) return false;
    }

    const payload = {
      lat: coords.latitude,
      lng: coords.longitude,
      accuracy,
      speed: coords.speed ?? undefined,
      heading: coords.heading ?? undefined,
      altitude: coords.altitude ?? undefined,
    };

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "LOCATION_UPDATE", ...payload }));
      hasSentLocationRef.current = true;
      return true;
    }

    try {
      const res = await api.tracking.location.post(payload);
      const body = res.data as unknown;
      if (res.status === 200 && body && !isApiError(body)) {
        hasSentLocationRef.current = true;
        return true;
      }
    } catch {
      /* rede */
    }

    return false;
  }, []);

  const openTrackingWs = useCallback((accessToken: string) => {
    if (!accessToken) return;
    shouldKeepWsRef.current = true;
    if (wsReconnectTimerRef.current) {
      clearTimeout(wsReconnectTimerRef.current);
      wsReconnectTimerRef.current = null;
    }

    const ws = new WebSocket(`${wsBaseUrl()}/ws/tracking?token=${encodeURIComponent(accessToken)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      wsReconnectAttemptsRef.current = 0;
    };

    ws.onclose = () => {
      if (!shouldKeepWsRef.current) return;
      const currentToken = useAuthStore.getState().accessToken;
      if (!currentToken) return;
      const delay = Math.min(1000 * 2 ** wsReconnectAttemptsRef.current, 30_000);
      wsReconnectAttemptsRef.current += 1;
      wsReconnectTimerRef.current = window.setTimeout(() => {
        openTrackingWs(currentToken);
      }, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);



  const syncOpenSession = useCallback(async () => {

    const res = await api.tracking.history.get({ query: { page: 1, limit: 1 } });

    const body = res.data as unknown;

    if (res.status !== 200 || !body || isApiError(body)) return;

    const { items } = unwrapPaginated<SessionRow>(body);

    const latest = items[0];

    if (latest && latest.stoppedAt == null) {

      setIsTracking(true);
      const currentToken = useAuthStore.getState().accessToken;
      if (
        currentToken &&
        watchIdRef.current == null &&
        !permissionDenied &&
        "geolocation" in navigator &&
        window.isSecureContext
      ) {
        openTrackingWs(currentToken);
        hasSentLocationRef.current = false;
        watchIdRef.current = navigator.geolocation.watchPosition(
          ({ coords }) => {
            void trySendPosition(coords);
          },
          (err: GeolocationPositionError) => {
            if (err.code === 1) {
              setPermissionDenied(true);
            } else {
              setGeoError(
                err.code === 2
                  ? "Posição indisponível. Verifique se o GPS está ativo."
                  : err.code === 3
                    ? "Tempo esgotado ao obter localização. Tente novamente."
                    : "Não foi possível obter sua localização.",
              );
            }
          },
          GEO_OPTIONS,
        );
      }

    } else {

      setIsTracking(false);

    }

  }, [permissionDenied, trySendPosition, openTrackingWs]);



  useEffect(() => {

    void syncOpenSession();

  }, [syncOpenSession]);

  /** Sincroniza com o servidor (mobile/outra aba parou ou iniciou sessão). */
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function tick() {
      try {
        const res = await api.tracking["session-status"].get();
        const body = res.data as unknown;
        if (cancelled || res.status !== 200 || !body || isApiError(body)) return;
        const { active } = unwrapData<{ active: boolean; sessionId: string | null }>(body);
        if (!active) {
          stopWatch();
          closeWs();
          hasSentLocationRef.current = false;
          setIsTracking(false);
          return;
        }
        await syncOpenSession();
      } catch {
        /* rede */
      }
    }
    async function loop() {
      while (!cancelled) {
        await tick();
        const ms = document.visibilityState === "hidden" ? 30_000 : 5_000;
        await new Promise((r) => window.setTimeout(r, ms));
      }
    }
    void loop();
    const onVis = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [token, syncOpenSession, stopWatch, closeWs]);



  const startTracking = useCallback(async () => {

    if (!token) return;

    if (!("geolocation" in navigator)) {

      throw new Error("Seu navegador nao suporta geolocalizacao.");

    }

    if (!window.isSecureContext) {

      throw new Error("Geolocalizacao no navegador exige HTTPS ou localhost.");

    }

    setPermissionDenied(false);

    setGeoError(null);



    const permissionState = await getPermissionState();

    if (permissionState === "denied") {

      setPermissionDenied(true);

    }



    try {

      /* Sempre tentamos novamente ao ativar, para forcar prompt em estados "prompt"/"ask". */

      await requestLocationPrompt();

      setPermissionDenied(false);

    } catch (err) {

      const geoErr = err as GeolocationPositionError;

      if (geoErr?.code === 1) {

        setPermissionDenied(true);

        throw new Error(

          "Permissao de localizacao negada. Toque em permitir no navegador ou habilite nas configuracoes.",

        );

      }

      if (geoErr?.code === 2) {

        throw new Error("Posicao indisponivel. Ative GPS/localizacao do dispositivo e tente novamente.");

      }

      if (geoErr?.code === 3) {

        throw new Error("Tempo esgotado ao obter localizacao. Verifique sinal/GPS e tente novamente.");

      }

      throw new Error("Nao foi possivel solicitar localizacao no dispositivo.");

    }



    const startRes = await api.tracking.start.post({});

    const startBody = startRes.data as unknown;

    if (startRes.status !== 201 || !startBody || isApiError(startBody)) {

      throw new Error(isApiError(startBody) ? startBody.error.message : "Não foi possível iniciar o rastreio");

    }



    openTrackingWs(token);

    hasSentLocationRef.current = false;



    watchIdRef.current = navigator.geolocation.watchPosition(

      ({ coords }) => {

        void trySendPosition(coords);

      },

      (err: GeolocationPositionError) => {

        if (err.code === 1) {

          setPermissionDenied(true);

        } else {

          setGeoError(

            err.code === 2

              ? "Posição indisponível. Verifique se o GPS está ativo."

              : err.code === 3

                ? "Tempo esgotado ao obter localização. Tente novamente."

                : "Não foi possível obter sua localização.",

          );

        }

      },

      GEO_OPTIONS,

    );



    setIsTracking(true);

  }, [token, getPermissionState, requestLocationPrompt, trySendPosition, openTrackingWs]);

  useEffect(() => {
    if (!isTracking) {
      clearPeriodicTimer();
      return;
    }
    if (!("geolocation" in navigator)) return;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, GEO_OPTIONS);
        });
        await trySendPosition(pos.coords);
      } catch {
        /* navegador pode limitar em background; seguimos tentando */
      }

      if (cancelled) return;
      const ms = document.visibilityState === "hidden" ? 30_000 : 10_000;
      periodicTimerRef.current = window.setTimeout(() => {
        void tick();
      }, ms);
    };

    void tick();
    const onVis = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      clearPeriodicTimer();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [isTracking, trySendPosition, clearPeriodicTimer]);



  const stopTracking = useCallback(async () => {

    stopWatch();

    closeWs();

    hasSentLocationRef.current = false;

    const res = await api.tracking.stop.post({});

    const body = res.data as unknown;

    if (res.status !== 200 || !body || isApiError(body)) {

      /* ainda assim limpamos estado local */

    }

    setIsTracking(false);

    await syncOpenSession();

  }, [stopWatch, closeWs, syncOpenSession]);



  useEffect(() => {

    return () => {

      stopWatch();

      closeWs();

      clearPeriodicTimer();

      hasSentLocationRef.current = false;

    };

  }, [stopWatch, closeWs, clearPeriodicTimer]);



  return {

    isTracking,

    permissionDenied,

    geoError,

    startTracking,

    stopTracking,

    syncOpenSession,

  };

}

