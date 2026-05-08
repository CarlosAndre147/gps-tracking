import { Redirect, Stack } from "expo-router";

import { useAuthStore } from "@/store/auth.store";

export default function AdminGroupLayout() {
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const accessToken = useAuthStore((s) => s.accessToken);
  const role = useAuthStore((s) => s.user?.role);
  if (!bootstrapped) return null;
  if (!accessToken) {
    return <Redirect href="/(auth)/login" />;
  }
  if (role === "USER") {
    return <Redirect href="/(user)" />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
