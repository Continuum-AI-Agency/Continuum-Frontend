import { describe, expect, it } from 'bun:test';
import { buildAgentAttachmentContext, mergeAttachmentReferences } from './attachmentReferences';
import type { Attachment } from './attachments';

const readyAttachment = (overrides: Partial<Attachment> = {}): Attachment => ({
  id: 'local-1',
  kind: 'media',
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

const readyDocument = (overrides: Partial<Attachment> = {}): Attachment => ({
  id: 'local-doc-1',
  kind: 'document',
  documentId: 'doc-1',
  name: 'Q3 brief.pdf',
  type: 'application/pdf',
  size: '1.2 MB',
  status: 'ready',
  storagePath: 'brand-1/doc-1/v1/q3-brief.pdf',
  retention: 'ephemeral',
  expiresAt: '2026-08-20T10:00:00.000Z',
  ...overrides,
});

describe('buildAgentAttachmentContext with documents', () => {
  it('emits a document entry and a document reference, never an image attachment', () => {
    const context = buildAgentAttachmentContext([readyDocument()], 'organic');

    // The load-bearing assertion: a document must NOT reach `attachments`, which is the
    // pixels path where non-image parts are silently dropped by the Organic media
    // resolver and warned away by Jaina's.
    expect(context.attachments).toEqual([]);
    expect(context.documents).toEqual([
      {
        documentId: 'doc-1',
        name: 'Q3 brief.pdf',
        mediaType: 'application/pdf',
        storagePath: 'brand-1/doc-1/v1/q3-brief.pdf',
        retention: 'ephemeral',
        expiresAt: '2026-08-20T10:00:00.000Z',
      },
    ]);
    expect(context.references).toEqual([
      {
        id: 'doc-1',
        type: 'document',
        label: 'Q3 brief.pdf',
        source: 'organic',
        metadata: {
          mimeType: 'application/pdf',
          retention: 'ephemeral',
          expiresAt: '2026-08-20T10:00:00.000Z',
        },
      },
    ]);
  });

  it('keeps media and documents on separate tracks in a mixed batch', () => {
    const context = buildAgentAttachmentContext([readyAttachment(), readyDocument()], 'jaina');

    expect(context.attachments).toHaveLength(1);
    expect(context.attachments[0].assetId).toBe('asset-1');
    expect(context.documents).toHaveLength(1);
    expect(context.documents[0].documentId).toBe('doc-1');
    expect(context.references.map((r) => r.type).sort()).toEqual(['document', 'media_asset']);
  });

  it('drops a document that has not finished indexing', () => {
    const context = buildAgentAttachmentContext([readyDocument({ status: 'indexing' })], 'organic');
    expect(context.documents).toEqual([]);
    expect(context.references).toEqual([]);
  });

  it('drops a document with no documentId', () => {
    const context = buildAgentAttachmentContext(
      [readyDocument({ documentId: undefined })],
      'organic',
    );
    expect(context.documents).toEqual([]);
  });
});
