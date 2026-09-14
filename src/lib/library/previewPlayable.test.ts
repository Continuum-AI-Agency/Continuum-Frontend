import { describe, expect, it } from 'bun:test';

import { assetShowsCompanionStage } from './previewPlayable';

describe('assetShowsCompanionStage', () => {
  it('does not try to play an MXF original', () => {
    expect(
      assetShowsCompanionStage({
        fileName: 'camera.mxf',
        mimeType: 'application/mxf',
        preview: { assetVersionId: 'v1', state: 'awaiting_companion', kind: null, signedUrl: null },
      }),
    ).toBe(true);
  });

  it('plays the sidecar once it is ready', () => {
    expect(
      assetShowsCompanionStage({
        fileName: 'scene.aep',
        mimeType: 'application/octet-stream',
        preview: {
          assetVersionId: 'v1',
          state: 'ready',
          kind: 'video',
          signedUrl: 'https://cdn.example.com/preview.mp4',
        },
      }),
    ).toBe(false);
  });
});
