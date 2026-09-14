import { describe, expect, it } from 'bun:test';

import {
  jainaPaidCreativeRenderPayloadSchema,
  type JainaPaidCreativeRenderPayload,
} from './jaina';

const payload: JainaPaidCreativeRenderPayload = {
  render_job_id: '11111111-1111-4111-8111-111111111111',
  brand_id: '22222222-2222-4222-8222-222222222222',
  draft_id: 'draft_1',
  clip_count: 3,
  state: 'awaiting_client_render',
};

describe('jainaPaidCreativeRenderPayloadSchema', () => {
  it('accepts the awaiting client-render artifact', () => {
    expect(jainaPaidCreativeRenderPayloadSchema.parse(payload)).toEqual(payload);
  });

  it('fails closed for malformed render artifacts', () => {
    for (const invalidPayload of [
      { ...payload, render_job_id: 'not-a-uuid' },
      { ...payload, brand_id: 'not-a-uuid' },
      { ...payload, draft_id: '' },
      { ...payload, draft_id: 'x'.repeat(201) },
      { ...payload, clip_count: 0 },
      { ...payload, clip_count: 51 },
      { ...payload, clip_count: 1.5 },
      { ...payload, state: 'rendering' },
      { ...payload, unexpected: true },
    ]) {
      expect(jainaPaidCreativeRenderPayloadSchema.safeParse(invalidPayload).success).toBe(false);
    }
  });
});
