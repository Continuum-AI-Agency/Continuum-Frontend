import { beforeEach, expect, test, vi } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { AdminPagination, AdminUser } from "@/components/admin/adminUserTypes";

let routerPushSpy = vi.fn<(path: string) => void>();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushSpy }),
  useSearchParams: () => ({
    get: (key: string) => searchParams.get(key),
    toString: () => searchParams.toString(),
  }),
}));

vi.mock("@radix-ui/react-icons", () => ({
  MagnifyingGlassIcon: () => React.createElement("span", { "data-icon": "search" }),
  ChevronDownIcon: () => React.createElement("span", { "data-icon": "chevron-down" }),
}));

vi.mock("@/components/ui/ToastProvider", () => ({
  useToast: () => ({ show: vi.fn() }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    functions: { invoke: vi.fn() },
  }),
}));

async function renderAdminUserList(props: {
  users: AdminUser[];
  pagination: AdminPagination;
  searchQuery: string;
}) {
  const { AdminUserList } = await import("@/components/admin/AdminUserList");
  return renderToStaticMarkup(
    <AdminUserList users={props.users} permissions={[]} pagination={props.pagination} searchQuery={props.searchQuery} />
  );
}

beforeEach(() => {
  routerPushSpy.mockReset();
  searchParams = new URLSearchParams({ query: "duane", page: "2", pageSize: "50" });
});

test("keeps query param when paging search results", async () => {
  const users: AdminUser[] = [
    { id: "user-1", email: "duane@example.com", name: "Duane", isAdmin: false, createdAt: null },
    { id: "user-2", email: "sam@example.com", name: "Sam", isAdmin: true, createdAt: null },
  ];
  const pagination: AdminPagination = {
    page: 2,
    pageSize: 50,
    totalCount: 120,
    totalPages: 3,
    nextPage: 3,
    lastPage: 3,
    hasNextPage: true,
    hasPrevPage: true,
  };

  const html = await renderAdminUserList({ users, pagination, searchQuery: "duane" });

  expect(html).toContain("matches");
  expect(html).toContain("?query=duane&amp;page=3&amp;pageSize=50");
});
