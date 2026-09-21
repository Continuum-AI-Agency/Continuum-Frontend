import { beforeEach, expect, test, vi } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { AdminPagination, AdminUser, PermissionRow } from '@/components/admin/adminUserTypes';

// lucide-react used to be mocked here with a hand-written allowlist of glyph names. That
// allowlist could only ever be a snapshot: every icon a new child component reached for
// resolved against the real CJS bundle instead and threw `Export named 'X' not found`,
// which failed the whole file before a single assertion ran. The real package renders
// fine under renderToStaticMarkup, so there is nothing to mock.

const routerPushSpy = vi.fn<(path: string) => void>();
let searchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushSpy }),
  useSearchParams: () => ({
    get: (key: string) => searchParams.get(key),
    toString: () => searchParams.toString(),
  }),
}));

vi.mock('@/components/ui/ToastProvider', () => ({
  useToast: () => ({ show: vi.fn() }),
}));

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    functions: { invoke: vi.fn() },
  }),
}));

async function renderAdminUserList(props: {
  users: AdminUser[];
  permissions?: PermissionRow[];
  pagination: AdminPagination;
  searchQuery: string;
}) {
  const { AdminUserList } = await import('@/components/admin/AdminUserList');
  return renderToStaticMarkup(
    <AdminUserList
      users={props.users}
      permissions={props.permissions ?? []}
      pagination={props.pagination}
      searchQuery={props.searchQuery}
    />,
  );
}

beforeEach(() => {
  routerPushSpy.mockReset();
  searchParams = new URLSearchParams({ query: 'duane', page: '2', pageSize: '50' });
});

test('keeps query param when paging search results', async () => {
  const users: AdminUser[] = [
    { id: 'user-1', email: 'duane@example.com', name: 'Duane', isAdmin: false, createdAt: null },
    { id: 'user-2', email: 'sam@example.com', name: 'Sam', isAdmin: true, createdAt: null },
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

  const html = await renderAdminUserList({ users, pagination, searchQuery: 'duane' });

  expect(html).toContain('matches');
  expect(html).toContain('?query=duane&amp;page=3&amp;pageSize=50');
});

test('renders brand tier values from permissions', async () => {
  const users: AdminUser[] = [
    { id: 'user-1', email: 'duane@example.com', name: 'Duane', isAdmin: false, createdAt: null },
  ];
  const permissions: PermissionRow[] = [
    {
      user_id: 'user-1',
      brand_profile_id: 'brand-1',
      role: 'owner',
      brand_tier: 2,
      brand_name: 'Brand One',
    },
  ];
  const pagination: AdminPagination = {
    page: 1,
    pageSize: 50,
    totalCount: 1,
    totalPages: 1,
    nextPage: null,
    lastPage: 1,
    hasNextPage: false,
    hasPrevPage: false,
  };

  const html = await renderAdminUserList({ users, permissions, pagination, searchQuery: '' });

  expect(html).toContain('Tier 2');
});

test('renders an accessible search label', async () => {
  const users: AdminUser[] = [
    { id: 'user-1', email: 'duane@example.com', name: 'Duane', isAdmin: false, createdAt: null },
  ];
  const pagination: AdminPagination = {
    page: 1,
    pageSize: 50,
    totalCount: 1,
    totalPages: 1,
    nextPage: null,
    lastPage: 1,
    hasNextPage: false,
    hasPrevPage: false,
  };

  const html = await renderAdminUserList({ users, pagination, searchQuery: '' });

  expect(html).toContain('for="admin-user-search"');
});
