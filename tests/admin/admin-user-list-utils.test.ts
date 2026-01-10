import { expect, test } from "bun:test";

import {
  buildAdminPaginationRange,
  buildAdminUserListPaginationParams,
  buildAdminUserListSearchParams,
  groupPermissionsByUserId,
} from "@/components/admin/adminUserListUtils";
import type { PermissionRow } from "@/components/admin/adminUserTypes";

test("groupPermissionsByUserId groups permissions and preserves order per user", () => {
  const permissions: PermissionRow[] = [
    {
      user_id: "user-1",
      brand_profile_id: "brand-1",
      role: "owner",
      tier: 1,
      brand_name: "Brand 1",
    },
    {
      user_id: "user-2",
      brand_profile_id: "brand-2",
      role: "viewer",
      tier: 2,
      brand_name: "Brand 2",
    },
    {
      user_id: "user-1",
      brand_profile_id: "brand-3",
      role: "editor",
      tier: 3,
      brand_name: "Brand 3",
    },
  ];

  const map = groupPermissionsByUserId(permissions);

  expect(map.get("user-1")?.map((p) => p.brand_profile_id)).toEqual(["brand-1", "brand-3"]);
  expect(map.get("user-2")?.map((p) => p.brand_profile_id)).toEqual(["brand-2"]);
  expect(map.get("missing")).toBeUndefined();
});

test("buildAdminPaginationRange returns full range when page count is small", () => {
  const result = buildAdminPaginationRange({ currentPage: 2, totalPages: 5, siblingCount: 1 });

  expect(result).toEqual([1, 2, 3, 4, 5]);
});

test("buildAdminPaginationRange inserts ellipsis for larger ranges", () => {
  const result = buildAdminPaginationRange({ currentPage: 6, totalPages: 12, siblingCount: 1 });

  expect(result).toEqual([1, "ellipsis", 5, 6, 7, "ellipsis", 12]);
});

test("buildAdminPaginationRange returns empty list when totalPages is zero", () => {
  const result = buildAdminPaginationRange({ currentPage: 1, totalPages: 0, siblingCount: 1 });

  expect(result).toEqual([]);
});

test("buildAdminUserListPaginationParams keeps query and updates paging", () => {
  const result = buildAdminUserListPaginationParams("query=duane&page=2&pageSize=50", 3, 50);

  expect(result).toContain("query=duane");
  expect(result).toContain("page=3");
  expect(result).toContain("pageSize=50");
});

test("buildAdminUserListSearchParams updates query and resets page", () => {
  const result = buildAdminUserListSearchParams("page=2&pageSize=50", "sam", 25);

  expect(result).toContain("query=sam");
  expect(result).toContain("page=1");
  expect(result).toContain("pageSize=25");
});

test("buildAdminUserListSearchParams clears query when empty", () => {
  const result = buildAdminUserListSearchParams("query=duane&page=2&pageSize=50", "   ", 50);

  expect(result).not.toContain("query=duane");
  expect(result).toContain("page=1");
  expect(result).toContain("pageSize=50");
});
