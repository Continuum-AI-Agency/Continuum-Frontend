// Unit tests for the pure utility functions used in DocumentNode.
// These tests do not require a DOM environment.
// Component rendering tests are deferred until the test environment is
// configured with happy-dom (see Continuum-Frontend/bunfig.toml [test.environment]).

import { describe, it, expect } from 'bun:test';
import { sanitizeStorageFileName } from '@/lib/storage/sanitize';
import {
  isAcceptedDocumentMime,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_MB,
} from '@/lib/documents/uploadLimits';

describe('document upload limits', () => {
  it('rejects oversized files', () => {
    expect(MAX_DOCUMENT_BYTES).toBe(25 * 1024 * 1024);
    expect(MAX_DOCUMENT_MB).toBe(25);
  });

  it('accepts PDF mime type', () => {
    expect(isAcceptedDocumentMime('application/pdf')).toBe(true);
  });

  it('accepts plain text', () => {
    expect(isAcceptedDocumentMime('text/plain')).toBe(true);
  });

  it('accepts docx', () => {
    expect(isAcceptedDocumentMime(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )).toBe(true);
  });

  it('rejects unknown binary', () => {
    expect(isAcceptedDocumentMime('application/octet-stream')).toBe(false);
  });
});

describe('sanitizeStorageFileName', () => {
  it('lowercases and sanitizes PDF filenames', () => {
    expect(sanitizeStorageFileName('My Report.pdf')).toBe('my-report.pdf');
  });

  it('strips path separators', () => {
    expect(sanitizeStorageFileName('path/to/file.txt')).toBe('path-to-file.txt');
  });

  it('handles files with no extension', () => {
    expect(sanitizeStorageFileName('readme')).toBe('readme');
  });
});
