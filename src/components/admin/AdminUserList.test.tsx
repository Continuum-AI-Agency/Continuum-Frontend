import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { AdminPagination, AdminUser, PermissionRow } from '@/components/admin/adminUserTypes';
import { render } from '@/i18n/__tests__/render';

let searchParamsValue = 'query=a&page=1&pageSize=50';
const pushMock = mock((_href: string) => {});
const replaceMock = mock((_href: string, _options?: { scroll?: boolean }) => {});
const refreshMock = mock(() => {});
const routerMock = {
  push: pushMock,
  replace: replaceMock,
  refresh: refreshMock,
};

mock.module('next/navigation', () => ({
  useRouter: () => routerMock,
  useSearchParams: () => new URLSearchParams(searchParamsValue),
}));

const showMock = mock((_message: { title: string; variant?: string }) => {});
mock.module('@/components/ui/ToastProvider', () => ({
  useToast: () => ({ show: showMock }),
}));

type InvokeReply = { data: unknown; error: unknown };
const noReply = async (_name: string, _options?: { body?: unknown }): Promise<InvokeReply> => ({
  data: null,
  error: null,
});
const invokeMock = mock(noReply);
mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    functions: { invoke: invokeMock },
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

describe('AdminUserList support workflow regressions', () => {
  beforeEach(() => {
    searchParamsValue = 'page=1&pageSize=50';
    invokeMock.mockReset();
    invokeMock.mockImplementation(noReply);
    showMock.mockClear();
  });
  afterEach(cleanup);

  it('does not request inactive tab datasets on the Users tab', async () => {
    render(
      <AdminUserList
        users={visibleUsers}
        permissions={[]}
        pagination={pagination}
        searchQuery=""
      />,
    );
    await settleRenderedEffects();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('preserves the selected user when refreshed rows are new objects', async () => {
    const second: AdminUser = {
      ...visibleUsers[0]!,
      id: 'user-2',
      email: 'blair@example.com',
      name: 'Blair Example',
    };
    const rows = [...visibleUsers, second];
    const view = render(
      <AdminUserList users={rows} permissions={[]} pagination={pagination} searchQuery="" />,
    );
    await settleRenderedEffects();
    fireEvent.click(screen.getByText('Blair Example'));
    view.rerender(
      <AdminUserList
        users={rows.map((row) => ({ ...row }))}
        permissions={[]}
        pagination={pagination}
        searchQuery=""
      />,
    );
    await settleRenderedEffects();
    expect(view.container.querySelector('tr[data-state="selected"]')?.textContent).toContain(
      'blair@example.com',
    );
  });

  it('exposes user selection as an explicitly named button', async () => {
    render(
      <AdminUserList
        users={visibleUsers}
        permissions={[]}
        pagination={pagination}
        searchQuery=""
      />,
    );
    await settleRenderedEffects();
    expect(screen.getByRole('button', { name: 'Manage alex@example.com' })).toBeTruthy();
  });

  it('keeps an audit request failure visible with a retry control', async () => {
    searchParamsValue = 'tab=audit';
    invokeMock.mockImplementation(async (name) =>
      name === 'admin-audit-log'
        ? { data: null, error: new Error('Audit service unavailable') }
        : { data: null, error: null },
    );
    render(<AdminUserList users={[]} permissions={[]} pagination={pagination} searchQuery="" />);
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Unable to load audit log'),
    );
    expect(screen.getByRole('button', { name: /refresh/i })).toBeTruthy();
  });

  it('does not claim an email was sent when the report response is incomplete', async () => {
    searchParamsValue = 'tab=reports';
    render(<AdminUserList users={[]} permissions={[]} pagination={pagination} searchQuery="" />);
    await settleRenderedEffects();
    fireEvent.change(screen.getByRole('textbox', { name: 'Brand ID' }), {
      target: { value: '22222222-2222-4222-8222-222222222222' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send smoke/i }));
    await waitFor(() => expect(showMock).toHaveBeenCalled());
    expect(showMock.mock.calls.at(-1)?.[0].variant).toBe('error');
  });

  it('ignores workflows returned for a previously selected brand', async () => {
    searchParamsValue = 'tab=workflows';
    const pending = new Map<string, (reply: InvokeReply) => void>();
    invokeMock.mockImplementation(async (_name, options) => {
      const body = options?.body as { action?: string; brandProfileId?: string };
      if (body.action === 'list_brands')
        return {
          data: {
            brands: ['Alpha', 'Beta'].map((name) => ({
              id: name,
              brand_name: name,
              tier: 1,
              active: true,
              ownerEmail: null,
            })),
          },
          error: null,
        };
      if (body.action === 'list' && body.brandProfileId)
        return new Promise<InvokeReply>((resolve) => pending.set(body.brandProfileId!, resolve));
      return { data: { workflows: [] }, error: null };
    });
    const view = render(
      <AdminUserList users={[]} permissions={[]} pagination={pagination} searchQuery="" />,
    );
    await waitFor(() =>
      expect(
        invokeMock.mock.calls.some(
          ([, options]) => (options?.body as { action?: string })?.action === 'list_brands',
        ),
      ).toBe(true),
    );
    await settleRenderedEffects();
    for (const brand of ['Alpha', 'Beta']) {
      fireEvent.click(view.container.querySelector('#workflow-source-filter')!);
      fireEvent.click(await screen.findByRole('option', { name: new RegExp(brand) }));
      await waitFor(() => expect(pending.has(brand)).toBe(true));
    }
    const reply = (name: string): InvokeReply => ({
      data: {
        workflows: [
          {
            id: name,
            name,
            brand_profile_id: name,
            description: null,
            node_count: 0,
            tags: [],
            visibility: 'brand',
            source_scope: null,
            source_workflow_id: null,
            source_brand_profile_id: null,
            promoted_from_workflow_id: null,
            copied_by: null,
            copied_at: null,
            created_by: null,
            created_at: '2026-11-25',
            updated_at: '2026-11-25',
          },
        ],
      },
      error: null,
    });
    await act(async () => {
      pending.get('Beta')!(reply('Beta workflow'));
    });
    await act(async () => {
      pending.get('Alpha')!(reply('Alpha workflow'));
    });
    expect(screen.getByRole('button', { name: 'Inspect Beta workflow' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Inspect Alpha workflow' })).toBeNull();
  });

  it('loads continuation pages for brand selection and workflow search', async () => {
    searchParamsValue = 'tab=workflows';
    invokeMock.mockImplementation(async (_name, options) => {
      const body = options?.body as { action: string; offset: number };
      const next = body.offset === 0;
      return {
        data: {
          ...(body.action === 'list_brands'
            ? { brands: [] }
            : {
                workflows: next
                  ? []
                  : [{ id: 'last-workflow', name: 'Last workflow', tags: [], node_count: 0 }],
              }),
          pagination: { has_more: next, next_offset: next ? 200 : null },
        },
        error: null,
      };
    });
    render(<AdminUserList users={[]} permissions={[]} pagination={pagination} searchQuery="" />);
    expect(await screen.findByRole('button', { name: 'Inspect Last workflow' })).toBeTruthy();
    for (const action of ['list_brands', 'list']) {
      expect(
        invokeMock.mock.calls.some(([, options]) => {
          const body = options?.body as { action: string; offset: number };
          return body.action === action && body.offset === 200;
        }),
      ).toBe(true);
    }
  });
});

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
        brand_access: null,
      },
      {
        user_id: 'user-1',
        brand_profile_id: 'brand-2',
        brand_name: 'Knowledge Navigator 2.0',
        role: 'owner',
        brand_tier: 3,
        brand_access: null,
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

describe('AdminUserList brand access', () => {
  const BRAND = '6f9619ff-8b86-4011-b42d-00c04fc964ff';
  const stripeAccess = {
    billingModel: 'stripe' as const,
    planCode: 'paid_media',
    plans: ['paid_media' as const],
    status: 'active' as const,
    products: [{ product: 'paid_media' as const, source: 'stripe' as const }],
  };
  const membership = (overrides: Partial<PermissionRow>): PermissionRow[] => [
    {
      user_id: 'user-1',
      brand_profile_id: BRAND,
      brand_name: 'Easy Fit',
      role: 'owner',
      brand_tier: null,
      brand_access: null,
      ...overrides,
    },
  ];
  const renderList = (permissions: PermissionRow[], billingLive: boolean) =>
    render(
      <AdminUserList
        users={visibleUsers}
        permissions={permissions}
        pagination={{ ...pagination, totalCount: 1, totalPages: 1, lastPage: 1 }}
        searchQuery=""
        billingLive={billingLive}
      />,
    );

  beforeEach(() => {
    searchParamsValue = 'page=1&pageSize=50';
    invokeMock.mockClear();
    invokeMock.mockImplementation(noReply);
    refreshMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('billing-cutover: keeps the Tier control and disables the grid until billing is live', async () => {
    renderList(membership({ brand_tier: 3 }), false);
    await settleRenderedEffects();

    expect(screen.getAllByText('Tier 3').length).toBeGreaterThan(0);
    expect(screen.getByText('Product access activates at billing go-live.')).toBeDefined();
    for (const name of ['Canvas', 'Organic', 'Performance', 'Trends', 'MCP']) {
      expect(screen.getByRole('checkbox', { name }).getAttribute('aria-disabled')).toBe('true');
    }
    expect(screen.getByRole('switch').getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('button', { name: 'Full access' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Add credits' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('textbox', { name: 'Reason for the credits' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByRole('button', { name: 'Full access for all brands' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('replaces the Tier control with the product grid once billing is live', async () => {
    renderList(membership({ brand_access: stripeAccess }), true);
    await settleRenderedEffects();

    expect(screen.queryByText(/^Tier \d$/)).toBeNull();
    expect(screen.queryByText('Product access activates at billing go-live.')).toBeNull();
    expect(screen.getByTestId('brand-billing-plan').textContent).toBe('Performance Plus · Active');
    const performance = screen.getByRole('checkbox', { name: 'Performance' });
    expect(performance.getAttribute('aria-checked')).toBe('true');
    expect(performance.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('Stripe')).toBeDefined();
    const canvas = screen.getByRole('checkbox', { name: 'Canvas' });
    expect(canvas.getAttribute('aria-checked')).toBe('false');
    expect(canvas.getAttribute('aria-disabled')).toBeNull();
  });

  it('sends a product toggle to admin-update-access and shows the saved access', async () => {
    const saved = {
      ...stripeAccess,
      products: [
        { product: 'paid_media' as const, source: 'stripe' as const },
        { product: 'studio' as const, source: 'admin' as const },
      ],
    };
    invokeMock.mockImplementation(async (name) => {
      if (name !== 'admin-update-access') return { data: null, error: null };
      return {
        data: {
          ok: true,
          brandId: BRAND,
          changes: [
            {
              kind: 'product',
              product: 'studio',
              before: null,
              after: { active: true, source: 'admin' },
            },
          ],
          access: saved,
          entitlements: {
            brandId: BRAND,
            planCode: 'paid_media',
            status: 'active',
            billingModel: 'stripe',
            plans: ['paid_media'],
            products: ['paid_media', 'studio'],
            addons: [],
            trendsTier: null,
            buckets: [],
            creditBalance: { totalCredits: 0, purchasedCredits: 0, rolloverCredits: 0 },
          },
        },
        error: null,
      };
    });
    renderList(membership({ brand_access: stripeAccess }), true);
    await settleRenderedEffects();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Canvas' }));

    const accessCalls = () =>
      invokeMock.mock.calls.filter(([name]) => name === 'admin-update-access');
    await waitFor(() => expect(accessCalls()).toHaveLength(1));
    expect(accessCalls()[0]?.[1]?.body).toEqual({ brandId: BRAND, products: { studio: true } });
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Canvas' }).getAttribute('aria-checked')).toBe(
        'true',
      ),
    );
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('asks for confirmation before setting Contract, then sends contract=true', async () => {
    renderList(membership({ brand_access: stripeAccess }), true);
    await settleRenderedEffects();

    fireEvent.click(screen.getByRole('switch', { name: 'Contract' }));
    const confirm = await screen.findByRole('button', { name: 'Set Contract' });
    expect(invokeMock.mock.calls.some(([name]) => name === 'admin-update-access')).toBe(false);

    fireEvent.click(confirm);

    await waitFor(() =>
      expect(
        invokeMock.mock.calls.find(([name]) => name === 'admin-update-access')?.[1]?.body,
      ).toEqual({ brandId: BRAND, contract: true }),
    );
  });

  const accessCalls = () =>
    invokeMock.mock.calls.filter(([name]) => name === 'admin-update-access');
  const savedReply = (brandId: string, access: Record<string, unknown>) => ({
    data: {
      ok: true,
      brandId,
      changes: [],
      access,
      entitlements: {
        brandId,
        planCode: 'free',
        status: 'inactive',
        billingModel: 'none',
        plans: [],
        products: [],
        addons: [],
        trendsTier: null,
        buckets: [],
        creditBalance: { totalCredits: 0, purchasedCredits: 0, rolloverCredits: 0 },
      },
    },
    error: null,
  });
  const noPlan = {
    billingModel: 'none' as const,
    planCode: 'free',
    plans: [],
    status: 'inactive' as const,
    products: [],
    internalAuthored: false,
    internal: false,
    canvasCredits: 2000,
  };

  it('gives one brand full access after confirming', async () => {
    invokeMock.mockImplementation(async (_name, options) =>
      savedReply(BRAND, noPlan as unknown as Record<string, unknown>),
    );
    renderList(membership({ brand_access: noPlan }), true);
    await settleRenderedEffects();

    fireEvent.click(screen.getByRole('button', { name: 'Full access' }));
    const confirm = await screen.findByRole('button', { name: 'Give full access' });
    expect(accessCalls()).toHaveLength(0);
    fireEvent.click(confirm);

    await waitFor(() => expect(accessCalls()).toHaveLength(1));
    expect(accessCalls()[0]?.[1]?.body).toEqual({ brandId: BRAND, fullAccess: true });
  });

  it('adds credits once with the reason, even on a double click, then clears the form', async () => {
    let release: () => void = () => {};
    invokeMock.mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return savedReply(BRAND, { ...noPlan, canvasCredits: 4500 });
    });
    renderList(membership({ brand_access: noPlan }), true);
    await settleRenderedEffects();

    expect(screen.getByTestId('brand-canvas-credits').textContent).toBe('2,000 credits');
    const amount = screen.getByRole('textbox', { name: 'Credits to add (USD)' });
    const reason = screen.getByRole('textbox', { name: 'Reason for the credits' });
    const add = screen.getByRole('button', { name: 'Add credits' });
    fireEvent.change(amount, { target: { value: '25' } });
    expect(add).toHaveProperty('disabled', true);
    fireEvent.change(reason, { target: { value: 'launch promo' } });
    expect(add).toHaveProperty('disabled', false);

    fireEvent.click(add);
    fireEvent.click(add);
    await waitFor(() => expect(accessCalls()).toHaveLength(1));
    expect(add).toHaveProperty('disabled', true);
    await act(async () => release());

    await waitFor(() =>
      expect(screen.getByTestId('brand-canvas-credits').textContent).toBe('4,500 credits'),
    );
    expect(accessCalls()).toHaveLength(1);
    expect(accessCalls()[0]?.[1]?.body).toEqual({
      brandId: BRAND,
      addCreditsUsd: 25,
      reason: 'launch promo',
    });
    expect((amount as HTMLInputElement).value).toBe('');
    expect((reason as HTMLInputElement).value).toBe('');
  });

  it('refuses an amount over the 1000 USD cap in the form', async () => {
    renderList(membership({ brand_access: noPlan }), true);
    await settleRenderedEffects();

    fireEvent.change(screen.getByRole('textbox', { name: 'Credits to add (USD)' }), {
      target: { value: '1000.01' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason for the credits' }), {
      target: { value: 'x' },
    });
    expect(screen.getByRole('button', { name: 'Add credits' })).toHaveProperty('disabled', true);
  });

  it('shows the Client switch and Internal badge only for a staff-created brand', async () => {
    const internalAccess = { ...noPlan, internalAuthored: true, internal: true };
    renderList(membership({ brand_access: internalAccess }), true);
    await settleRenderedEffects();

    expect(screen.getByTestId('brand-internal-badge').textContent).toBe('Internal · unmetered');
    const client = screen.getByRole('switch', { name: 'Client (metered)' });
    expect(client.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(client);
    await waitFor(() => expect(accessCalls()).toHaveLength(1));
    expect(accessCalls()[0]?.[1]?.body).toEqual({ brandId: BRAND, client: true });
    cleanup();

    renderList(membership({ brand_access: noPlan }), true);
    await settleRenderedEffects();
    expect(screen.queryByRole('switch', { name: 'Client (metered)' })).toBeNull();
    expect(screen.queryByTestId('brand-internal-badge')).toBeNull();
  });

  it('gives every brand of the user full access one by one and lists each result', async () => {
    const OTHER = '7f9619ff-8b86-4011-b42d-00c04fc964ff';
    invokeMock.mockImplementation(async (name, options) => {
      if (name !== 'admin-update-access') return { data: null, error: null };
      const brandId = (options?.body as { brandId: string }).brandId;
      if (brandId === OTHER) {
        return {
          data: null,
          error: new FunctionsHttpError(
            new Response(JSON.stringify({ error: 'billing_not_live' }), { status: 409 }),
          ),
        };
      }
      return savedReply(brandId, noPlan as unknown as Record<string, unknown>);
    });
    renderList(
      [
        ...membership({ brand_access: noPlan }),
        {
          user_id: 'user-1',
          brand_profile_id: OTHER,
          brand_name: 'Home | Vivo47',
          role: 'admin',
          brand_tier: null,
          brand_access: noPlan,
        },
      ],
      true,
    );
    await settleRenderedEffects();

    fireEvent.click(screen.getByRole('button', { name: 'Full access for all brands' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Give full access' }));

    await waitFor(() => expect(screen.getByTestId('full-access-results').children).toHaveLength(2));
    expect(accessCalls().map(([, options]) => options?.body)).toEqual([
      { brandId: BRAND, fullAccess: true },
      { brandId: OTHER, fullAccess: true },
    ]);
    const results = screen.getByTestId('full-access-results');
    expect(results.querySelector(`[data-brand-id="${BRAND}"]`)?.textContent).toBe('Easy Fit ok');
    expect(results.querySelector(`[data-brand-id="${OTHER}"]`)?.textContent).toBe(
      'Home | Vivo47 failed — Product access activates at billing go-live.',
    );
  });
});
