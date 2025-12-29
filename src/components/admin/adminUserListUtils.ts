import type { AdminUser, PermissionRow } from "@/components/admin/adminUserTypes";

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

type AdminUserMatch = {
  user: AdminUser;
  rank: number;
  label: string;
};

function normalizeSearchQuery(query: string) {
  return query.trim().toLowerCase();
}

function getUserLabel(user: AdminUser) {
  return (user.name ?? user.email).trim();
}

function getMatchRank(user: AdminUser, normalizedQuery: string): number | null {
  if (!normalizedQuery) return null;
  const name = (user.name ?? "").toLowerCase();
  const email = user.email.toLowerCase();

  if (name.startsWith(normalizedQuery)) return 0;
  if (email.startsWith(normalizedQuery)) return 1;
  if (name.includes(normalizedQuery)) return 2;
  if (email.includes(normalizedQuery)) return 3;

  return null;
}

export function filterAndSortAdminUsers(users: AdminUser[], query: string) {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) return users;

  return users
    .reduce<AdminUserMatch[]>((matches, user) => {
      const rank = getMatchRank(user, normalizedQuery);
      if (rank === null) return matches;
      matches.push({ user, rank, label: getUserLabel(user) });
      return matches;
    }, [])
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
    })
    .map((match) => match.user);
}
