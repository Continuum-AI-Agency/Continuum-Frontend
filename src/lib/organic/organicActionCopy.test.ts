import { describe, expect, it } from 'bun:test';
import {
  describeFlooredSchedule,
  describeOrganicFailure,
  isUnpublishedPastDue,
  ORGANIC_ACTION_LABELS,
  PAST_DATE_NOTICE,
  shortDraftId,
} from './organicActionCopy';

describe('describeOrganicFailure', () => {
  it.each([
    ['persist_failed', 'The post was written but could not be saved to your calendar.'],
    ['draft_persist_failed', 'The post was written but could not be saved to your calendar.'],
    ['draft_deleted', 'This post was deleted from your calendar, so its draft no longer exists.'],
    ['enqueue_lost', 'The request never reached the generation queue.'],
    ['placement_timeout', 'Writing this post took too long and was stopped.'],
  ])('maps %s to a sentence, never the code', (code, sentence) => {
    expect(describeOrganicFailure({ phase: 'failed', code, message: `${code}: raw` })).toBe(
      sentence,
    );
  });

  it('a missing draft outranks a stale error code', () => {
    expect(describeOrganicFailure({ phase: 'draft_missing', code: 'placement_timeout' })).toBe(
      'Its draft no longer exists. It was deleted from the calendar or never saved.',
    );
  });

  it('a media failure says the copy survived, whatever the raw message was', () => {
    expect(
      describeOrganicFailure({ phase: 'media_failed', message: 'image model returned nothing' }),
    ).toBe('The copy is saved. Only the media failed to render.');
  });

  it('an unknown code falls back to the message, then to a generic sentence', () => {
    expect(describeOrganicFailure({ phase: 'failed', code: 'weird', message: 'Quota hit' })).toBe(
      'Quota hit',
    );
    expect(describeOrganicFailure({ phase: 'failed', message: '   ' })).toBe(
      'Something went wrong while making this post.',
    );
  });
});

describe('shortDraftId', () => {
  it('keeps four characters, enough to find the row', () => {
    expect(shortDraftId('7f95aaaa-0000-4000-8000-000000000000')).toBe('Draft 7f95…');
  });
});

describe('isUnpublishedPastDue', () => {
  const now = Date.parse('2026-11-13T12:00:00.000Z');
  const past = '2026-11-12T09:00:00.000Z';
  const future = '2026-11-14T09:00:00.000Z';

  it('flags a draft or scheduled post whose moment has passed', () => {
    expect(isUnpublishedPastDue({ status: 'draft', scheduledAt: past, nowMs: now })).toBe(true);
    expect(isUnpublishedPastDue({ status: 'scheduled', scheduledAt: past, nowMs: now })).toBe(true);
    expect(isUnpublishedPastDue({ status: 'failed', scheduledAt: past, nowMs: now })).toBe(true);
  });

  it('leaves published, in-flight, slot-only, future and dateless cards alone', () => {
    expect(isUnpublishedPastDue({ status: 'published', scheduledAt: past, nowMs: now })).toBe(
      false,
    );
    expect(isUnpublishedPastDue({ status: 'streaming', scheduledAt: past, nowMs: now })).toBe(
      false,
    );
    expect(isUnpublishedPastDue({ status: 'placeholder', scheduledAt: past, nowMs: now })).toBe(
      false,
    );
    expect(isUnpublishedPastDue({ status: 'draft', scheduledAt: future, nowMs: now })).toBe(false);
    expect(isUnpublishedPastDue({ status: 'draft', scheduledAt: null, nowMs: now })).toBe(false);
  });

  it('the notice and action words are the shared ones', () => {
    expect(PAST_DATE_NOTICE).toBe('This date has passed; pick a new time');
    expect(ORGANIC_ACTION_LABELS.recreateDraft).toBe('Recreate draft');
    expect(ORGANIC_ACTION_LABELS.openInCalendar).toBe('Open in Calendar');
  });
});

describe('describeFlooredSchedule', () => {
  it('names the post and the moment it was moved to, never silently', () => {
    const toast = describeFlooredSchedule('Cold wash', '2026-11-13T12:15:00.000Z');
    expect(toast.title).toBe('That time has passed');
    expect(toast.description).toContain('“Cold wash” was scheduled for');
    expect(toast.description).toContain('Pick a new time');
    expect(describeFlooredSchedule('  ', '2026-11-13T12:15:00.000Z').description).toContain(
      '“This post”',
    );
  });
});
