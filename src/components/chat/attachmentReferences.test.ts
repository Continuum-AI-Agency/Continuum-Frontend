import { describe, expect, it } from 'bun:test';
import type { Attachment } from './attachments';
import {
  buildAgentAttachmentContext,
  mergeAttachmentReferences,
} from './attachmentReferences';

const readyAttachment = (overrides: Partial<Attachment> = {}): Attachment => ({
  id: 'local-1',
  assetId: 'asset-1',
  name: 'reference.png',
  type: 'image/png',
  size: '2.0 KB',
  status: 'ready',
  storagePath: 'brand-1/assets/asset-1/reference.png',
  url: 'https://signed.example/reference.png',
  ...overrides,
});

describe('buildAgentAttachmentContext', () => {
  it('turns ready Library images into persisted attachments and media references', () => {
    const context = buildAgentAttachmentContext([readyAttachment()], 'organic');

    expect(context.attachments).toEqual([
      {
        assetId: 'asset-1',
        url: 'https://signed.example/reference.png',
        name: 'reference.png',
        mediaType: 'image/png',
        storagePath: 'brand-1/assets/asset-1/reference.png',
      },
    ]);
    expect(context.references).toEqual([
      {
        id: 'asset-1',
        type: 'media_asset',
        label: 'reference.png',
        source: 'organic',
        metadata: {
          mediaType: 'image/png',
          mimeType: 'image/png',
          previewUrl: 'https://signed.example/reference.png',
          storagePath: 'brand-1/assets/asset-1/reference.png',
        },
      },
    ]);
  });

  it('excludes unfinished uploads while preserving ready non-image Library context', () => {
    const context = buildAgentAttachmentContext(
      [
        readyAttachment({ id: 'uploading', status: 'uploading' }),
        readyAttachment({ id: 'failed', status: 'error' }),
        readyAttachment({ id: 'pdf', type: 'application/pdf' }),
      ],
      'jaina',
    );

    expect(context.attachments).toEqual([
      {
        assetId: 'asset-1',
        url: 'https://signed.example/reference.png',
        name: 'reference.png',
        mediaType: 'application/pdf',
        storagePath: 'brand-1/assets/asset-1/reference.png',
      },
    ]);
    expect(context.references).toHaveLength(1);
    expect(context.references[0]).toMatchObject({
      id: 'asset-1',
      type: 'media_asset',
      metadata: { mediaType: 'application/pdf' },
    });
  });
});

describe('mergeAttachmentReferences', () => {
  it('deduplicates an attachment against an explicitly selected Library reference', () => {
    const existing = {
      id: 'asset-1',
      type: 'media_asset' as const,
      label: 'Existing label',
      source: 'canvas' as const,
    };

    expect(mergeAttachmentReferences([existing], [readyAttachment()], 'canvas')).toEqual([
      existing,
    ]);
  });
});
