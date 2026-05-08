import { cn } from "@/lib/utils";
import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Página não encontrada</h1>
      <Link
        to="/"
        className={cn(
          "inline-flex h-10 items-center justify-center rounded-lg border border-layout-border bg-layout-card px-4 text-sm font-medium text-text-main hover:bg-layout-body",
        )}
      >
        Voltar ao início
      </Link>
    </div>
  );
}
