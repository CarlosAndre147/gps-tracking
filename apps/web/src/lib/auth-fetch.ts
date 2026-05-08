import { useAuthStore } from "@/store/auth.store";

function clearAuthSession() {
  useAuthStore.setState({
    accessToken: null,
    refreshToken: null,
    user: null,
    companies: [],
    bootstrapped: true,
  });
}

/**
 * Fetch com Authorization atual + uma tentativa de refresh em 401 (Eden Treaty usa o mesmo padrão).
 */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = useAuthStore.getState().accessToken;
  const headers = new Headers(init?.headers ?? undefined);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const base: RequestInit = { ...init, headers, credentials: init?.credentials ?? "omit" };
  let res = await globalThis.fetch(input, base);
  if (res.status !== 401) return res;
  if (!useAuthStore.getState().refreshToken) {
    clearAuthSession();
    return res;
  }
  try {
    await useAuthStore.getState().refreshSession();
  } catch {
    clearAuthSession();
    return res;
  }
  const token2 = useAuthStore.getState().accessToken;
  const headers2 = new Headers(init?.headers ?? undefined);
  if (!token2) {
    clearAuthSession();
    return res;
  }
  headers2.set("Authorization", `Bearer ${token2}`);
  return globalThis.fetch(input, { ...init, headers: headers2, credentials: init?.credentials ?? "omit" });
}
