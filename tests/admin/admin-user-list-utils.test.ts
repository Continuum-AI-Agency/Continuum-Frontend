import { expect, test } from "bun:test";

import { groupPermissionsByUserId } from "@/components/admin/adminUserListUtils";
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

