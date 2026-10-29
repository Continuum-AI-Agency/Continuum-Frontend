import { describe, expect, it } from 'bun:test';
import {
  JAINA_CLARIFICATION_MAX_CHOICES,
  jainaClarificationFrameDataSchema,
  jainaClarificationRequestSchema,
} from './jaina-clarification';

const request = {
  id: 'clar_1',
  question: '¿Qué resultado de negocio debo usar para este análisis?',
  requested_at: '2026-10-21T14:02:11.000Z',
};

describe('jainaClarificationRequestSchema', () => {
  it('keeps the offered answers', () => {
    const parsed = jainaClarificationRequestSchema.parse({
      ...request,
      choices: ['Leads', 'Compras', 'Conversaciones'],
    });
    expect(parsed.choices).toEqual(['Leads', 'Compras', 'Conversaciones']);
    expect(parsed.source_agent).toBeNull();
  });

  it('reads a request stored before choices existed', () => {
    expect(jainaClarificationRequestSchema.parse(request).choices).toBeUndefined();
  });

  it('refuses a blank answer and an open-ended list', () => {
    expect(jainaClarificationRequestSchema.safeParse({ ...request, choices: [''] }).success).toBe(
      false,
    );
    const many = Array.from({ length: JAINA_CLARIFICATION_MAX_CHOICES + 1 }, (_, i) => `c${i}`);
    expect(jainaClarificationRequestSchema.safeParse({ ...request, choices: many }).success).toBe(
      false,
    );
  });
});

describe('jainaClarificationFrameDataSchema', () => {
  it('nests the request under the text block it was asked in', () => {
    const parsed = jainaClarificationFrameDataSchema.parse({
      item_id: 'item_1',
      part_id: 'part_1',
      clarification: request,
    });
    expect(parsed.clarification.id).toBe('clar_1');
  });
});
