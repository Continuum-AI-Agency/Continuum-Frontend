import { afterEach, describe, expect, it } from 'bun:test';
import type { MediaAsset } from '@continuum/contracts';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { FilePreviewStage } from './FilePreviewStage';

afterEach(cleanup);

function fileAsset(fileName: string, mimeType: string): MediaAsset {
  return {
    id: 'asset-1',
    brandId: 'brand-1',
    kind: 'file',
    bucket: 'media-source',
    storagePath: `brand-1/asset-1/${fileName}`,
    fileName,
    mimeType,
    sizeBytes: 2048,
    source: 'upload',
    status: 'ready',
    reviewStatus: 'none',
    tags: [],
    detectedObjects: [],
    hasImageEmbedding: false,
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    preview: { assetVersionId: 'v1', state: 'unsupported', kind: null, signedUrl: null },
  } as MediaAsset;
}

describe('FilePreviewStage', () => {
  it('tells the truth about an Office document: no preview, download only', () => {
    render(
      <FilePreviewStage
        brandId="brand-1"
        asset={fileAsset(
          'deck.pptx',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        )}
      />,
    );
    expect(screen.getByTestId('stage-no-preview').textContent).toBe(
      'No preview — download to open',
    );
    expect(screen.getByTestId('office-icon-presentation')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Download' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Add preview' })).toBeNull();
  });

  it('keeps the companion upload for a project file', () => {
    render(
      <FilePreviewStage
        brandId="brand-1"
        asset={fileAsset('scene.aep', 'application/octet-stream')}
      />,
    );
    expect(screen.queryByTestId('stage-no-preview')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add preview' })).not.toBeNull();
  });

  it('hands a 3D model to its viewer instead of the file card', () => {
    render(<FilePreviewStage brandId="brand-1" asset={fileAsset('chair.glb', 'model/gltf-binary')} />);
    expect(screen.getByTestId('family-viewer-loading')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull();
  });

  it('falls back to the file card when the Backend reads a zip as a plain archive', async () => {
    const realFetch = globalThis.fetch;
    const calls: Array<{ url: string; body: unknown }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body ?? 'null')) });
      return new Response(
        JSON.stringify({
          family: 'none',
          assetId: '00000000-0000-4000-8000-000000000001',
          versionId: '00000000-0000-4000-8000-000000000002',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;
    try {
      const archive = {
        ...fileAsset('notes.zip', 'application/zip'),
        signedUrl: 'https://project.supabase.co/storage/v1/object/sign/media-source/a/notes.zip?token=t',
      };
      render(<FilePreviewStage brandId="brand-1" asset={archive} />);
      await waitFor(() => expect(screen.getByRole('button', { name: 'Download' })).not.toBeNull());
      const viewerCall = calls.find((call) => call.url.endsWith('/api/media/library/viewer'));
      expect(viewerCall?.body).toEqual({ sourceUrl: archive.signedUrl });
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
