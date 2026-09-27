import { describe, expect, it } from 'bun:test';
import {
  ensureAssetPreviewRequestSchema,
  ensureAssetPreviewResponseSchema,
  sharePreviewRoleFor,
} from './ensure-preview';

describe('sharePreviewRoleFor', () => {
  it('stores a WebP still for JPEG / PNG / WebP photos', () => {
    for (const fileName of ['a.jpg', 'a.JPEG', 'a.png', 'a.webp']) {
      expect(sharePreviewRoleFor({ fileName })).toBe('preview_image');
    }
  });

  it('stores a 720p proxy for every video, a small browser MP4 included', () => {
    expect(sharePreviewRoleFor({ fileName: 'clip.mp4', mimeType: 'video/mp4' })).toBe(
      'preview_video',
    );
    expect(sharePreviewRoleFor({ fileName: 'tape.mov' })).toBe('preview_video');
    expect(sharePreviewRoleFor({ fileName: 'cut.mkv' })).toBe('preview_video');
  });

  it('falls back to the MIME type for an extensionless or unknown name, and covers AVIF', () => {
    // 325 of prod's photos are named like this.
    expect(sharePreviewRoleFor({ fileName: 'gemini-file-8h2k', mimeType: 'image/png' })).toBe(
      'preview_image',
    );
    expect(sharePreviewRoleFor({ fileName: 'gemini-file-8h2k', mimeType: 'image/jpeg' })).toBe(
      'preview_image',
    );
    expect(sharePreviewRoleFor({ fileName: 'render.final', mimeType: 'image/webp' })).toBe(
      'preview_image',
    );
    expect(sharePreviewRoleFor({ fileName: 'still.avif' })).toBe('preview_image');
    expect(sharePreviewRoleFor({ fileName: 'gemini-file-9x', mimeType: 'video/mp4' })).toBe(
      'preview_video',
    );
    // Still nothing for an extensionless GIF, a name with no type at all, or HEIC.
    expect(sharePreviewRoleFor({ fileName: 'gemini-file-9x', mimeType: 'image/gif' })).toBeNull();
    expect(sharePreviewRoleFor({ fileName: 'gemini-file-9x' })).toBeNull();
    expect(sharePreviewRoleFor({ fileName: 'IMG_0001.HEIC', mimeType: 'image/heic' })).toBeNull();
  });

  it('lets a known extension decide over the MIME type', () => {
    expect(sharePreviewRoleFor({ fileName: 'loop.gif', mimeType: 'image/png' })).toBeNull();
  });

  it('gives nothing to a GIF (keeps its animation), audio, a PDF or an unknown file', () => {
    for (const fileName of ['loop.gif', 'voice.mp3', 'brief.pdf', 'thing.exe']) {
      expect(sharePreviewRoleFor({ fileName })).toBeNull();
    }
  });
});

describe('ensure-preview wire shapes', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  it('takes an optional version, so a share can ask for the one it shows', () => {
    expect(
      ensureAssetPreviewRequestSchema.safeParse({ brandId: id, assetId: id, assetVersionId: id })
        .success,
    ).toBe(true);
    expect(
      ensureAssetPreviewRequestSchema.safeParse({ brandId: id, assetId: id, assetVersionId: 'v2' })
        .success,
    ).toBe(false);
  });

  it('takes a brand and an asset, nothing else', () => {
    expect(ensureAssetPreviewRequestSchema.safeParse({ brandId: id, assetId: id }).success).toBe(
      true,
    );
    expect(
      ensureAssetPreviewRequestSchema.safeParse({ brandId: id, assetId: id, force: true }).success,
    ).toBe(false);
  });

  it('answers with the rendition to look for and its state', () => {
    expect(
      ensureAssetPreviewResponseSchema.parse({
        assetId: id,
        assetVersionId: id,
        role: 'preview_video',
        state: 'pending',
        renditionId: null,
      }).state,
    ).toBe('pending');
  });
});
