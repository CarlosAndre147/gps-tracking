import { api } from "@/lib/api";
import { isApiError, unwrapData } from "@/lib/api-result";
import { theme } from "@/constants/theme";
import { LOCATION_TASK_NAME } from "@/tasks/locationTask";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import * as TaskManager from "expo-task-manager";
import { AppState, type AppStateStatus } from "react-native";
import { useCallback, useEffect, useRef, useState } from "react";

export type PermissionState = "unknown" | "granted" | "foreground-only" | "denied";

const LOCATION_UPDATE_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.High,
  timeInterval: 5_000,
  distanceInterval: 10,
  showsBackgroundLocationIndicator: true,
  pausesUpdatesAutomatically: false,
  activityType: Location.ActivityType.AutomotiveNavigation,
  foregroundService: {
    notificationTitle: "Rastreamento ativo",
    notificationBody: "Sua localização está sendo compartilhada com sua empresa.",
    notificationColor: theme.brand.primary,
  },
};

export function useTracking() {
  const [isTracking, setIsTracking] = useState(false);
  const [permissionState, setPermissionState] = useState<PermissionState>("unknown");
  const hasPromptedForActiveSessionRef = useRef(false);
  const suppressAutoPrimerRef = useRef(false);
  const permissionRequestInFlightRef = useRef<Promise<PermissionState> | null>(null);
  const permissionPrimerResolverRef = useRef<((accepted: boolean) => void) | null>(null);
  const [permissionPrimerVisible, setPermissionPrimerVisible] = useState(false);
  const [isPermissionFlowActive, setIsPermissionFlowActive] = useState(false);

  const refreshPermissionState = useCallback(async (): Promise<PermissionState> => {
    const [fgPerm, bgPerm] = await Promise.all([
      Location.getForegroundPermissionsAsync(),
      Location.getBackgroundPermissionsAsync(),
    ]);
    const fgStatus = fgPerm.status;
    const bgStatus = bgPerm.status;
    let nextState: PermissionState;
    if (fgStatus === "undetermined") {
      nextState = "unknown";
    } else if (fgStatus !== "granted") {
      nextState = "denied";
    } else if (bgStatus === "granted") {
      nextState = "granted";
    } else {
      nextState = "foreground-only";
    }
    setPermissionState(nextState);
    return nextState;
  }, []);

  const showPermissionPrimer = useCallback(async (): Promise<boolean> => {
    return await new Promise<boolean>((resolve) => {
      permissionPrimerResolverRef.current = resolve;
      setPermissionPrimerVisible(true);
    });
  }, []);

  const requestPermissions = useCallback(async (): Promise<PermissionState> => {
    const { status: fg } = await Location.requestForegroundPermissionsAsync();
    if (fg !== "granted") {
      setPermissionState("denied");
      return "denied";
    }

    const { status: bg } = await Location.requestBackgroundPermissionsAsync();
    if (bg !== "granted") {
      setPermissionState("foreground-only");
      return "foreground-only";
    }

    setPermissionState("granted");
    return "granted";
  }, []);

  const requestPermissionsWithPrimer = useCallback(async (source: "manual" | "auto"): Promise<PermissionState> => {
    if (permissionRequestInFlightRef.current) {
      return await permissionRequestInFlightRef.current;
    }

    const task = (async () => {
      setIsPermissionFlowActive(true);
      const current = await refreshPermissionState();
      if (current === "granted") return "granted" as PermissionState;
      if (source === "auto" && suppressAutoPrimerRef.current) {
        return current;
      }

      const accepted = await showPermissionPrimer();
      if (!accepted) {
        if (source === "auto") suppressAutoPrimerRef.current = true;
        return await refreshPermissionState();
      }

      return await requestPermissions();
    })();

    permissionRequestInFlightRef.current = task;
    try {
      return await task;
    } finally {
      setTimeout(() => {
        void refreshPermissionState();
        setIsPermissionFlowActive(false);
      }, 800);
      permissionRequestInFlightRef.current = null;
    }
  }, [refreshPermissionState, requestPermissions, showPermissionPrimer]);

  const ensureLocationWorkerRunning = useCallback(async () => {
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (hasStarted) return;
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, LOCATION_UPDATE_OPTIONS);
  }, []);

  useEffect(() => {
    async function checkState() {
      const [wasTracking, isRegistered, hasStarted] = await Promise.all([
        SecureStore.getItemAsync("trackingActive"),
        TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME),
        Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME),
      ]);
      await refreshPermissionState();
      setIsTracking(wasTracking === "true" && isRegistered && hasStarted);
    }
    void checkState();
  }, [refreshPermissionState]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") {
        suppressAutoPrimerRef.current = false;
        void refreshPermissionState();
      }
    });
    return () => sub.remove();
  }, [refreshPermissionState]);

  /** Para quando a sessão foi encerrada em outro cliente (ex.: web) — não chama a API de stop. */
  const stopLocalOnly = useCallback(async () => {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
    await SecureStore.setItemAsync("trackingActive", "false");
    setIsTracking(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let appState = AppState.currentState;

    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      appState = next;
      if (next === "active") void tick();
    });

    async function tick() {
      try {
        const access = await SecureStore.getItemAsync("accessToken");
        if (!access || cancelled) return;
        const res = await api.tracking["session-status"].get();
        const body = res.data as unknown;
        if (cancelled || res.status !== 200 || !body || isApiError(body)) return;
        const { active } = unwrapData<{ active: boolean; sessionId: string | null }>(body);
        if (!active) {
          hasPromptedForActiveSessionRef.current = false;
          await stopLocalOnly();
          return;
        }
        const localActive = await SecureStore.getItemAsync("trackingActive");
        if (!cancelled) setIsTracking(true);

        if (appState === "active") {
          const nextPermissionState = await refreshPermissionState();
          if (nextPermissionState !== "granted" && !hasPromptedForActiveSessionRef.current) {
            hasPromptedForActiveSessionRef.current = true;
            const requested = await requestPermissionsWithPrimer("auto");
            if (requested !== "granted") {
              await stopLocalOnly();
              return;
            }
          }
        }

        if (localActive === "true") {
          await ensureLocationWorkerRunning();
        }

        hasPromptedForActiveSessionRef.current = false;
      } catch {
        /* rede */
      }
    }

    async function loop() {
      await new Promise((r) => setTimeout(r, 1200));
      while (!cancelled) {
        await tick();
        const ms = appState === "active" ? 5_000 : 25_000;
        await new Promise((r) => setTimeout(r, ms));
      }
    }

    void loop();
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [ensureLocationWorkerRunning, refreshPermissionState, requestPermissionsWithPrimer, stopLocalOnly]);

  const startTracking = useCallback(async () => {
    suppressAutoPrimerRef.current = false;
    const permission = await requestPermissionsWithPrimer("manual");
    if (permission !== "granted") return;

    let serverAlreadyActive = false;
    try {
      const sRes = await api.tracking["session-status"].get();
      const sBody = sRes.data as unknown;
      if (sRes.status === 200 && sBody && !isApiError(sBody)) {
        const { active } = unwrapData<{ active: boolean; sessionId: string | null }>(sBody);
        serverAlreadyActive = active;
      }
    } catch {
      /* segue com POST /start */
    }

    if (!serverAlreadyActive) {
      const startRes = await api.tracking.start.post({});
      const startBody = startRes.data as unknown;
      if (startRes.status !== 201 || !startBody || isApiError(startBody)) {
        throw new Error(isApiError(startBody) ? startBody.error.message : "Não foi possível iniciar o rastreio");
      }
    }

    await ensureLocationWorkerRunning();

    await SecureStore.setItemAsync("trackingActive", "true");
    setIsTracking(true);
  }, [ensureLocationWorkerRunning, requestPermissionsWithPrimer]);

  const stopTracking = useCallback(async () => {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
    await SecureStore.setItemAsync("trackingActive", "false");
    try {
      await api.tracking.stop.post({});
    } catch {
      /* sessão já encerrada noutro cliente */
    }
    setIsTracking(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function keepWorkerAlive() {
      try {
        const [localActive, remoteStatusRes] = await Promise.all([
          SecureStore.getItemAsync("trackingActive"),
          api.tracking["session-status"].get(),
        ]);
        const body = remoteStatusRes.data as unknown;
        if (
          cancelled ||
          localActive !== "true" ||
          remoteStatusRes.status !== 200 ||
          !body ||
          isApiError(body)
        ) {
          return;
        }
        const { active } = unwrapData<{ active: boolean; sessionId: string | null }>(body);
        if (!active) return;
        const permission = await requestPermissionsWithPrimer("auto");
        if (permission !== "granted") {
          await stopLocalOnly();
          return;
        }
        await ensureLocationWorkerRunning();
      } catch {
        /* rede */
      }
    }

    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") void keepWorkerAlive();
    });
    void keepWorkerAlive();

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [ensureLocationWorkerRunning, requestPermissionsWithPrimer, stopLocalOnly]);

  const resolvePermissionPrimer = useCallback((accepted: boolean) => {
    const resolve = permissionPrimerResolverRef.current;
    if (!resolve) return;
    permissionPrimerResolverRef.current = null;
    setPermissionPrimerVisible(false);
    resolve(accepted);
  }, []);

  const confirmPermissionPrimer = useCallback(() => {
    resolvePermissionPrimer(true);
  }, [resolvePermissionPrimer]);

  const cancelPermissionPrimer = useCallback(() => {
    resolvePermissionPrimer(false);
  }, [resolvePermissionPrimer]);

  return {
    isTracking,
    startTracking,
    stopTracking,
    permissionState,
    permissionPrimerVisible,
    isPermissionFlowActive,
    confirmPermissionPrimer,
    cancelPermissionPrimer,
  };
}
