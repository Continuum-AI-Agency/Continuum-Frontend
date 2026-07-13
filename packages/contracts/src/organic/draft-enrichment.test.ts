import { describe, expect, it } from 'bun:test';

import {
  draftEnrichmentConflictCodeEnum,
  draftEnrichmentRequestSchema,
  draftEnrichmentResponseSchema,
} from './draft-enrichment';

describe('draftEnrichmentRequestSchema', () => {
  it('accepts a minimal request', () => {
    const parsed = draftEnrichmentRequestSchema.safeParse({ brandId: 'brand-1' });
    expect(parsed.success).toBe(true);
  });

  it('accepts the destructive regenerate flag', () => {
    const parsed = draftEnrichmentRequestSchema.safeParse({
      brandId: 'brand-1',
      regenerate: true,
      guidancePrompt: 'punchier hook',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.regenerate).toBe(true);
  });

  it('rejects a missing brandId', () => {
    const parsed = draftEnrichmentRequestSchema.safeParse({ regenerate: true });
    expect(parsed.success).toBe(false);
  });

  it('rejects a draftId in the body (it is the URL param)', () => {
    const parsed = draftEnrichmentRequestSchema.safeParse({
      brandId: 'brand-1',
      draftId: 'draft-1',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects unknown keys (strict boundary)', () => {
    const parsed = draftEnrichmentRequestSchema.safeParse({
      brandId: 'brand-1',
      somethingExtra: true,
    });
    expect(parsed.success).toBe(false);
  });
});

describe('draftEnrichmentResponseSchema', () => {
  const queued = {
    status: 'queued' as const,
    stage: 'generate_copy' as const,
    draftId: '11111111-1111-4111-8111-111111111111',
    jobId: 'job-1',
    mediaStage: 'text_only' as const,
  };

  it('accepts a queued response for each stage', () => {
    expect(draftEnrichmentResponseSchema.safeParse(queued).success).toBe(true);
    expect(
      draftEnrichmentResponseSchema.safeParse({
        ...queued,
        stage: 'build_blueprint',
        mediaStage: 'storyboard_ready',
      }).success,
    ).toBe(true);
  });

  it('rejects a non-queued status', () => {
    expect(draftEnrichmentResponseSchema.safeParse({ ...queued, status: 'running' }).success).toBe(
      false,
    );
  });

  it("rejects a stage outside the ladder's two enqueueing stages", () => {
    expect(
      draftEnrichmentResponseSchema.safeParse({ ...queued, stage: 'realize_media' }).success,
    ).toBe(false);
  });

  it('constrains mediaStage to the canonical media_stage enum', () => {
    expect(draftEnrichmentResponseSchema.safeParse({ ...queued, mediaStage: 'done' }).success).toBe(
      false,
    );
    for (const stage of ['text_only', 'storyboard_ready', 'realizing', 'realized', 'failed']) {
      expect(
        draftEnrichmentResponseSchema.safeParse({ ...queued, mediaStage: stage }).success,
      ).toBe(true);
    }
  });

  it('requires a jobId', () => {
    const { jobId: _dropped, ...withoutJobId } = queued;
    expect(draftEnrichmentResponseSchema.safeParse(withoutJobId).success).toBe(false);
  });
});

describe('draftEnrichmentConflictCodeEnum', () => {
  it('names every precondition the routes enforce', () => {
    expect(draftEnrichmentConflictCodeEnum.options).toEqual([
      'already_has_copy',
      'already_realized',
      'no_copy_yet',
      'already_blueprinted',
    ]);
  });
});
