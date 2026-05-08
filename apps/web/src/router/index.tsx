import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { AdminDashboardPage } from "@/pages/admin/AdminDashboardPage";
import { AuditPage } from "@/pages/admin/AuditPage";
import { CompaniesPage } from "@/pages/admin/CompaniesPage";
import { CompanyDetailPage } from "@/pages/admin/CompanyDetailPage";
import { UsersPage } from "@/pages/admin/UsersPage";
import { UserDetailPage } from "@/pages/admin/UserDetailPage";
import { TrackingMapPage } from "@/pages/company/TrackingMapPage";
import { CompanyUsersPage } from "@/pages/company/CompanyUsersPage";
import { ForbiddenPage } from "@/pages/ForbiddenPage";
import { LoginPage } from "@/pages/LoginPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { UserTrackingPage } from "@/pages/user/UserTrackingPage";
import { useAuthStore } from "@/store/auth.store";
import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, matchPath, useLocation } from "react-router";

const APP_NAME = "GPS Tracker";

function getPageTitle(pathname: string): string {
  const routes: Array<{ path: string; title: string }> = [
    { path: "/login", title: "Login" },
    { path: "/forbidden", title: "Acesso negado" },
    { path: "/admin/companies", title: "Empresas" },
    { path: "/admin/companies/:id", title: "Detalhe da empresa" },
    { path: "/admin/users", title: "Usuários" },
    { path: "/admin/users/:id", title: "Detalhe do usuário" },
    { path: "/admin/audit-logs", title: "Auditoria" },
    { path: "/admin", title: "Início" },
    { path: "/company/dashboard", title: "Mapa ao vivo" },
    { path: "/company/users", title: "Usuários" },
    { path: "/user/dashboard", title: "Meu rastreamento" },
    { path: "*", title: "Página não encontrada" },
  ];

  const match = routes.find((route) => matchPath(route.path, pathname));
  return match ? `${match.title} | ${APP_NAME}` : APP_NAME;
}

function RouteTitleManager() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = getPageTitle(pathname);
  }, [pathname]);

  return null;
}

function HomeRedirect() {
  const user = useAuthStore((s) => s.user);
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  if (!bootstrapped) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "SYSTEM_ADMIN") return <Navigate to="/admin" replace />;
  if (user.role === "COMPANY_ADMIN") return <Navigate to="/company/dashboard" replace />;
  return <Navigate to="/user/dashboard" replace />;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <RouteTitleManager />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forbidden" element={<ForbiddenPage />} />
        <Route path="/" element={<HomeRedirect />} />

        <Route element={<ProtectedRoute roles={["SYSTEM_ADMIN"]} />}>
          <Route element={<AppShell />}>
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/admin/companies" element={<CompaniesPage />} />
            <Route path="/admin/companies/:id" element={<CompanyDetailPage />} />
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/users/:id" element={<UserDetailPage />} />
            <Route path="/admin/audit-logs" element={<AuditPage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={["COMPANY_ADMIN"]} />}>
          <Route element={<AppShell />}>
            <Route path="/company/dashboard" element={<TrackingMapPage />} />
            <Route path="/company/users" element={<CompanyUsersPage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={["USER"]} />}>
          <Route element={<AppShell />}>
            <Route path="/user/dashboard" element={<UserTrackingPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
