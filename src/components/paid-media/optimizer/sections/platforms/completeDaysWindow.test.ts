import { describe, expect, it } from 'bun:test';
import { completeDaysWindow } from './googleAdsOverviewModel';

// PP-DT-B-utc-complete-days-window (deep test 2026-10-31). The Google tab's "complete days" were
// UTC days: from 18:00 to 24:00 in Mexico City (00:00–06:00 UTC the next day) the "last 7
// complete days" ended on the account's own unfinished today. A window ends on the account's last
// complete day when the page knows it — the producer's window is dated in the account's calendar.

describe('completeDaysWindow', () => {
  it('19:00 on Oct 31 in Mexico City (01:00 UTC Nov 1): the 7 days end Oct 30, not Oct 31', () => {
    expect(completeDaysWindow(7, new Date('2026-11-01T01:00:00Z'), '2026-10-30')).toEqual({
      since: '2026-10-24',
      until: '2026-10-30',
    });
  });

  it('14 days on the same account day end on the same day', () => {
    expect(completeDaysWindow(14, new Date('2026-11-01T01:00:00Z'), '2026-10-30')).toEqual({
      since: '2026-10-17',
      until: '2026-10-30',
    });
  });

  it('with no account-dated day the UTC days stand in, as before', () => {
    expect(completeDaysWindow(7, new Date('2026-10-31T22:00:00Z'))).toEqual({
      since: '2026-10-24',
      until: '2026-10-30',
    });
  });
});
