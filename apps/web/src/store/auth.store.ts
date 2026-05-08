import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { api } from "@/lib/api";
import { apiBaseUrl } from "@/lib/env";
import { isApiError, unwrapData } from "@/lib/api-result";
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

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      companies: [],
      bootstrapped: false,

      refreshSession: async () => {
        const rt = get().refreshToken;
        if (!rt) {
          throw new Error("Sem refresh token");
        }
        if (refreshInFlight) {
          await refreshInFlight;
          return;
        }
        refreshInFlight = (async () => {
          const tokens = await rawRefresh(rt);
          set({
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
          });
          const me = await api.auth.me.get();
          const body = me.data as unknown;
          if (me.status === 200 && body && !isApiError(body)) {
            const m = unwrapData<{ user: AuthUser; companies: MeCompany[] }>(body);
            set({ user: m.user, companies: m.companies });
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
        set({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          user: data.user,
        });
        const me = await api.auth.me.get();
        const meBody = me.data as unknown;
        if (me.status === 200 && meBody && !isApiError(meBody)) {
          const m = unwrapData<{ user: AuthUser; companies: MeCompany[] }>(meBody);
          set({ user: m.user, companies: m.companies });
        }
        set({ bootstrapped: true });
      },

      bootstrap: async () => {
        const { accessToken, refreshToken } = get();
        if (!accessToken) {
          set({ user: null, companies: [], bootstrapped: true });
          return;
        }
        try {
          const me = await api.auth.me.get();
          const body = me.data as unknown;
          if (me.status === 200 && body && !isApiError(body)) {
            const m = unwrapData<{ user: AuthUser; companies: MeCompany[] }>(body);
            set({ user: m.user, companies: m.companies });
          } else if (me.status === 401 && refreshToken) {
            await get().refreshSession();
          } else {
            throw new Error("me failed");
          }
        } catch {
          if (refreshToken) {
            try {
              await get().refreshSession();
            } catch {
              set({ accessToken: null, refreshToken: null, user: null, companies: [] });
            }
          } else {
            set({ accessToken: null, refreshToken: null, user: null, companies: [] });
          }
        } finally {
          set({ bootstrapped: true });
        }
      },

      logout: async () => {
        const { refreshToken, accessToken } = get();
        try {
          if (refreshToken && accessToken) {
            const res = await api.auth.logout.post({ refreshToken });
            if (res.status === 401) {
              /* token já inválido — seguimos com limpeza local */
            }
          }
        } finally {
          queryClient.clear();
          set({
            accessToken: null,
            refreshToken: null,
            user: null,
            companies: [],
            bootstrapped: true,
          });
        }
      },
    }),
    {
      name: "gps-tracker-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
      }),
    },
  ),
);
