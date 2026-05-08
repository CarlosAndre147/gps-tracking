import { Button } from "@/components/ui/button";
import { roleLabelPtBr } from "@/lib/role-label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/store/auth.store";
import { ShieldAlert } from "lucide-react";
import { Link, useNavigate } from "react-router";

export function ForbiddenPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-layout-body p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-feedback-error/15 text-feedback-error">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl">Acesso negado</CardTitle>
          <p className="text-sm text-text-secondary">
            Você não tem permissão para ver esta área{user ? ` como ${roleLabelPtBr(user.role)}` : ""}.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link to="/">
            <Button variant="outline" className="w-full sm:w-auto">
              Ir ao início
            </Button>
          </Link>
          <Button
            onClick={() => {
              navigate(-1);
            }}
          >
            Voltar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
