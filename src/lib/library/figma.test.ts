import { afterEach, describe, expect, it, mock } from 'bun:test';

import { FigmaApiError, figmaErrorMessage, listFigmaFolders } from './figma';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('Figma Library client', () => {
  it('calls the backend directly with a user JWT and canonical query', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';
    let requestedUrl = '';
    let requestedInit: RequestInit | undefined;
    globalThis.fetch = mock(async (url, init) => {
      requestedUrl = String(url);
      requestedInit = init;
      return Response.json({
        folders: [{ id: 'folder-1', name: 'Campaign', parentFolderId: null }],
      });
    }) as typeof fetch;

    const folders = await listFigmaFolders(
      '11111111-1111-4111-8111-111111111111',
      { teamId: 'team 1' },
      async () => 'user-jwt',
    );
    expect(folders).toEqual([{ id: 'folder-1', name: 'Campaign', parentFolderId: null }]);
    expect(requestedUrl).toBe(
      'https://api.example.com/integrations/figma/folders?brandId=11111111-1111-4111-8111-111111111111&teamId=team+1',
    );
    expect((requestedInit?.headers as Record<string, string>).Authorization).toBe(
      'Bearer user-jwt',
    );
  });

  it('keeps what the backend says to fix: the missing fonts, and how long to wait', async () => {
    globalThis.fetch = mock(async () =>
      Response.json(
        { error: 'figma_fonts_missing', missingFonts: ['Avenir 800'] },
        { status: 409 },
      ),
    ) as typeof fetch;
    const refusal = await listFigmaFolders('b', { teamId: 't' }, async () => 'jwt').catch(
      (error: unknown) => error,
    );
    expect(refusal).toBeInstanceOf(FigmaApiError);
    expect(figmaErrorMessage(refusal).message).toContain('Avenir 800');

    const limited = figmaErrorMessage(new FigmaApiError('rate_limited', [], 120));
    expect(limited.message).toContain('Try again in 2 min');
    expect(limited.reconnect).toBe(false);
    expect(figmaErrorMessage(new FigmaApiError('figma_not_connected')).reconnect).toBe(true);
  });
});
