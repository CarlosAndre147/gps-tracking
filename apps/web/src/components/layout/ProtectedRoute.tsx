import { useAuthStore } from "@/store/auth.store";
import type { Role } from "@/store/auth.store";
import { Navigate, Outlet } from "react-router";
import { Skeleton } from "@/components/ui/skeleton";

export function ProtectedRoute({ roles }: { roles: Role[] }) {
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const user = useAuthStore((s) => s.user);

  if (!bootstrapped) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!roles.includes(user.role)) {
    return <Navigate to="/forbidden" replace />;
  }

  return <Outlet />;
}
