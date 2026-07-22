import { describe, expect, it } from 'bun:test';
import {
  isAcceptedDocumentMime,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_MB,
  validateDocumentUploadMetadata,
} from './uploadLimits';

const BRAND = '11111111-1111-1111-1111-111111111111';
const DOC = '22222222-2222-2222-2222-222222222222';

function validMetadata(overrides: Record<string, unknown> = {}) {
  return {
    brandId: BRAND,
    documentId: DOC,
    storagePath: `${BRAND}/${DOC}/report.pdf`,
    fileName: 'report.pdf',
    mimeType: 'application/pdf',
    size: 10 * 1024 * 1024,
    ...overrides,
  };
}

describe('upload limit constants', () => {
  it('caps documents at 25 MiB', () => {
    expect(MAX_DOCUMENT_BYTES).toBe(25 * 1024 * 1024);
    expect(MAX_DOCUMENT_MB).toBe(25);
  });
});

describe('isAcceptedDocumentMime', () => {
  it('accepts pdf, office docs, json', () => {
    expect(isAcceptedDocumentMime('application/pdf')).toBe(true);
    expect(
      isAcceptedDocumentMime(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe(true);
    expect(isAcceptedDocumentMime('application/json')).toBe(true);
  });

  it('accepts text/* and image/* via prefix', () => {
    expect(isAcceptedDocumentMime('text/plain')).toBe(true);
    expect(isAcceptedDocumentMime('text/markdown')).toBe(true);
    expect(isAcceptedDocumentMime('image/png')).toBe(true);
  });

  it('tolerates an empty MIME like the legacy route', () => {
    expect(isAcceptedDocumentMime('')).toBe(true);
  });

  it('rejects unsupported types', () => {
    expect(isAcceptedDocumentMime('application/zip')).toBe(false);
    expect(isAcceptedDocumentMime('video/mp4')).toBe(false);
  });
});

describe('validateDocumentUploadMetadata', () => {
  it('accepts well-formed metadata for a large (but in-limit) pdf', () => {
    const result = validateDocumentUploadMetadata(validMetadata({ size: 24 * 1024 * 1024 }));
    expect(result.ok).toBe(true);
  });

  it('rejects a file over the 25 MiB limit with 413', () => {
    const result = validateDocumentUploadMetadata(validMetadata({ size: MAX_DOCUMENT_BYTES + 1 }));
    expect(result).toEqual({ ok: false, status: 413, error: 'File exceeds 25 MB limit' });
  });

  it('rejects a storagePath outside the brand/document scope', () => {
    const result = validateDocumentUploadMetadata(
      validMetadata({ storagePath: `other-brand/${DOC}/report.pdf` }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it('rejects a documentId containing path traversal', () => {
    const result = validateDocumentUploadMetadata(
      validMetadata({ documentId: '../escape', storagePath: `${BRAND}/../escape/x.pdf` }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it('rejects an unsupported MIME with 415', () => {
    const result = validateDocumentUploadMetadata(validMetadata({ mimeType: 'application/zip' }));
    expect(result).toEqual({
      ok: false,
      status: 415,
      error: 'Unsupported file type: application/zip',
    });
  });

  it('rejects a zero or negative size with 400', () => {
    expect(validateDocumentUploadMetadata(validMetadata({ size: 0 })).ok).toBe(false);
    expect(validateDocumentUploadMetadata(validMetadata({ size: -5 })).ok).toBe(false);
  });

  it('rejects missing brand context', () => {
    const result = validateDocumentUploadMetadata(validMetadata({ brandId: '' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });
});
