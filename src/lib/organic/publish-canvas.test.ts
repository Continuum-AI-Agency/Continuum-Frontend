import { describe, expect, it } from 'bun:test';
import {
  buildPublishDraftRow,
  computeWeekStartId,
  normalizePublishScheduledAt,
  PUBLISH_UNASSIGNED_PLATFORM_ACCOUNT_ID,
  publishCanvasRequestSchema,
} from './publish-canvas';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const FULL_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('normalizePublishScheduledAt', () => {
  const now = new Date('2026-07-03T09:15:00');

  it('anchors a bare date at local noon and never returns a date-only value', () => {
    const out = normalizePublishScheduledAt('2026-07-05', now);
    expect(FULL_ISO.test(out)).toBe(true);
    expect(DATE_ONLY.test(out)).toBe(false);
    // Local noon on the 5th, so the calendar day is preserved regardless of tz.
    expect(new Date(out).getFullYear()).toBe(2026);
  });

  it('passes a full datetime through as an ISO timestamptz', () => {
    const out = normalizePublishScheduledAt('2026-07-05T14:30', now);
    expect(FULL_ISO.test(out)).toBe(true);
    expect(new Date(out).getTime()).toBe(new Date('2026-07-05T14:30').getTime());
  });

  it('defaults to the reference day at noon when absent or invalid', () => {
    const empty = normalizePublishScheduledAt(undefined, now);
    const invalid = normalizePublishScheduledAt('not-a-date', now);
    expect(empty).toBe(invalid);
    expect(new Date(empty).getHours()).toBe(12);
  });
});

describe('computeWeekStartId', () => {
  it('returns the Monday of the scheduled week as YYYY-MM-DD', () => {
    // 2026-07-03 is a Friday; that week's Monday is 2026-06-29.
    expect(computeWeekStartId('2026-07-03T12:00:00')).toBe('2026-06-29');
  });

  it('keeps a Monday as its own week start', () => {
    expect(computeWeekStartId('2026-06-29T12:00:00')).toBe('2026-06-29');
  });
});

describe('buildPublishDraftRow', () => {
  const base = {
    brandId: 'brand-1',
    userId: 'user-1',
    clientKey: 'ck-1',
    platform: 'instagram',
    scheduledAtIso: '2026-07-03T12:00:00.000Z',
    status: 'draft' as const,
    contentJson: { creative: { mediaSuggestion: { kind: 'reel' } } },
    mediaStage: 'realized',
    nowIso: '2026-07-03T09:15:00.000Z',
  };

  it('mints an idempotent stub with the unassigned account sentinel and full-timestamptz schedule', () => {
    const row = buildPublishDraftRow(base);
    // id is intentionally omitted so the UPSERT can't mutate the PK on conflict.
    expect(row.id).toBeUndefined();
    expect(row.brand_id).toBe('brand-1');
    expect(row.user_id).toBe('user-1');
    expect(row.client_key).toBe('ck-1');
    expect(row.platform_account_id).toBe(PUBLISH_UNASSIGNED_PLATFORM_ACCOUNT_ID);
    expect(row.status).toBe('draft');
    expect(row.scheduled_date).toBe('2026-07-03T12:00:00.000Z');
    expect(FULL_ISO.test(row.scheduled_date as string)).toBe(true);
    expect(row.media_stage).toBe('realized');
    expect(row.content_json).toEqual(base.contentJson);
  });

  it('records the week start and origin in slot_data', () => {
    const row = buildPublishDraftRow(base);
    const slot = row.slot_data as Record<string, unknown>;
    expect(slot.weekStart).toBe('2026-06-29');
    expect(slot.dayId).toBe('2026-07-03');
    expect(slot.origin).toBe('ai-studio-canvas');
    expect(slot.caption).toBeUndefined();
  });

  it('includes the caption in slot_data only when provided', () => {
    const row = buildPublishDraftRow({ ...base, caption: 'launch day' });
    expect((row.slot_data as Record<string, unknown>).caption).toBe('launch day');
  });
});

describe('publishCanvasRequestSchema', () => {
  it('accepts a minimal create request (no draftId)', () => {
    const parsed = publishCanvasRequestSchema.safeParse({
      brandId: 'brand-1',
      bucket: 'media-library',
      storagePath: 'brand-1/video-edit-node.mp4',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects unknown keys (strict) and missing storage coords', () => {
    expect(
      publishCanvasRequestSchema.safeParse({ brandId: 'b', bucket: 'm', storagePath: 'p', wat: 1 }).success,
    ).toBe(false);
    expect(publishCanvasRequestSchema.safeParse({ brandId: 'b', bucket: 'm' }).success).toBe(false);
  });
});
