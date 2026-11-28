import { describe, expect, it } from 'bun:test';
import {
  type DocumentRegion,
  documentLayoutResponseSchema,
  isDocumentLayoutMimeType,
  regionForPassage,
} from './layout';

const region = (id: string, text: string): DocumentRegion => ({
  id,
  category: 'text',
  name: id,
  preview: text.slice(0, 20),
  box: { page: 1, x: 0, y: 0, w: 1, h: 0.1 },
  confidence: 0.9,
  text,
  fields: [],
  table: null,
});

describe('regionForPassage', () => {
  const regions = [
    region('vendor', 'Halvorsen & Pike Ltd. 14 Wharf Road, Unit 3 Bristol BS1 6QA'),
    region('total', 'Subtotal 12,480.00 VAT 20% 2,496.00 Amount due EUR 14,976.00'),
  ];

  it('puts a quoted passage back on the region it came from', () => {
    expect(regionForPassage(regions, 'the amount due was EUR 14,976.00 after VAT')?.id).toBe(
      'total',
    );
  });

  it('answers null rather than guessing when nothing really matches', () => {
    expect(regionForPassage(regions, 'quarterly brand campaign objectives')).toBeNull();
    expect(regionForPassage(regions, '')).toBeNull();
  });
});

describe('layout boundary', () => {
  it('parses only PDFs and images', () => {
    expect(isDocumentLayoutMimeType('application/pdf')).toBe(true);
    expect(isDocumentLayoutMimeType('image/png')).toBe(true);
    expect(
      isDocumentLayoutMimeType(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe(false);
    expect(isDocumentLayoutMimeType(null)).toBe(false);
  });

  it('refuses a box outside the page', () => {
    const parsed = documentLayoutResponseSchema.safeParse({
      status: 'parsed',
      fileUrl: 'https://x',
      mimeType: 'application/pdf',
      cached: false,
      layout: {
        documentId: 'd',
        pageCount: 1,
        model: 'm',
        parsedAt: '2026-11-24T00:00:00Z',
        durationMs: 1,
        regions: [{ ...region('r', 't'), box: { page: 1, x: 0.5, y: 0, w: 1.2, h: 0.1 } }],
      },
    });
    expect(parsed.success).toBe(false);
  });
});
