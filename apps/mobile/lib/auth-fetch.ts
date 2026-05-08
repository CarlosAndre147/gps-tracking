import * as SecureStore from "expo-secure-store";

async function clearAuthSession() {
  try {
    await SecureStore.deleteItemAsync("accessToken");
    await SecureStore.deleteItemAsync("refreshToken");
  } catch {
    /* ignore */
  }
  const { useAuthStore } = await import("@/store/auth.store");
  useAuthStore.setState({
    accessToken: null,
    refreshToken: null,
    user: null,
    companies: [],
    bootstrapped: true,
  });
}

/**
 * Fetch com Authorization atual + uma tentativa de refresh em 401 (Eden Treaty).
 */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = await SecureStore.getItemAsync("accessToken");
  const headers = new Headers(init?.headers ?? undefined);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const base: RequestInit = { ...init, headers, credentials: init?.credentials ?? "omit" };
  let res = await globalThis.fetch(input, base);
  if (res.status !== 401) return res;
  if (!(await SecureStore.getItemAsync("refreshToken"))) {
    await clearAuthSession();
    return res;
  }
  try {
    const { useAuthStore } = await import("@/store/auth.store");
    await useAuthStore.getState().refreshSession();
  } catch {
    await clearAuthSession();
    return res;
  }
  const token2 = await SecureStore.getItemAsync("accessToken");
  const headers2 = new Headers(init?.headers ?? undefined);
  if (!token2) {
    await clearAuthSession();
    return res;
  }
  headers2.set("Authorization", `Bearer ${token2}`);
  return globalThis.fetch(input, { ...init, headers: headers2, credentials: init?.credentials ?? "omit" });
}
