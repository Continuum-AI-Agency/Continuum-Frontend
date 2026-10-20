import { describe, expect, it } from 'bun:test';

import {
  librarySignUploadRequestSchema,
  libraryUploadTicketSchema,
  nativeTemplateUploadVariantSchema,
  registerMediaErrorSchema,
  registerMediaRequestSchema,
  registerMediaResponseSchema,
} from './library-upload';

describe('native uploaded variant parent pins', () => {
  const uuid = '11111111-1111-4111-8111-111111111111';
  const intent = {
    schemaVersion: 'hyperframes.upload-variant/1',
    templateId: uuid,
    variantId: uuid,
    parentRevisionId: uuid,
    sourceAssetId: uuid,
    sourceVersionId: uuid,
    sourceSha256: 'a'.repeat(64),
    sceneSha256: 'b'.repeat(64),
    name: ' Native child ',
  };
  const body = {
    brandId: 'b1',
    assetId: 'asset-1',
    bucket: 'media-source',
    storagePath: 'b1/asset-1/source.html',
    fileName: 'source.html',
    mimeType: 'text/html',
    sizeBytes: 10,
    nativeVariant: intent,
  };
  it('requires every immutable parent identity and strips no unknown fields', () => {
    expect(nativeTemplateUploadVariantSchema.parse(intent).name).toBe('Native child');
    for (const key of [
      'templateId',
      'variantId',
      'parentRevisionId',
      'sourceAssetId',
      'sourceVersionId',
      'sourceSha256',
      'sceneSha256',
    ]) {
      const incomplete = { ...intent } as Record<string, unknown>;
      delete incomplete[key];
      expect(nativeTemplateUploadVariantSchema.safeParse(incomplete).success).toBe(false);
    }
    expect(
      nativeTemplateUploadVariantSchema.safeParse({ ...intent, storagePath: '/private' }).success,
    ).toBe(false);
  });
  it('accepts HTML/ZIP native branches and refuses AE intent mixing', () => {
    expect(registerMediaRequestSchema.safeParse(body).success).toBe(true);
    expect(registerMediaRequestSchema.safeParse({ ...body, fileName: 'source.zip' }).success).toBe(
      true,
    );
    expect(registerMediaRequestSchema.safeParse({ ...body, fileName: 'source.aep' }).success).toBe(
      false,
    );
    expect(registerMediaRequestSchema.safeParse({ ...body, templateVariantOf: uuid }).success).toBe(
      false,
    );
  });
});

describe('librarySignUploadRequestSchema', () => {
  it('requires brandId, fileName, mimeType, and a trustworthy size', () => {
    expect(
      librarySignUploadRequestSchema.safeParse({
        brandId: 'b1',
        fileName: 'photo.png',
        mimeType: 'image/png',
        sizeBytes: 12345,
      }).success,
    ).toBe(true);
    expect(
      librarySignUploadRequestSchema.safeParse({ brandId: 'b1', fileName: 'photo.png' }).success,
    ).toBe(false);
  });

  it('rejects unknown keys (strict boundary)', () => {
    expect(
      librarySignUploadRequestSchema.safeParse({
        brandId: 'b1',
        fileName: 'photo.png',
        mimeType: 'image/png',
        sizeBytes: 12345,
        extra: true,
      }).success,
    ).toBe(false);
  });
});

describe('libraryUploadTicketSchema', () => {
  it('parses the bucket/path/token/assetId returned by the edge fn', () => {
    const parsed = libraryUploadTicketSchema.parse({
      bucket: 'media-library',
      path: 'b1/asset-1/photo.png',
      token: 'signed-token',
      assetId: 'asset-1',
    });
    expect(parsed.assetId).toBe('asset-1');
  });

  it('rejects a ticket missing the assetId', () => {
    expect(
      libraryUploadTicketSchema.safeParse({
        bucket: 'media-library',
        path: 'b1/asset-1/photo.png',
        token: 'signed-token',
      }).success,
    ).toBe(false);
  });
});

describe('registerMediaRequestSchema', () => {
  it('requires the upload coordinates and a non-negative size', () => {
    const ok = registerMediaRequestSchema.safeParse({
      brandId: 'b1',
      assetId: 'asset-1',
      bucket: 'media-library',
      storagePath: 'b1/asset-1/photo.png',
      fileName: 'photo.png',
      mimeType: 'image/png',
      sizeBytes: 12345,
    });
    expect(ok.success).toBe(true);
  });

  it('rejects a negative or fractional size', () => {
    const base = {
      brandId: 'b1',
      assetId: 'asset-1',
      bucket: 'media-library',
      storagePath: 'b1/asset-1/photo.png',
      fileName: 'photo.png',
      mimeType: 'image/png',
    };
    expect(registerMediaRequestSchema.safeParse({ ...base, sizeBytes: -1 }).success).toBe(false);
    expect(registerMediaRequestSchema.safeParse({ ...base, sizeBytes: 1.5 }).success).toBe(false);
  });
});

describe('registerMediaResponseSchema', () => {
  it('accepts a ready result with a signed url', () => {
    const parsed = registerMediaResponseSchema.parse({
      ok: true,
      status: 'ready',
      assetId: 'asset-1',
      versionId: '11111111-1111-4111-8111-111111111111',
      storagePath: 'b1/asset-1/photo.png',
      signedUrl: 'https://signed.example/photo.png',
    });
    expect(parsed.status).toBe('ready');
  });

  it('accepts an idempotent exists result', () => {
    expect(
      registerMediaResponseSchema.safeParse({
        ok: true,
        status: 'exists',
        assetId: 'asset-1',
        versionId: '11111111-1111-4111-8111-111111111111',
        storagePath: 'b1/asset-1/photo.png',
        signedUrl: 'https://signed.example/photo.png',
      }).success,
    ).toBe(true);
  });

  it('rejects a response without a signed url', () => {
    expect(
      registerMediaResponseSchema.safeParse({
        ok: true,
        status: 'ready',
        assetId: 'asset-1',
        storagePath: 'b1/asset-1/photo.png',
        signedUrl: '',
      }).success,
    ).toBe(false);
  });
});

describe('registerMediaErrorSchema', () => {
  it('carries a server message', () => {
    const parsed = registerMediaErrorSchema.parse({
      ok: false,
      status: 'error',
      message: 'DB insert failed',
    });
    expect(parsed.message).toBe('DB insert failed');
  });
});
