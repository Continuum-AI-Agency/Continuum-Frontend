import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchInstagramAccountDailySnapshots } from '../../supabase/functions/fetch-organic-analytics/lib/instagram';

test('fetchInstagramAccountDailySnapshots returns sequential 7d snapshot points', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ since: string | null; until: string | null }> = [];

  globalThis.fetch = (async (input) => {
    const url = new URL(String(input));
    const since = url.searchParams.get('since');
    const until = url.searchParams.get('until');
    calls.push({ since, until });

    const day = Number.parseInt((since ?? '0').slice(-2), 10);
    const payload = {
      data: [
        { name: 'reach', total_value: { value: day } },
        { name: 'views', total_value: { value: day * 10 } },
        { name: 'accounts_engaged', total_value: { value: day * 2 } },
        { name: 'comments', total_value: { value: day * 3 } },
        { name: 'follower_count', total_value: { value: day - 1 } },
        { name: 'profile_views', total_value: { value: day + 5 } },
      ],
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const warnings: string[] = [];
    const snapshots = await fetchInstagramAccountDailySnapshots({
      accountId: 'ig-account-1',
      accessToken: 'token',
      until: '2026-02-25',
      warnings,
    });

    assert.equal(snapshots.length, 7);
    assert.deepEqual(
      snapshots.map((point) => point.date),
      [
        '2026-02-19',
        '2026-02-20',
        '2026-02-21',
        '2026-02-22',
        '2026-02-23',
        '2026-02-24',
        '2026-02-25',
      ],
    );
    assert.equal(snapshots[0]?.reach, 19);
    assert.equal(snapshots[6]?.views, 250);
    assert.equal(snapshots[6]?.accountsEngaged, 50);
    assert.equal(snapshots[6]?.newFollowers, 24);
    assert.equal(snapshots[6]?.profileVisits24h, 30);
    assert.equal(warnings.length, 0);
    assert.equal(calls.length, 21);
    const uniqueSinceDays = Array.from(new Set(calls.map((entry) => entry.since)));
    assert.equal(uniqueSinceDays.length, 7);
    assert.deepEqual(calls[0], { since: '2026-02-19', until: '2026-02-20' });
    assert.deepEqual(calls[20], { since: '2026-02-25', until: '2026-02-26' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchInstagramAccountDailySnapshots skips failed days and adds warnings', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input) => {
    const url = new URL(String(input));
    const since = url.searchParams.get('since');

    if (since === '2026-02-22') {
      return new Response(JSON.stringify({ error: { message: 'Rate limit' } }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const day = Number.parseInt((since ?? '0').slice(-2), 10);
    const payload = {
      data: [
        { name: 'reach', total_value: { value: day } },
        { name: 'views', total_value: { value: day } },
        { name: 'accounts_engaged', total_value: { value: day } },
        { name: 'comments', total_value: { value: day } },
        { name: 'follower_count', total_value: { value: day } },
        { name: 'profile_views', total_value: { value: day } },
      ],
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const warnings: string[] = [];
    const snapshots = await fetchInstagramAccountDailySnapshots({
      accountId: 'ig-account-1',
      accessToken: 'token',
      until: '2026-02-25',
      warnings,
    });

    assert.equal(snapshots.length, 6);
    assert.equal(warnings.length, 3);
    assert.ok(warnings.every((warning) => /2026-02-22/.test(warning)));
    assert.ok(warnings.every((warning) => /Rate limit/.test(warning)));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
