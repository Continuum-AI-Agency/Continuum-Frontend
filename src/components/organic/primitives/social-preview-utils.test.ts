import { describe, expect, it } from 'bun:test';

import { buildInstagramPreviewData, buildLinkedInPreviewData } from './social-preview-utils';
import type { OrganicCalendarDraft } from './types';

// 2,600 chars: over Instagram's 2200 ceiling, under LinkedIn's 3000. The exact shape of
// the live bug — the preview and the publisher disagreed about what fits.
const LONG_CAPTION = `${'word '.repeat(519)}finalword`;

const draft = (overrides: Partial<OrganicCalendarDraft> = {}): OrganicCalendarDraft =>
  ({
    id: 'draft-1',
    title: 'A post',
    summary: '',
    timeLabel: '9:00 AM',
    dateLabel: 'Mon',
    status: 'draft',
    platforms: ['instagram'],
    format: 'post',
    objective: '',
    captionPreview: 'Fresh out of the oven',
    tags: [],
    mediaCount: 0,
    ...overrides,
  }) as OrganicCalendarDraft;

describe('preview captions follow the destination platform', () => {
  it('clamps the Instagram frame at 2200', () => {
    const preview = buildInstagramPreviewData(draft({ captionPreview: LONG_CAPTION }));
    expect(preview.caption.length).toBeLessThanOrEqual(2200);
  });

  it('keeps the LinkedIn frame whole at 2,600 chars', () => {
    const preview = buildLinkedInPreviewData(draft({ captionPreview: LONG_CAPTION }));
    expect(preview.content).toBe(LONG_CAPTION.trim());
    expect(preview.content.length).toBeGreaterThan(2200);
  });

  it('reads the draft platform, not the frame name, for the Instagram builder', () => {
    const linkedinDraft = draft({ captionPreview: LONG_CAPTION, platforms: ['linkedin'] });
    expect(buildInstagramPreviewData(linkedinDraft).caption).toBe(LONG_CAPTION.trim());
  });

  it('leaves short captions byte-identical on every platform', () => {
    const short = draft({ captionPreview: 'Fresh bread' });
    expect(buildInstagramPreviewData(short).caption).toBe('Fresh bread');
    expect(buildLinkedInPreviewData(short).content).toBe('Fresh bread');
  });
});
