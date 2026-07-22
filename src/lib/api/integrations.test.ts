import { beforeEach, describe, expect, it, mock } from 'bun:test';

type MaybeSingleResult = { data: { id: string } | null; error: null };
type SingleResult = { data: { id: string }; error: null };
type DeleteResult = { error: null };

const lookupMaybeSingle = mock<() => Promise<MaybeSingleResult>>(() =>
  Promise.resolve({ data: null, error: null }),
);
const insertSelectSingle = mock<() => Promise<SingleResult>>(() =>
  Promise.resolve({ data: { id: 'bpia-1' }, error: null }),
);
const deleteResolved = mock<() => Promise<DeleteResult>>(() => Promise.resolve({ error: null }));

const insertChain = {
  select: () => ({ single: insertSelectSingle }),
};
const lookupChain = {
  select: () => ({
    eq: () => ({
      eq: () => ({ maybeSingle: lookupMaybeSingle }),
    }),
  }),
  insert: () => insertChain,
  delete: () => ({
    eq: () => ({ eq: deleteResolved }),
  }),
};

const fromMock = mock(() => lookupChain);
const schemaMock = mock(() => ({ from: fromMock }));
const supabaseStub = { schema: schemaMock };

mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => supabaseStub,
}));

type HttpRequestArgs = { path: string };
const httpRequestMock = mock<(args: HttpRequestArgs) => Promise<{ url: string; state: string }>>(
  () => Promise.resolve({ url: 'https://accounts.google.com/o/oauth2/auth', state: 'state-1' }),
);

mock.module('@/lib/api/http', () => ({
  http: { request: httpRequestMock },
}));

import {
  assignBrandIntegrationAccount,
  startGoogleSync,
  startLinkedInSync,
  unassignBrandIntegrationAccount,
} from '@/lib/api/integrations';

describe('brand integration assignment helpers', () => {
  beforeEach(() => {
    lookupMaybeSingle.mockReset();
    insertSelectSingle.mockReset();
    deleteResolved.mockReset();
    fromMock.mockClear();
    schemaMock.mockClear();
  });

  it('inserts a BPIA row when no existing assignment', async () => {
    lookupMaybeSingle.mockResolvedValue({ data: null, error: null });
    insertSelectSingle.mockResolvedValue({ data: { id: 'bpia-new' }, error: null });

    const id = await assignBrandIntegrationAccount('brand-1', 'asset-1');

    expect(id).toBe('bpia-new');
    expect(schemaMock).toHaveBeenCalledWith('brand_profiles');
    expect(fromMock).toHaveBeenCalledWith('brand_profile_integration_accounts');
    expect(insertSelectSingle).toHaveBeenCalledTimes(1);
  });

  it('returns existing assignment id without inserting (idempotent)', async () => {
    lookupMaybeSingle.mockResolvedValue({ data: { id: 'bpia-existing' }, error: null });

    const id = await assignBrandIntegrationAccount('brand-1', 'asset-1');

    expect(id).toBe('bpia-existing');
    expect(insertSelectSingle).not.toHaveBeenCalled();
  });

  it('deletes a BPIA row by composite key', async () => {
    deleteResolved.mockResolvedValue({ error: null });

    await unassignBrandIntegrationAccount('brand-1', 'asset-1');

    expect(deleteResolved).toHaveBeenCalledTimes(1);
    expect(schemaMock).toHaveBeenCalledWith('brand_profiles');
    expect(fromMock).toHaveBeenCalledWith('brand_profile_integration_accounts');
  });
});

describe('startGoogleSync', () => {
  beforeEach(() => {
    httpRequestMock.mockClear();
  });

  it('does not include force_account_chooser by default', async () => {
    await startGoogleSync('https://app.test/integrations/callback');

    const [{ path }] = httpRequestMock.mock.calls[0] as [HttpRequestArgs];
    expect(path).toContain('callback_url=');
    expect(path).not.toContain('force_account_chooser');
  });

  it('threads force_account_chooser=true through to the sync request (#151)', async () => {
    await startGoogleSync('https://app.test/integrations/callback', { forceAccountChooser: true });

    const [{ path }] = httpRequestMock.mock.calls[0] as [HttpRequestArgs];
    expect(path).toContain('force_account_chooser=true');
  });
});

describe('startLinkedInSync', () => {
  beforeEach(() => {
    httpRequestMock.mockClear();
  });

  it('starts the LinkedIn OAuth flow with callback_url', async () => {
    await startLinkedInSync('https://app.test/integrations/callback?provider=linkedin');

    const [{ path }] = httpRequestMock.mock.calls[0] as [HttpRequestArgs];
    expect(path).toContain('/integrations/linkedin/sync?');
    expect(path).toContain('callback_url=');
    expect(path).not.toContain('mode=');
  });

  it('threads LinkedIn organic mode through to the sync request', async () => {
    await startLinkedInSync('https://app.test/integrations/callback?provider=linkedin', {
      mode: 'organic',
    });

    const [{ path }] = httpRequestMock.mock.calls[0] as [HttpRequestArgs];
    expect(path).toContain('/integrations/linkedin/sync?');
    expect(path).toContain('mode=organic');
  });
});
