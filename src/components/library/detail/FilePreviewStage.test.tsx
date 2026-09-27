import { afterEach, describe, expect, it } from 'bun:test';
import type { MediaAsset } from '@continuum/contracts';
import { cleanup, render, screen } from '@testing-library/react';
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
});
