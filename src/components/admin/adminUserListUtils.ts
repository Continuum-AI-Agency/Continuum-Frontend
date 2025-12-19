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

