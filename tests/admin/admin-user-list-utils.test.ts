import { expect, test } from "bun:test";

import { filterAndSortAdminUsers, groupPermissionsByUserId } from "@/components/admin/adminUserListUtils";
import type { AdminUser, PermissionRow } from "@/components/admin/adminUserTypes";

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

test("filterAndSortAdminUsers keeps original order when query is empty", () => {
  const users: AdminUser[] = [
    { id: "user-1", email: "zoe@example.com", name: "Zoe", isAdmin: false, createdAt: null },
    { id: "user-2", email: "alex@example.com", name: "Alex", isAdmin: false, createdAt: null },
  ];

  const result = filterAndSortAdminUsers(users, "");

  expect(result.map((user) => user.id)).toEqual(["user-1", "user-2"]);
});

test("filterAndSortAdminUsers filters and ranks name matches ahead of email matches", () => {
  const users: AdminUser[] = [
    { id: "user-1", email: "samuel@example.com", name: "Samuel", isAdmin: false, createdAt: null },
    { id: "user-2", email: "sam@example.com", name: "Sam", isAdmin: false, createdAt: null },
    { id: "user-3", email: "ally@example.com", name: "Allison", isAdmin: false, createdAt: null },
    { id: "user-4", email: "samantha@example.com", name: null, isAdmin: false, createdAt: null },
  ];

  const result = filterAndSortAdminUsers(users, "sam");

  expect(result.map((user) => user.id)).toEqual(["user-2", "user-1", "user-4"]);
});
