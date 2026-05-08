import Constants from "expo-constants";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import * as TaskManager from "expo-task-manager";

export const LOCATION_TASK_NAME = "background-location-task";

function apiBase(): string {
  const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;
  const raw = extra?.apiUrl ?? process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
  return raw.replace(/\/$/, "");
}

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error("[LocationTask]", error.message);
    return;
  }

  const { locations } = data as { locations: Location.LocationObject[] };
  const loc = locations[0];
  if (!loc) return;

  const { latitude, longitude, accuracy, speed, heading, altitude } = loc.coords;

  try {
    const token = await SecureStore.getItemAsync("accessToken");
    if (!token) return;

    const isActive = await SecureStore.getItemAsync("trackingActive");
    if (isActive !== "true") {
      return;
    }

    await fetch(`${apiBase()}/tracking/location`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        lat: latitude,
        lng: longitude,
        accuracy: accuracy ?? undefined,
        speed: speed ?? undefined,
        heading: heading ?? undefined,
        altitude: altitude ?? undefined,
      }),
    });
  } catch {
    /* rede — próximo update tenta de novo */
  }
});
