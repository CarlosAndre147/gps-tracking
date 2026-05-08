import { Redirect } from "expo-router";
import { useAuthStore } from "@/store/auth.store";

export default function Index() {
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const lastKnownRole = useAuthStore((s) => s.lastKnownRole);

  if (!bootstrapped) {
    return null;
  }
  if (!accessToken) {
    return <Redirect href="/(auth)/login" />;
  }
  const role = user?.role ?? lastKnownRole;
  if (role === "USER") {
    return <Redirect href="/(user)" />;
  }
  return <Redirect href="/(admin)" />;
}
