import { afterEach, expect, mock, test } from 'bun:test';
import type { TemplateOperationInput } from '@continuum/contracts';

const userId = '10000000-0000-4000-8000-000000000001';
let session = { access_token: 'test-only-token', user: { id: userId } };
mock.module('@/lib/supabase/client', () => ({ createSupabaseBrowserClient: () => ({ auth: { getSession: async () => ({ data: { session } }) } }) }));
const { appendTemplateAuthoringHistory } = await import('./templateSources');
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; session = { access_token: 'test-only-token', user: { id: userId } }; });
const operation: TemplateOperationInput = {
  id: '20000000-0000-4000-8000-000000000001', workingCopyId: '20000000-0000-4000-8000-000000000002', sequence: 1,
  command: 'forge_authoring_command', baseRevisionId: null, channel: 'forge', outcome: 'succeeded',
  affectedObjects: [], changes: { command: { type: 'layer.delete', nodeId: 'aep:1:2' } }, evidence: 'recorded', causedBy: [],
};
const brandId = '30000000-0000-4000-8000-000000000001';
const assetId = '30000000-0000-4000-8000-000000000002';
function acknowledged(value = operation) {
  return { ...value, principalId: userId, revisionId: null, revisionIds: [], receivedAt: new Date().toISOString() };
}

test('history uses the shared authenticated service and checks exact acknowledged event intent', async () => {
  let received: unknown;
  globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
    expect(String(url)).toContain(`/api/ai-studio/templates/${assetId}/history`);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer test-only-token' });
    received = JSON.parse(String(init?.body));
    return Response.json({ items: [acknowledged()] });
  }) as typeof fetch;
  await appendTemplateAuthoringHistory(userId, assetId, brandId, [operation]);
  expect(received).toEqual({ brandId, operations: [operation] });
});

test('account changes, partial acknowledgement and changed intent fail without accepting a false acknowledgement', async () => {
  const request = mock(async () => Response.json({ items: [] }));
  globalThis.fetch = request as typeof fetch;
  session = { access_token: 'other-account-token', user: { id: '40000000-0000-4000-8000-000000000001' } };
  await expect(appendTemplateAuthoringHistory(userId, assetId, brandId, [operation])).rejects.toThrow('another signed-in account');
  expect(request).not.toHaveBeenCalled();
  session = { access_token: 'test-only-token', user: { id: userId } };
  await expect(appendTemplateAuthoringHistory(userId, assetId, brandId, [operation])).rejects.toThrow('did not acknowledge every operation');
  globalThis.fetch = mock(async () => Response.json({ items: [acknowledged({ ...operation, changes: { command: 'different' } })] })) as typeof fetch;
  await expect(appendTemplateAuthoringHistory(userId, assetId, brandId, [operation])).rejects.toThrow('did not acknowledge every operation');
});
