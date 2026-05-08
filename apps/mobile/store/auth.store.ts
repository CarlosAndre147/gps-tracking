import { create } from "zustand";

import { api } from "@/lib/api";
import { apiBaseUrl } from "@/lib/env";
import { isApiError, unwrapData } from "@/lib/api-result";
import * as SecureStore from "expo-secure-store";
import { queryClient } from "@/lib/queryClient";

export type Role = "SYSTEM_ADMIN" | "COMPANY_ADMIN" | "USER";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  cpf: string;
  phone: string;
  role: Role;
  isActive: boolean;
};

export type MeCompany = {
  id: string;
  name: string;
  cnpj: string;
  email: string;
  phone: string;
  isActive: boolean;
};

export class AuthRequestError extends Error {
  code?: string;
  status?: number;
  detail?: string;

  constructor(message: string, opts?: { code?: string; status?: number; detail?: string }) {
    super(message);
    this.name = "AuthRequestError";
    this.code = opts?.code;
    this.status = opts?.status;
    this.detail = opts?.detail;
  }
}

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  companies: MeCompany[];
  lastKnownRole: Role | null;
  bootstrapped: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  bootstrap: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

let refreshInFlight: Promise<void> | null = null;

async function rawRefresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await fetch(`${apiBaseUrl()}/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  const json: unknown = await res.json();
  if (!res.ok || isApiError(json)) {
    throw new Error(isApiError(json) ? json.error.message : "Sessão expirada");
  }
  return unwrapData(json);
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  companies: [],
  lastKnownRole: null,
  bootstrapped: false,

  refreshSession: async () => {
    const rt = get().refreshToken ?? (await SecureStore.getItemAsync("refreshToken"));
    if (!rt) {
      throw new Error("Sem refresh token");
    }
    if (refreshInFlight) {
      await refreshInFlight;
      return;
    }
    refreshInFlight = (async () => {
      const tokens = await rawRefresh(rt);
      await SecureStore.setItemAsync("accessToken", tokens.accessToken);
      await SecureStore.setItemAsync("refreshToken", tokens.refreshToken);
      set({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
      const me = await api.auth.me.get();
      const body = me.data as unknown;
      if (me.status === 200 && body && !isApiError(body)) {
        const m = unwrapData<{ user: AuthUser; companies: MeCompany[] }>(body);
        await SecureStore.setItemAsync("lastKnownRole", m.user.role);
        set({ user: m.user, companies: m.companies, lastKnownRole: m.user.role });
      }
    })().finally(() => {
      refreshInFlight = null;
    });
    await refreshInFlight;
  },

  login: async (email, password) => {
    let res: Awaited<ReturnType<typeof api.auth.login.post>>;
    try {
      res = await api.auth.login.post({ email, password });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new AuthRequestError("Falha de rede ao tentar autenticar", {
        code: "NETWORK_ERROR",
        status: 0,
        detail,
      });
    }

    const body = res.data as unknown;
    if (res.status !== 200 || !body || isApiError(body)) {
      if (isApiError(body)) {
        throw new AuthRequestError(body.error.message, {
          code: body.error.code,
          status: res.status,
          detail: `API error code=${body.error.code}`,
        });
      }
      throw new AuthRequestError(`Falha no login (HTTP ${res.status})`, {
        code: "LOGIN_FAILED",
        status: res.status,
      });
    }
    const data = unwrapData<{ accessToken: string; refreshToken: string; user: AuthUser }>(body);
    await SecureStore.setItemAsync("accessToken", data.accessToken);
    await SecureStore.setItemAsync("refreshToken", data.refreshToken);
    set({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.user,
      lastKnownRole: data.user.role,
    });
    await SecureStore.setItemAsync("lastKnownRole", data.user.role);
    const me = await api.auth.me.get();
    const meBody = me.data as unknown;
    if (me.status === 200 && meBody && !isApiError(meBody)) {
      const m = unwrapData<{ user: AuthUser; companies: MeCompany[] }>(meBody);
      await SecureStore.setItemAsync("lastKnownRole", m.user.role);
      set({ user: m.user, companies: m.companies, lastKnownRole: m.user.role });
    }
    set({ bootstrapped: true });
  },

  bootstrap: async () => {
    const accessToken = (await SecureStore.getItemAsync("accessToken")) ?? get().accessToken;
    const refreshToken = (await SecureStore.getItemAsync("refreshToken")) ?? get().refreshToken;
    const persistedRole = (await SecureStore.getItemAsync("lastKnownRole")) as Role | null;
    set({ accessToken, refreshToken, lastKnownRole: persistedRole, bootstrapped: true });

    if (!accessToken) {
      set({ user: null, companies: [], lastKnownRole: null });
      return;
    }
    const clearSession = async () => {
      await SecureStore.deleteItemAsync("accessToken");
      await SecureStore.deleteItemAsync("refreshToken");
      await SecureStore.deleteItemAsync("lastKnownRole");
      set({ accessToken: null, refreshToken: null, user: null, companies: [], lastKnownRole: null });
    };

    const isNetworkError = (err: unknown) => {
      if (!(err instanceof Error)) return false;
      const message = err.message.toLowerCase();
      return message.includes("network") || message.includes("fetch") || message.includes("timeout");
    };

    try {
      const me = await api.auth.me.get();
      const body = me.data as unknown;
      if (me.status === 200 && body && !isApiError(body)) {
        const m = unwrapData<{ user: AuthUser; companies: MeCompany[] }>(body);
        await SecureStore.setItemAsync("lastKnownRole", m.user.role);
        set({ user: m.user, companies: m.companies, lastKnownRole: m.user.role });
        return;
      }

      if (me.status === 401) {
        if (!refreshToken) {
          await clearSession();
          return;
        }
        try {
          await get().refreshSession();
        } catch (err) {
          if (!isNetworkError(err)) {
            await clearSession();
          }
        }
      }
    } catch (err) {
      if (isNetworkError(err)) return;
      if (refreshToken) {
        try {
          await get().refreshSession();
        } catch (refreshErr) {
          if (!isNetworkError(refreshErr)) {
            await clearSession();
          }
        }
      } else {
        await clearSession();
      }
    }
  },

  logout: async () => {
    const refreshToken = get().refreshToken ?? (await SecureStore.getItemAsync("refreshToken"));
    const accessToken = get().accessToken ?? (await SecureStore.getItemAsync("accessToken"));
    try {
      if (refreshToken && accessToken) {
        await api.auth.logout.post({ refreshToken });
      }
    } finally {
      queryClient.clear();
      try {
        await SecureStore.deleteItemAsync("accessToken");
        await SecureStore.deleteItemAsync("refreshToken");
        await SecureStore.deleteItemAsync("lastKnownRole");
      } catch {
        /* ignore */
      }
      set({
        accessToken: null,
        refreshToken: null,
        user: null,
        companies: [],
        lastKnownRole: null,
        bootstrapped: true,
      });
    }
  },
}));
