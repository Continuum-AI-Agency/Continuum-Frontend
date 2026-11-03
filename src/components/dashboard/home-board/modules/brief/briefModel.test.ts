import { describe, expect, it } from 'bun:test';
import {
  BRIEF_TODAY,
  EMPTY_NARRATIVE_READ,
  GOOGLE_ACCOUNT,
  GOOGLE_NARRATIVE,
  GOOGLE_READ_STALE,
  GOOGLE_READ_TODAY,
  META_ACCOUNT,
  META_NARRATIVE,
  META_READ_TODAY,
  ORPHAN_ACCOUNT,
  QUEUED_FIRST_READ,
} from './__fixtures__/accountReads';
import { type BriefRead, briefEntries, briefView, readOnLabel, staleLabel } from './briefModel';

const ready = (account: BriefRead['account'], data: BriefRead['data']): BriefRead => ({
  account,
  status: 'success',
  data,
});

describe('briefEntries', () => {
  it('keeps one entry per account, newest composition first', () => {
    const entries = briefEntries(
      [ready(GOOGLE_ACCOUNT, GOOGLE_READ_TODAY), ready(META_ACCOUNT, META_READ_TODAY)],
      BRIEF_TODAY,
    );
    expect(entries.map((entry) => entry.adAccountId)).toEqual([META_ACCOUNT.id, GOOGLE_ACCOUNT.id]);
    expect(entries[0]).toMatchObject({
      accountName: 'Easy Fit Meta',
      platform: 'meta',
      day: '2026-11-03',
      narrative: META_NARRATIVE,
      daysOld: 0,
      stale: false,
    });
  });

  it('keeps the latest read when the same account is listed twice (act_ and bare id)', () => {
    const entries = briefEntries(
      [
        ready(GOOGLE_ACCOUNT, GOOGLE_READ_STALE),
        ready({ ...GOOGLE_ACCOUNT, name: 'Duplicate' }, GOOGLE_READ_TODAY),
        ready(META_ACCOUNT, META_READ_TODAY),
        ready({ ...META_ACCOUNT, id: '521903353286118' }, META_READ_TODAY),
      ],
      BRIEF_TODAY,
    );
    expect(entries).toHaveLength(2);
    expect(entries.find((entry) => entry.platform === 'google_ads')?.day).toBe('2026-11-03');
  });

  it('shows a stale read with its own date and how old it is', () => {
    const [entry] = briefEntries([ready(GOOGLE_ACCOUNT, GOOGLE_READ_STALE)], BRIEF_TODAY);
    expect(entry?.day).toBe('2026-10-30');
    expect(entry?.daysOld).toBe(4);
    expect(entry?.stale).toBe(true);
    expect(entry && readOnLabel(entry, BRIEF_TODAY)).toBe('Read on Oct 30');
    expect(entry && staleLabel(entry)).toBe('4 days old');
  });

  it("calls yesterday's read fresh enough, still dated", () => {
    const [entry] = briefEntries(
      [ready(GOOGLE_ACCOUNT, { ...GOOGLE_READ_TODAY, utc_day: '2026-11-02' })],
      BRIEF_TODAY,
    );
    expect(entry?.stale).toBe(false);
    expect(entry && staleLabel(entry)).toBeNull();
    expect(entry && readOnLabel(entry, BRIEF_TODAY)).toBe('Read on Nov 2');
  });

  it('names the year when the read is from another year', () => {
    const [entry] = briefEntries(
      [
        ready(GOOGLE_ACCOUNT, {
          ...GOOGLE_READ_TODAY,
          utc_day: '2025-12-30',
          ready_at: '2025-12-30T00:02:00Z',
        }),
      ],
      BRIEF_TODAY,
    );
    expect(entry && readOnLabel(entry, BRIEF_TODAY)).toBe('Read on Dec 30, 2025');
  });

  it('drops accounts with no composed words: no row, a queued first read, an empty narrative', () => {
    const entries = briefEntries(
      [
        ready(ORPHAN_ACCOUNT, null),
        ready(GOOGLE_ACCOUNT, QUEUED_FIRST_READ),
        ready(META_ACCOUNT, EMPTY_NARRATIVE_READ),
      ],
      BRIEF_TODAY,
    );
    expect(entries).toEqual([]);
  });

  it('keeps the narrative exactly as stored', () => {
    const [entry] = briefEntries([ready(GOOGLE_ACCOUNT, GOOGLE_READ_TODAY)], BRIEF_TODAY);
    expect(entry?.narrative).toBe(GOOGLE_NARRATIVE);
  });
});

describe('briefView', () => {
  it('is loading while any account is still reading', () => {
    expect(
      briefView(
        [
          ready(META_ACCOUNT, META_READ_TODAY),
          { account: GOOGLE_ACCOUNT, status: 'pending', data: undefined },
        ],
        BRIEF_TODAY,
      ).state,
    ).toBe('loading');
  });

  it('is ready with the latest read as its headline', () => {
    const view = briefView(
      [ready(GOOGLE_ACCOUNT, GOOGLE_READ_STALE), ready(META_ACCOUNT, META_READ_TODAY)],
      BRIEF_TODAY,
    );
    expect(view.state).toBe('ready');
    if (view.state !== 'ready') return;
    expect(view.headline).toEqual({ day: '2026-11-03', label: 'Read on Nov 3' });
    expect(view.entries).toHaveLength(2);
    expect(view.failed).toBe(0);
  });

  it('is missing when every read settled with nothing stored', () => {
    expect(
      briefView([ready(META_ACCOUNT, null), ready(GOOGLE_ACCOUNT, QUEUED_FIRST_READ)], BRIEF_TODAY)
        .state,
    ).toBe('missing');
    expect(briefView([], BRIEF_TODAY).state).toBe('missing');
  });

  it('is an error when a read failed and nothing else has words', () => {
    expect(
      briefView(
        [{ account: META_ACCOUNT, status: 'error', data: undefined }, ready(GOOGLE_ACCOUNT, null)],
        BRIEF_TODAY,
      ).state,
    ).toBe('error');
  });

  it('shows what was read and counts the account that failed', () => {
    const view = briefView(
      [
        { account: META_ACCOUNT, status: 'error', data: undefined },
        ready(GOOGLE_ACCOUNT, GOOGLE_READ_TODAY),
      ],
      BRIEF_TODAY,
    );
    expect(view.state).toBe('ready');
    if (view.state === 'ready') expect(view.failed).toBe(1);
  });
});
