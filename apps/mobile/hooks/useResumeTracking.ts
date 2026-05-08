import * as SecureStore from "expo-secure-store";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { useEffect } from "react";

import { LOCATION_TASK_NAME } from "@/tasks/locationTask";

export function useResumeTracking(enabled: boolean, startTracking: () => Promise<void>) {
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const [was, reg, started] = await Promise.all([
        SecureStore.getItemAsync("trackingActive"),
        TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME),
        Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME),
      ]);
      if (cancelled) return;
      if (was === "true" && (!reg || !started)) {
        try {
          const fg = await Location.getForegroundPermissionsAsync();
          const bg = await Location.getBackgroundPermissionsAsync();
          if (fg.status !== "granted" || bg.status !== "granted") {
            return;
          }
          await startTracking();
        } catch {
          /* silêncio */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, startTracking]);
}
