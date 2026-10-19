import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { RequestOptions } from './http.types';

const request = mock(async (_options: RequestOptions<unknown>) => ({}));
mock.module('./http', () => ({ http: { request } }));

import { presentationsApi } from './presentations.client';

const scope = {
  brandId: '11111111-1111-4111-8111-111111111111',
  assetId: 'asset with/slash',
  baseVersionId: '22222222-2222-4222-8222-222222222222',
};
const retryId = '33333333-3333-4333-8333-333333333333';
beforeEach(() => request.mockClear());

describe('presentationsApi', () => {
  test('pins reads to the source version and encodes the asset target', async () => {
    await presentationsApi.load(scope);
    expect(request.mock.calls[0][0]).toMatchObject({
      path: '/api/ai-studio/templates/asset%20with%2Fslash/presentation?brandId=11111111-1111-4111-8111-111111111111&baseVersionId=22222222-2222-4222-8222-222222222222',
      cache: 'no-store',
    });
  });
  test('writes the server draft revision and stable retry identifier', async () => {
    await presentationsApi.apply(
      scope,
      8,
      [{ type: 'object.text', slideId: 'slide-a', objectId: 'text-a', text: 'Hello' }],
      retryId,
    );
    expect(request.mock.calls[0][0]).toMatchObject({
      method: 'PUT',
      body: {
        brandId: scope.brandId,
        baseVersionId: scope.baseVersionId,
        expectedRevision: 8,
        retryId,
        commands: [{ type: 'object.text', slideId: 'slide-a', objectId: 'text-a', text: 'Hello' }],
      },
    });
  });
  test('refuses empty mutation batches before making a request', async () => {
    expect(() => presentationsApi.apply(scope, 2, [], retryId)).toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  test('selected slide proposals remain scoped and separate from writes', async () => {
    await presentationsApi.propose(scope, 4, 'Adapt for investors', ['slide-b']);
    expect(request.mock.calls[0][0]).toMatchObject({
      path: '/api/ai-studio/templates/asset%20with%2Fslash/presentation/proposals',
      method: 'POST',
      body: { expectedRevision: 4, prompt: 'Adapt for investors', slideIds: ['slide-b'], count: 3 },
    });
  });
  test('export preview is revision bound and confirmation carries only its token', async () => {
    await presentationsApi.previewExport(scope, 4, ['pptx', 'pdf']);
    await presentationsApi.confirmExport(scope, retryId);
    expect(request.mock.calls[0][0]).toMatchObject({
      body: { expectedRevision: 4, formats: ['pptx', 'pdf'] },
    });
    expect(request.mock.calls[1][0]).toMatchObject({
      body: {
        brandId: scope.brandId,
        baseVersionId: scope.baseVersionId,
        confirmationToken: retryId,
      },
    });
  });
});
