import * as SecureStore from "expo-secure-store";

const KEYS = {
  accessToken: "accessToken",
  refreshToken: "refreshToken",
  trackingActive: "trackingActive",
} as const;

export type SecureTokenKey = keyof typeof KEYS;

export async function getToken(key: SecureTokenKey): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS[key]);
}

export async function setToken(key: SecureTokenKey, value: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS[key], value);
}

export async function clearToken(key: SecureTokenKey): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS[key]);
}

export async function getAccessToken(): Promise<string | null> {
  return getToken("accessToken");
}

export async function setAccessToken(token: string): Promise<void> {
  await setToken("accessToken", token);
}

export async function getRefreshToken(): Promise<string | null> {
  return getToken("refreshToken");
}

export async function setRefreshToken(token: string): Promise<void> {
  await setToken("refreshToken", token);
}

export async function clearAuthTokens(): Promise<void> {
  await clearToken("accessToken");
  await clearToken("refreshToken");
}

export async function getTrackingActive(): Promise<string | null> {
  return getToken("trackingActive");
}

export async function setTrackingActive(value: "true" | "false"): Promise<void> {
  await setToken("trackingActive", value);
}
