import type { Elysia } from "elysia";

/**
 * Instância Elysia após plugins globais (CORS, JWT, macros).
 * Genéricos como `any` para permitir `.group()` aninhados sem perder atribuição;
 * macros RBAC continuam válidas em runtime.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppInstance = Elysia<any, any, any, any, any, any, any>;
