import { afterEach, describe, expect, it, mock } from 'bun:test';

import {
  FigmaApiError,
  figmaErrorMessage,
  importFigmaPaste,
  isFigmaClipboard,
  listFigmaFolders,
} from './figma';

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

  it('posts a Figma clipboard to the paste route and reads back one asset per layer', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';
    const html = '<span data-buffer="<!--(figma)ZmlnLWtpd2k=(/figma)-->"></span>';
    let requestedUrl = '';
    let requestedBody = '';
    globalThis.fetch = mock(async (url, init) => {
      requestedUrl = String(url);
      requestedBody = String(init?.body);
      return Response.json({
        assets: [
          {
            assetId: '22222222-2222-4222-8222-222222222222',
            versionId: '33333333-3333-4333-8333-333333333333',
            figmaNodeId: '1:2',
            status: 'created',
          },
        ],
      });
    }) as typeof fetch;

    expect(isFigmaClipboard(html)).toBe(true);
    expect(isFigmaClipboard('<p>plain copy</p>')).toBe(false);
    const assets = await importFigmaPaste(
      '11111111-1111-4111-8111-111111111111',
      html,
      async () => 'jwt',
    );
    expect(requestedUrl).toBe('https://api.example.com/integrations/figma/paste');
    expect(JSON.parse(requestedBody)).toEqual({
      brandId: '11111111-1111-4111-8111-111111111111',
      html,
    });
    expect(assets.map((asset) => asset.figmaNodeId)).toEqual(['1:2']);
    expect(figmaErrorMessage(new FigmaApiError('figma_paste_too_large')).message).toContain(
      'too big',
    );
  });
});
