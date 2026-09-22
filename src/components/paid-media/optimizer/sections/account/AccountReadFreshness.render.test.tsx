import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';

import type { AccountReadRefresh } from '../../useOptimizerData';
import { AccountReadFreshness, agoLabel, refreshCopy, takenLine } from './AccountReadFreshness';

afterEach(cleanup);

const NOW = new Date('2026-09-21T12:00:00.000Z');

const refresh = (over: Partial<NonNullable<AccountReadRefresh>> = {}): AccountReadRefresh => ({
  state: 'ready',
  requested_at: null,
  requests_used: 0,
  requests_left: 3,
  can_request: true,
  retry_after: null,
  reason: null,
  ...over,
});

describe('dating the read', () => {
  it('says how long ago in the coarsest unit that is still true', () => {
    expect(agoLabel('2026-09-21T11:59:30.000Z', NOW)).toBe('just now');
    expect(agoLabel('2026-09-21T11:40:00.000Z', NOW)).toBe('20 min ago');
    expect(agoLabel('2026-09-21T11:00:00.000Z', NOW)).toBe('1 hour ago');
    expect(agoLabel('2026-09-21T00:03:30.000Z', NOW)).toBe('11 hours ago');
    expect(agoLabel('2026-09-19T00:03:30.000Z', NOW)).toBe('2 days ago');
  });

  it('refuses to date a timestamp it cannot read, rather than printing NaN', () => {
    expect(agoLabel('not-a-time', NOW)).toBeNull();
    expect(takenLine('not-a-time', NOW)).toBeNull();
    expect(takenLine(null, NOW)).toBeNull();
  });

  it('puts the time the read was taken where the read is read', () => {
    const { getByTestId } = render(
      <AccountReadFreshness
        now={NOW}
        readyAt="2026-09-21T00:03:30.000Z"
        refresh={refresh()}
        utcDay="2026-09-21"
      />,
    );
    // The defect, verbatim: composed at 00:03, deploy at ~06:00, read at noon.
    expect(getByTestId('account-read-taken').textContent).toContain('11 hours ago');
    expect(getByTestId('account-read-taken').textContent).toContain('2026-09-21');
  });

  it('says no read has been taken rather than leaving the line blank', () => {
    const { getByTestId } = render(
      <AccountReadFreshness
        now={NOW}
        readyAt={null}
        refresh={refresh({ state: 'queued' })}
        utcDay={null}
      />,
    );
    expect(getByTestId('account-read-taken').textContent).toBe('No read taken yet');
  });
});

describe('asking again', () => {
  it('asks when tapped', () => {
    const onRequest = mock(() => {});
    const { getByTestId } = render(
      <AccountReadFreshness
        now={NOW}
        onRequest={onRequest}
        readyAt="2026-09-21T00:03:30.000Z"
        refresh={refresh()}
        utcDay="2026-09-21"
      />,
    );
    fireEvent.click(getByTestId('account-read-refresh'));
    expect(onRequest).toHaveBeenCalledTimes(1);
  });

  it('never offers a re-read the server has already said it will refuse', () => {
    const tooSoon = render(
      <AccountReadFreshness
        now={NOW}
        onRequest={() => {}}
        readyAt="2026-09-21T11:50:00.000Z"
        refresh={refresh({
          can_request: false,
          reason: 'too_soon',
          retry_after: '2026-09-21T12:20:00.000Z',
        })}
        utcDay="2026-09-21"
      />,
    );
    expect(tooSoon.getByTestId('account-read-refresh').hasAttribute('disabled')).toBe(true);
    expect(tooSoon.getByTestId('account-read-refresh-note').textContent).toContain('again at');
    cleanup();

    const spent = render(
      <AccountReadFreshness
        now={NOW}
        onRequest={() => {}}
        readyAt="2026-09-21T09:00:00.000Z"
        refresh={refresh({
          can_request: false,
          reason: 'daily_limit',
          requests_left: 0,
          requests_used: 3,
        })}
        utcDay="2026-09-21"
      />,
    );
    expect(spent.getByTestId('account-read-refresh').hasAttribute('disabled')).toBe(true);
    expect(spent.getByTestId('account-read-refresh-note').textContent).toContain(
      'three times today',
    );
  });

  it('offers nothing at all when the RPC is not deployed yet', () => {
    // The Frontend promotes before the migration is applied: `refresh` is absent, so there is
    // no control rather than one that silently fails.
    const { queryByTestId, getByTestId } = render(
      <AccountReadFreshness
        now={NOW}
        onRequest={() => {}}
        readyAt="2026-09-21T00:03:30.000Z"
        refresh={null}
        utcDay="2026-09-21"
      />,
    );
    expect(queryByTestId('account-read-refresh')).toBeNull();
    expect(queryByTestId('account-read-refresh-note')).toBeNull();
    // The date is the half that does not need the new RPC, and it still shows.
    expect(getByTestId('account-read-taken').textContent).toContain('11 hours ago');
  });
});

describe('while a re-read is queued', () => {
  it('says it is happening, and does not look like a failure', () => {
    const { getByTestId, queryByTestId } = render(
      <AccountReadFreshness
        now={NOW}
        onRequest={() => {}}
        readyAt="2026-09-21T00:03:30.000Z"
        refresh={refresh({ can_request: false, reason: 'already_running', state: 'queued' })}
        utcDay="2026-09-21"
      />,
    );
    const note = getByTestId('account-read-refresh-note');
    expect(note.getAttribute('data-running')).toBe('true');
    expect(note.textContent).toContain('Re-reading this account now');
    // The words already on screen are still dated — they are not wiped while the new read runs.
    expect(getByTestId('account-read-taken').textContent).toContain('11 hours ago');
    expect(queryByTestId('account-read-refresh-error')).toBeNull();
    expect(getByTestId('account-read-refresh').textContent).toContain('Re-reading');
  });

  it('calls a stalled row what it is, and lets it be rescued', () => {
    const copy = refreshCopy(refresh({ can_request: true, state: 'stalled' }));
    expect(copy.running).toBe(false);
    expect(copy.note).toContain('stopped part-way');
    const { getByTestId } = render(
      <AccountReadFreshness
        now={NOW}
        onRequest={() => {}}
        readyAt="2026-09-20T00:04:00.000Z"
        refresh={refresh({ can_request: true, state: 'stalled' })}
        utcDay="2026-09-20"
      />,
    );
    expect(getByTestId('account-read-refresh').hasAttribute('disabled')).toBe(false);
  });

  it('says where the ask failed, instead of looking like it took', () => {
    const { getByTestId } = render(
      <AccountReadFreshness
        error="Could not ask for a fresh read: permission denied"
        now={NOW}
        onRequest={() => {}}
        readyAt="2026-09-21T00:03:30.000Z"
        refresh={refresh()}
        utcDay="2026-09-21"
      />,
    );
    expect(getByTestId('account-read-refresh-error').textContent).toContain('permission denied');
  });
});
