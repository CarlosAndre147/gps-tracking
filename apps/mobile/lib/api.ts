import { treaty } from "@elysiajs/eden";
import type { App } from "@gps-tracker/api/contract";
import * as SecureStore from "expo-secure-store";

import { apiBaseUrl } from "@/lib/env";
import { authFetch } from "@/lib/auth-fetch";

/* pnpm pode instanciar dois "elysia" virtuais (mesma versão) → TS2344 no generic do treaty. */
// @ts-expect-error TS2344 — identidade de tipo Elysia duplicada entre @gps-tracker/api/contract e @elysiajs/eden
export const api = treaty<App>(apiBaseUrl(), {
  fetch: authFetch as never,
  headers: async () => {
    const token = await SecureStore.getItemAsync("accessToken");
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
});
