import { ValidationError } from "@/lib/core/errors";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export type PaginationInput = {
  page?: number;
  limit?: number;
};

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
};

export function parsePagination(input: PaginationInput): { skip: number; take: number; page: number; limit: number } {
  const page = input.page ?? DEFAULT_PAGE;
  const limit = input.limit ?? DEFAULT_LIMIT;
  if (!Number.isFinite(page) || page < 1) {
    throw new ValidationError("page must be >= 1");
  }
  if (!Number.isFinite(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new ValidationError(`limit must be between 1 and ${MAX_LIMIT}`);
  }
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

export function paginationMeta(page: number, limit: number, total: number): PaginationMeta {
  return { page, limit, total };
}
