export type ApiSuccess<T> = {
  success: true;
  data: T;
  meta?: { page: number; limit: number; total: number };
};

export type ApiErrorBody = {
  success: false;
  error: { code: string; message: string; details?: unknown };
};

export function assertSuccess<T>(body: unknown): ApiSuccess<T> {
  if (
    body &&
    typeof body === "object" &&
    "success" in body &&
    (body as ApiSuccess<T>).success === true
  ) {
    return body as ApiSuccess<T>;
  }
  throw new Error("Resposta inválida da API");
}

export function unwrapData<T>(body: unknown): T {
  return assertSuccess<T>(body).data;
}

export function isApiError(body: unknown): body is ApiErrorBody {
  return (
    !!body &&
    typeof body === "object" &&
    "success" in body &&
    (body as ApiErrorBody).success === false
  );
}

export function unwrapPaginated<T>(body: unknown): { items: T[]; meta: NonNullable<ApiSuccess<T[]>["meta"]> } {
  const s = assertSuccess<T[]>(body);
  if (!s.meta) {
    throw new Error("Resposta sem meta de paginação");
  }
  return { items: s.data, meta: s.meta };
}
