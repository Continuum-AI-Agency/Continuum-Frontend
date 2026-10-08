import { afterEach, describe, expect, mock, test } from 'bun:test';

// The brand owner is the one person the "Only members" switch was always enabled for, so
// the dialog is rendered as the owner: if the switch can appear for anyone, it appears here.
mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    schema: () => ({ rpc: async () => ({ data: 'owner', error: null }) }),
  }),
}));
mock.module('@/lib/supabase/realtime', () => ({ subscribeToPostgresChanges: () => () => {} }));

const { cleanup, render, screen } = await import('@testing-library/react');
const { CollectionMembersDialog } = await import('./CollectionMembersDialog');

const realFetch = globalThis.fetch;
const memberId = '33333333-3333-4333-8333-333333333333';

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

describe('CollectionMembersDialog', () => {
  test('offers no "Only members" control: restricting a collection is withheld', async () => {
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      const path = String(url);
      const body = path.startsWith('/api/library/collections/members')
        ? {
            access: 'brand',
            myRole: null,
            members: [{ userId: memberId, role: 'editor', addedBy: null, createdAt: '' }],
          }
        : { members: [{ id: memberId, email: 'ada@example.test' }] };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <CollectionMembersDialog
        brandId="22222222-2222-4222-8222-222222222222"
        collectionId="11111111-1111-4111-8111-111111111111"
        collectionName="Launch"
        open
        onOpenChange={() => undefined}
      />,
    );

    expect(await screen.findByTestId('collection-members-list')).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByText('Only members')).toBeNull();
    // Members and roles stay manageable.
    expect(await screen.findByRole('combobox', { name: 'Add member' })).toBeTruthy();
  });
});
