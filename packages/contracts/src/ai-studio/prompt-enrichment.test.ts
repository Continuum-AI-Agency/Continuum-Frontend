import { describe, expect, it } from 'bun:test';

import { enrichPromptRequestSchema } from './prompt-enrichment';

describe('enrichPromptRequestSchema', () => {
  it('defaults prompt to empty and requires brandId', () => {
    const parsed = enrichPromptRequestSchema.parse({ brandId: 'brand-1' });
    expect(parsed.prompt).toBe('');
    expect(parsed.brandId).toBe('brand-1');
  });

  it('rejects a missing brandId', () => {
    const result = enrichPromptRequestSchema.safeParse({ prompt: 'hi' });
    expect(result.success).toBe(false);
  });

  it('carries the grounding data piece', () => {
    const parsed = enrichPromptRequestSchema.parse({
      brandId: 'brand-1',
      prompt: 'summer sale',
      skillIds: ['skill-a', 'skill-b'],
      brandBookPieces: ['voice', 'colors'],
    });
    expect(parsed.skillIds).toEqual(['skill-a', 'skill-b']);
    expect(parsed.brandBookPieces).toEqual(['voice', 'colors']);
  });

  it('rejects an unknown brand-book piece', () => {
    const result = enrichPromptRequestSchema.safeParse({
      brandId: 'brand-1',
      brandBookPieces: ['not-a-piece'],
    });
    expect(result.success).toBe(false);
  });

  it('accepts a document context with a source document id', () => {
    const parsed = enrichPromptRequestSchema.parse({
      brandId: 'brand-1',
      context: {
        documents: [{ name: 'brief.pdf', type: 'pdf', sourceDocumentId: 'doc-1' }],
      },
    });
    expect(parsed.context?.documents?.[0]?.name).toBe('brief.pdf');
  });
});
