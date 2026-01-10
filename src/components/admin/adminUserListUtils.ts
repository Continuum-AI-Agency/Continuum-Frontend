import type { PermissionRow } from "@/components/admin/adminUserTypes";

export function groupPermissionsByUserId(permissions: PermissionRow[]) {
  const byUserId = new Map<string, PermissionRow[]>();

  permissions.forEach((permission) => {
    const existing = byUserId.get(permission.user_id);
    if (existing) {
      existing.push(permission);
      return;
    }
    byUserId.set(permission.user_id, [permission]);
  });

  return byUserId;
}

export type PaginationItem = number | "ellipsis";

type PaginationRangeInput = {
  currentPage: number;
  totalPages: number;
  siblingCount?: number;
};

export function buildAdminPaginationRange({
  currentPage,
  totalPages,
  siblingCount = 1,
}: PaginationRangeInput): PaginationItem[] {
  if (totalPages <= 0) return [];
  if (totalPages <= 2 * siblingCount + 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const clampedPage = Math.max(1, Math.min(currentPage, totalPages));
  const leftSibling = Math.max(2, clampedPage - siblingCount);
  const rightSibling = Math.min(totalPages - 1, clampedPage + siblingCount);

  const items: PaginationItem[] = [1];

  if (leftSibling > 2) {
    items.push("ellipsis");
  }

  for (let page = leftSibling; page <= rightSibling; page += 1) {
    items.push(page);
  }

  if (rightSibling < totalPages - 1) {
    items.push("ellipsis");
  }

  items.push(totalPages);

  return items;
}

export function buildAdminUserListPaginationParams(
  currentParams: string,
  nextPage: number,
  pageSize: number
) {
  const params = new URLSearchParams(currentParams);
  params.set("page", String(nextPage));
  params.set("pageSize", String(pageSize));
  return params.toString();
}

export function buildAdminUserListSearchParams(
  currentParams: string,
  query: string,
  pageSize: number
) {
  const params = new URLSearchParams(currentParams);
  const trimmedQuery = query.trim();

  if (trimmedQuery) {
    params.set("query", trimmedQuery);
  } else {
    params.delete("query");
  }

  params.set("page", "1");
  params.set("pageSize", String(pageSize));
  return params.toString();
}
