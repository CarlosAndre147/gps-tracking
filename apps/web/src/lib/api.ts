import { treaty } from "@elysiajs/eden";
import { apiBaseUrl } from "./env";
import type { GpsApiClient } from "./api-types";
import { authFetch } from "./auth-fetch";
import { useAuthStore } from "@/store/auth.store";

export const api = treaty<GpsApiClient>(apiBaseUrl(), {
  /** Eden tipa `fetch` como RequestInit parcial; o cliente suporta função custom (refresh em 401). */
  fetch: authFetch as never,
  headers: () => {
    const token = useAuthStore.getState().accessToken;
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
});
