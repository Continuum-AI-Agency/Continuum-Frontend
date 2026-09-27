import { describe, expect, it } from 'bun:test';

import {
  assetShowsCompanionStage,
  formatUsesCompanionPreview,
  officeDocumentType,
} from './previewPlayable';

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

describe('office documents', () => {
  it('never wait on a companion', () => {
    expect(formatUsesCompanionPreview('deck.pptx')).toBe(false);
    expect(
      assetShowsCompanionStage({ fileName: 'old.xls', mimeType: 'application/vnd.ms-excel' }),
    ).toBe(false);
  });

  it('names which kind of document to draw, by extension then MIME', () => {
    expect(officeDocumentType('brief.docx')).toBe('document');
    expect(officeDocumentType('old.doc', 'application/msword')).toBe('document');
    expect(officeDocumentType('budget.xlsx')).toBe('spreadsheet');
    expect(officeDocumentType('Old.XLS')).toBe('spreadsheet');
    expect(officeDocumentType('deck.pptx')).toBe('presentation');
    expect(officeDocumentType('old.ppt')).toBe('presentation');
    expect(officeDocumentType('upload', 'application/vnd.ms-powerpoint')).toBe('presentation');
  });

  it('is null for everything that is not an office file', () => {
    expect(officeDocumentType('deck.pdf', 'application/pdf')).toBeNull();
    expect(officeDocumentType('clip.mkv', 'video/x-matroska')).toBeNull();
    expect(officeDocumentType('scene.aep')).toBeNull();
  });
});

describe('container video', () => {
  it('shows the proxy stage, never the MKV/AVI/WMV original', () => {
    expect(assetShowsCompanionStage({ fileName: 'clip.wmv', mimeType: 'video/x-ms-wmv' })).toBe(
      true,
    );
  });
});
