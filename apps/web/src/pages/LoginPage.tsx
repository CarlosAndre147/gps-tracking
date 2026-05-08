import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthRequestError } from "@/store/auth.store";
import { useAuthStore } from "@/store/auth.store";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Navigate, useNavigate } from "react-router";
import { z } from "zod";
import { AlertCircle, Eye, EyeOff, Loader2, LockKeyhole, Mail } from "lucide-react";
import { useEffect, useState } from "react";

const schema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Informe seu e-mail")
    .email("Digite um e-mail valido, ex: nome@empresa.com"),
  password: z
    .string()
    .trim()
    .min(1, "Informe sua senha")
    .min(6, "Senha com no minimo 6 caracteres"),
});

type Form = z.infer<typeof schema>;

function normalizeLoginError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Nao foi possivel entrar agora. Tente novamente em instantes.";
  }
  if (error instanceof AuthRequestError) {
    if (error.code === "UNAUTHORIZED" || error.status === 401) {
      return "E-mail ou senha incorretos. Confira as credenciais e tente novamente.";
    }
    if (error.code === "RATE_LIMITED" || error.status === 429) {
      return "Voce fez muitas tentativas em pouco tempo. Por seguranca, o acesso foi bloqueado temporariamente. Aguarde alguns minutos antes de tentar novamente.";
    }
    if (error.code === "NETWORK_ERROR" || error.status === 0) {
      return "Falha de conexao com a API. Verifique se o backend esta rodando e a URL em VITE_API_URL.";
    }
    if (error.status === 404) {
      return "Servico de autenticacao nao encontrado (404). Confira a URL base da API.";
    }
    if (error.status === 502 || error.status === 503 || error.status === 504) {
      return `API indisponivel no momento (HTTP ${error.status}). Tente novamente em instantes.`;
    }
    if (error.status && error.status >= 500) {
      return `Erro interno da API (HTTP ${error.status}).`;
    }
    if (error.code === "LOGIN_FAILED" && error.status) {
      return `Nao foi possivel autenticar (HTTP ${error.status}).`;
    }
  }
  const message = error.message.toLowerCase();
  if (
    message.includes("401") ||
    message.includes("unauthorized") ||
    message.includes("credenciais") ||
    message.includes("invalid") ||
    message.includes("inval")
  ) {
    return "E-mail ou senha incorretos. Confira os dados e tente novamente.";
  }
  if (
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("muitas tentativas") ||
    message.includes("limite de tentativas")
  ) {
    return "Voce fez muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.";
  }
  if (
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("timeout") ||
    message.includes("conexao") ||
    message.includes("cors")
  ) {
    return "Sem conexao com a API. Confirme se o servidor esta no ar e a URL base esta correta.";
  }
  return "Nao foi possivel entrar agora. Tente novamente em instantes.";
}

export function LoginPage() {
  const user = useAuthStore((s) => s.user);
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  useEffect(() => {
    const subscription = watch(() => {
      setFormError(null);
    });
    return () => subscription.unsubscribe();
  }, [watch]);

  if (bootstrapped && user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="box-border flex min-h-dvh w-full items-center justify-center overflow-x-hidden bg-layout-body px-4 py-6 sm:py-10">
      <Card className="w-full max-w-md shadow-md">
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-xl">
            <span className="rounded-full bg-brand-primary/15 p-1.5 text-brand-secondary" aria-hidden="true">
              <LockKeyhole className="h-4 w-4" />
            </span>
            Entrar
          </CardTitle>
          <p className="text-sm text-text-secondary">
            Acesse com seu e-mail corporativo para abrir o painel do GPS Tracker.
          </p>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-5"
            onSubmit={handleSubmit(async (data) => {
              setFormError(null);
              try {
                await login(data.email.trim(), data.password);
                navigate("/", { replace: true });
              } catch (e) {
                setFormError(normalizeLoginError(e));
              }
            })}
          >
            {formError && (
              <div
                role="alert"
                aria-live="polite"
                className="flex items-start gap-2 rounded-lg border border-feedback-error/30 bg-feedback-error/10 px-3 py-2.5 text-sm text-feedback-error"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <p>{formError}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                E-mail
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                autoFocus
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? "email-error" : undefined}
                className={errors.email ? "border-feedback-error/60 focus-visible:outline-feedback-error" : ""}
                {...register("email")}
              />
              {errors.email && (
                <p id="email-error" className="text-xs text-feedback-error">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? "password-error" : capsLockOn ? "caps-lock-tip" : undefined}
                  className={errors.password ? "border-feedback-error/60 pr-11 focus-visible:outline-feedback-error" : "pr-11"}
                  {...register("password")}
                  onKeyUp={(event) => setCapsLockOn(event.getModifierState("CapsLock"))}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center text-text-secondary transition-colors hover:text-text-main"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {capsLockOn && !errors.password && (
                <p id="caps-lock-tip" className="text-xs text-text-secondary">
                  Caps Lock ativado.
                </p>
              )}
              {errors.password && (
                <p id="password-error" className="text-xs text-feedback-error">
                  {errors.password.message}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full gap-2" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {isSubmitting ? "Entrando..." : "Entrar"}
            </Button>
            <p className="text-center text-xs text-text-secondary">
              Se o problema persistir, fale com um administrador do sistema.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
