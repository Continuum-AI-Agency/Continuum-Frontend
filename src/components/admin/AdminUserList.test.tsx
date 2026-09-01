import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { AdminPagination, AdminUser, PermissionRow } from '@/components/admin/adminUserTypes';

let searchParamsValue = 'query=a&page=1&pageSize=50';
const pushMock = mock((_href: string) => {});
const replaceMock = mock((_href: string, _options?: { scroll?: boolean }) => {});
const routerMock = {
  push: pushMock,
  replace: replaceMock,
};

mock.module('next/navigation', () => ({
  useRouter: () => routerMock,
  useSearchParams: () => new URLSearchParams(searchParamsValue),
}));

mock.module('@/components/ui/ToastProvider', () => ({
  useToast: () => ({ show: () => {} }),
}));

mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    functions: {
      invoke: async () => ({ data: null, error: null }),
    },
  }),
}));

import { AdminUserList } from '@/components/admin/AdminUserList';

const pagination: AdminPagination = {
  page: 1,
  pageSize: 50,
  totalCount: 0,
  totalPages: 0,
  nextPage: null,
  lastPage: 0,
  hasNextPage: false,
  hasPrevPage: false,
};
const users: AdminUser[] = [];
const permissions: PermissionRow[] = [];
const visibleUsers: AdminUser[] = [
  {
    id: 'user-1',
    email: 'alex@example.com',
    name: 'Alex Example',
    isAdmin: false,
    createdAt: '2026-07-01T00:00:00.000Z',
  },
];

async function settleRenderedEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('AdminUserList search', () => {
  beforeEach(() => {
    searchParamsValue = 'query=a&page=1&pageSize=50';
    pushMock.mockReset();
    replaceMock.mockReset();
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    cleanup();
  });

  it('preserves newer typing when an older search result snapshot settles', async () => {
    const view = render(
      <AdminUserList
        users={users}
        permissions={permissions}
        pagination={pagination}
        searchQuery="a"
      />,
    );
    await settleRenderedEffects();
    const input = screen.getByRole('textbox', { name: 'Search users' }) as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'alex' } });
    expect(input.value).toBe('alex');

    searchParamsValue = 'query=al&page=1&pageSize=50';
    view.rerender(
      <AdminUserList
        users={users}
        permissions={permissions}
        pagination={pagination}
        searchQuery="al"
      />,
    );
    await settleRenderedEffects();

    expect(input.value).toBe('alex');
  });

  it('coalesces rapid typing into one replace navigation for the newest query', async () => {
    searchParamsValue = 'section=users&page=3&pageSize=50';
    render(
      <AdminUserList
        users={users}
        permissions={permissions}
        pagination={pagination}
        searchQuery=""
      />,
    );
    await settleRenderedEffects();
    const input = screen.getByRole('textbox', { name: 'Search users' });

    fireEvent.change(input, { target: { value: 'a' } });
    await new Promise((resolve) => setTimeout(resolve, 100));
    fireEvent.change(input, { target: { value: 'alex' } });

    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1), { timeout: 700 });

    const [href, options] = replaceMock.mock.calls[0] ?? [];
    const params = new URLSearchParams(href?.replace(/^\?/, ''));
    expect(params.get('query')).toBe('alex');
    expect(params.get('page')).toBe('1');
    expect(params.get('pageSize')).toBe('50');
    expect(params.get('section')).toBe('users');
    expect(options).toEqual({ scroll: false });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('keeps settled rows visible and marks them busy while a newer query is pending', async () => {
    searchParamsValue = 'page=1&pageSize=50';
    render(
      <AdminUserList
        users={visibleUsers}
        permissions={permissions}
        pagination={{ ...pagination, totalCount: 1, totalPages: 1, lastPage: 1 }}
        searchQuery=""
      />,
    );
    await settleRenderedEffects();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search users' }), {
      target: { value: 'alex' },
    });

    expect(screen.getAllByText('alex@example.com').length).toBeGreaterThan(0);
    expect(screen.getByTestId('admin-user-directory-results').getAttribute('aria-busy')).toBe(
      'true',
    );
    expect(screen.getByRole('status').textContent).toContain('Updating');
  });

  it('clears an active search immediately', async () => {
    searchParamsValue = 'section=users&query=alex&page=3&pageSize=50';
    render(
      <AdminUserList
        users={visibleUsers}
        permissions={permissions}
        pagination={pagination}
        searchQuery="alex"
      />,
    );
    await settleRenderedEffects();

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));

    expect((screen.getByRole('textbox', { name: 'Search users' }) as HTMLInputElement).value).toBe(
      '',
    );
    expect(replaceMock).toHaveBeenCalledTimes(1);
    const [href] = replaceMock.mock.calls[0] ?? [];
    const params = new URLSearchParams(href?.replace(/^\?/, ''));
    expect(params.has('query')).toBe(false);
    expect(params.get('page')).toBe('1');
    expect(params.get('section')).toBe('users');
  });

  it('submits the live draft immediately when Enter is pressed', async () => {
    searchParamsValue = 'page=1&pageSize=50';
    render(
      <AdminUserList
        users={users}
        permissions={permissions}
        pagination={pagination}
        searchQuery=""
      />,
    );
    await settleRenderedEffects();
    const input = screen.getByRole('textbox', { name: 'Search users' });

    fireEvent.change(input, { target: { value: 'alex' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(replaceMock).toHaveBeenCalledTimes(1);
    const [href] = replaceMock.mock.calls[0] ?? [];
    expect(new URLSearchParams(href?.replace(/^\?/, '')).get('query')).toBe('alex');
  });

  it('adopts the URL query when browser history navigation occurs', async () => {
    window.history.replaceState(null, '', '/admin?query=alex&page=1&pageSize=50');
    render(
      <AdminUserList
        users={users}
        permissions={permissions}
        pagination={pagination}
        searchQuery="alex"
      />,
    );
    await settleRenderedEffects();
    const input = screen.getByRole('textbox', { name: 'Search users' }) as HTMLInputElement;

    window.history.replaceState(null, '', '/admin?query=back&page=2&pageSize=50');
    fireEvent(window, new Event('popstate'));

    expect(input.value).toBe('back');
  });

  // Airtable #263 — the Brands column truncates at 360px, and the screenshots showed
  // "No brand m…" with no way to read the rest. Truncation is fine; unreadable is not.
  it('keeps a truncated Brands summary readable through its title attribute', async () => {
    searchParamsValue = 'page=1&pageSize=50';
    const memberships: PermissionRow[] = [
      {
        user_id: 'user-1',
        brand_profile_id: 'brand-1',
        brand_name: 'Starbucks Coffee Company',
        role: 'operator',
        brand_tier: 3,
      },
      {
        user_id: 'user-1',
        brand_profile_id: 'brand-2',
        brand_name: 'Knowledge Navigator 2.0',
        role: 'owner',
        brand_tier: 3,
      },
    ];
    render(
      <AdminUserList
        users={visibleUsers}
        permissions={memberships}
        pagination={{ ...pagination, totalCount: 1, totalPages: 1, lastPage: 1 }}
        searchQuery=""
      />,
    );
    await settleRenderedEffects();

    const summary = screen.getAllByTitle(/Starbucks Coffee Company/)[0];
    expect(summary).toBeDefined();
    expect(summary?.getAttribute('title')).toContain('Knowledge Navigator 2.0');
    expect(summary?.textContent).toBe(summary?.getAttribute('title'));
  });
});
