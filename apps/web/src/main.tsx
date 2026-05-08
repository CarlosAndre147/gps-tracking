import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { AppRouter } from "@/router";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/store/auth.store";
import "@/index.css";

function PersistGate({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(() => useAuthStore.persist.hasHydrated());

  useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    if (useAuthStore.persist.hasHydrated()) {
      setHydrated(true);
    }
    return unsub;
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void useAuthStore.getState().bootstrap();
  }, [hydrated]);

  if (!hydrated) {
    return <div className="p-6 text-sm text-text-secondary">Carregando sessão…</div>;
  }

  return <>{children}</>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <PersistGate>
        <AppRouter />
        <Toaster richColors position="bottom-right" theme="light" />
      </PersistGate>
    </QueryClientProvider>
  </StrictMode>,
);
