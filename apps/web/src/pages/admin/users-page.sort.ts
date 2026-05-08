export type SortBy = "name" | "lastSeenAt" | null;
export type SortDir = "asc" | "desc" | null;

export function toggleSortState(
  currentBy: SortBy,
  currentDir: SortDir,
  target: Exclude<SortBy, null>,
): { sortBy: SortBy; sortDir: SortDir } {
  if (currentBy !== target) return { sortBy: target, sortDir: "asc" };
  if (currentDir === "asc") return { sortBy: target, sortDir: "desc" };
  if (currentDir === "desc") return { sortBy: null, sortDir: null };
  return { sortBy: target, sortDir: "asc" };
}

export function getSortTooltip(sortBy: SortBy, sortDir: SortDir, target: Exclude<SortBy, null>): string {
  if (sortBy !== target || sortDir === null) return "Ordenar crescente";
  if (sortDir === "asc") return "Ordenar decrescente";
  return "Remover ordenação";
}
