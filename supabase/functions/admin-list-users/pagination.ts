export type AuthListPagination = {
  lastPage?: number | null;
  total?: number | null;
};

export function resolveTotalPages(pagination: AuthListPagination, perPage: number): number | null {
  const lastPage = typeof pagination.lastPage === "number" ? pagination.lastPage : 0;
  if (lastPage > 0) return lastPage;

  const total = typeof pagination.total === "number" ? pagination.total : 0;
  if (total <= 0 || perPage <= 0) return null;

  return Math.ceil(total / perPage);
}
