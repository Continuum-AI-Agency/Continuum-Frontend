import { describe, expect, it } from 'bun:test';
import { checkPublishability, resolvePublishPlan } from '@continuum/contracts';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { publishPlanDraftFromCalendarDraft } from './publishPlan';

const base: OrganicCalendarDraft = {
  id: 'fe-1',
  backendDraftId: 'be-1',
  title: 'Leg day',
  summary: '',
  timeLabel: '10:00',
  dateLabel: '',
  status: 'draft',
  platforms: ['instagram'],
  format: 'Carousel',
  objective: '',
  captionPreview: 'Lunch-break leg day.',
  tags: [],
  mediaCount: 0,
};

const image = (storagePath: string, slideIndex?: number, role = 'slide') => ({
  role,
  kind: 'image' as const,
  slideIndex,
  bucket: 'brand-profile-assets',
  storagePath,
  storageUrl: `https://cdn.test/${storagePath}`,
  width: 1080,
  height: 1350,
});

const plan = (draft: OrganicCalendarDraft) =>
  resolvePublishPlan({
    draft: publishPlanDraftFromCalendarDraft(draft),
    platform: 'instagram',
    account: { requestedAccountId: null, boundAccountId: 'acct-1', accounts: null },
    publishOptions: null,
    mediaGenerated: null,
  });

describe('publishPlanDraftFromCalendarDraft', () => {
  it('keys the plan by the backend row id', () => {
    expect(publishPlanDraftFromCalendarDraft(base).id).toBe('be-1');
    expect(publishPlanDraftFromCalendarDraft({ ...base, backendDraftId: undefined }).id).toBe(
      'fe-1',
    );
  });

  it('sends slides in slideIndex order, unindexed last, never the cover', () => {
    const result = plan({
      ...base,
      publishingAssets: [
        image('c.png'),
        image('b.png', 1),
        image('cover.png', 0, 'cover'),
        image('a.png', 0),
      ],
    });
    expect(result.verb).toBe('carousel');
    expect(result.media.map((media) => media.storagePath)).toEqual(['a.png', 'b.png', 'c.png']);
  });

  it('carries the hashtags into the caption exactly as sent', () => {
    const result = plan({
      ...base,
      publishingAssets: [image('a.png', 0), image('b.png', 1)],
      hashtags: { high: ['#legday'], medium: ['#homeworkout'] },
    });
    expect(result.caption.text).toContain('#legday');
    expect(result.caption.text).toContain('#homeworkout');
    expect(result.caption.text?.startsWith('Lunch-break leg day.')).toBe(true);
  });

  it('sends no caption on a story and still lets it publish', () => {
    const result = plan({
      ...base,
      format: 'Story',
      captionPreview: '',
      publishingAssets: [image('a.png', 0)],
    });
    expect(result.caption.text).toBeNull();
    expect(checkPublishability(result).publishable).toBe(true);
  });

  it('counts a hyperframe only once its mp4 is ready', () => {
    const rendering = plan({
      ...base,
      format: 'hyperframe',
      mediaSuggestion: {
        mediaStatus: 'ready',
        hyperframe: { mp4Status: 'pending', mp4Path: 'hf/a.mp4', coverPath: 'hf/a.png' },
      },
    });
    expect(rendering.media).toEqual([]);
    expect(rendering.mediaPending).toBe('hyperframe_rendering');
    expect(checkPublishability(rendering).blockers.map((issue) => issue.reason)).toContain(
      'hyperframe_mp4_not_ready',
    );
  });

  // Gating #9: no aspect check anywhere. The dimensions must reach the resolver for it to see one.
  it('carries asset dimensions so an out-of-range aspect becomes a notice', () => {
    const result = plan({
      ...base,
      format: 'Post',
      publishingAssets: [{ ...image('tall.png', 0, 'primary'), width: 1080, height: 2400 }],
    });
    expect(result.media[0]?.height).toBe(2400);
    expect(result.notices.map((notice) => notice.code)).toContain('aspect_out_of_range');
  });

  it('reads the saved per-platform options block', () => {
    const result = plan({
      ...base,
      publishingAssets: [image('a.png', 0), image('b.png', 1)],
      publishOptions: { instagram: { firstComment: 'Save this for Thursday' } },
    });
    expect(result.options.firstComment).toBe('Save this for Thursday');
  });
});
