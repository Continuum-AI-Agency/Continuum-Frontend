import { beforeEach, expect, it, mock } from 'bun:test';

const invoke = mock(async () => ({ data: null, error: null }));
mock.module('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { app_metadata: { is_admin: true } } } }),
      getSession: async () => ({ data: { session: { access_token: 'test-token' } } }),
    },
    functions: { invoke },
  }),
}));

import AdminPage from './page';

beforeEach(() => invoke.mockClear());

it('authenticates the Audit tab without waiting for the unrelated user directory', async () => {
  await AdminPage({ searchParams: Promise.resolve({ tab: 'audit' }) });
  expect(invoke).not.toHaveBeenCalled();
});

it('loads the user directory for the Users tab', async () => {
  await AdminPage({ searchParams: Promise.resolve({ tab: 'users' }) });
  expect(invoke).toHaveBeenCalledTimes(1);
});
