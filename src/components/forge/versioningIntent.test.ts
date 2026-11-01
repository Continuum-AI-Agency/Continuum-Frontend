import { expect, test } from 'bun:test';
import {
  VersioningIntentJournal,
  type VersioningIntentRecord,
  type VersioningIntentStorage,
} from './versioningIntent';

function storage() {
  const rows = new Map<string, VersioningIntentRecord>();
  const store: VersioningIntentStorage = {
    async change(key, update) {
      const next = structuredClone(rows.get(key) ?? { attempts: [] });
      const result = update(next);
      rows.set(key, next);
      return result;
    },
  };
  return { store, rows };
}
test('reload retains exact routing and intent; another action cannot replace an uncertain save', async () => {
  const { store } = storage();
  const journal = new VersioningIntentJournal('actor', 'brand', 'family', store);
  const body = { parentRevisionId: 'base', name: 'Tall' };
  const captured = await journal.capture('asset-a', 'branch', body);
  body.name = 'Changed';
  const restarted = new VersioningIntentJournal('actor', 'brand', 'family', store);
  expect(await restarted.pending()).toEqual(captured);
  expect(captured.body.name).toBe('Tall');
  await expect(restarted.capture('asset-b', 'merge', {})).rejects.toThrow('pending');
  expect((await restarted.pending())?.assetId).toBe('asset-a');
  await restarted.finish(captured.id, 'acknowledged');
  expect(await restarted.pending()).toBeNull();
  expect((await restarted.capture('asset-b', 'branch', body)).id).not.toBe(captured.id);
});
test('accounts, brands and families cannot claim another pending intent; dismissal retains evidence', async () => {
  const { store, rows } = storage();
  const journal = new VersioningIntentJournal('actor', 'brand', 'family', store);
  const intent = await journal.capture('asset', 'release', { revisionId: 'r1' });
  for (const [user, brand, family] of [
    ['other', 'brand', 'family'],
    ['actor', 'other', 'family'],
    ['actor', 'brand', 'other'],
  ])
    expect(await new VersioningIntentJournal(user!, brand!, family!, store).pending()).toBeNull();
  await journal.finish(intent.id, 'dismissed');
  expect(rows.get(journal.key)?.attempts).toMatchObject([
    { id: intent.id, state: 'dismissed', body: { revisionId: 'r1' } },
  ]);
  await expect(journal.finish(intent.id, 'acknowledged')).rejects.toThrow('changed');
});
test('a failed durable capture cannot expose a sendable intent', async () => {
  const journal = new VersioningIntentJournal('actor', 'brand', 'family', {
    async change() {
      throw new Error('disk full');
    },
  });
  await expect(journal.capture('asset', 'merge', {})).rejects.toThrow('disk full');
});


test('duplicate acknowledgement from another tab is idempotent and cannot finish a newer intent', async () => {
  const { store, rows } = storage();
  const first = new VersioningIntentJournal('actor', 'brand', 'family', store);
  const second = new VersioningIntentJournal('actor', 'brand', 'family', store);
  const old = await first.capture('asset', 'branch', { name: 'one' });
  await first.finish(old.id, 'acknowledged');
  const newer = await first.capture('asset', 'merge', { message: 'two' });
  await second.finish(old.id, 'acknowledged');
  expect(await second.pending()).toEqual(newer);
  expect(rows.get(first.key)?.attempts.filter(attempt => attempt.id === old.id)).toHaveLength(1);
  await expect(second.finish(old.id, 'dismissed')).rejects.toThrow('changed');
});

test('capture freezes caller input before the asynchronous IndexedDB read can run', async () => {
  const { store } = storage();
  let resume!: () => void;
  const gate = new Promise<void>(resolve => { resume = resolve; });
  const journal = new VersioningIntentJournal('actor', 'brand', 'family', {
    async change(key, update) { await gate; return store.change(key, update); },
  });
  const body = { name: 'reviewed', resolutions: [{ path: '/width', choice: 'ours' }] };
  const capture = journal.capture('asset', 'merge', body);
  body.name = 'edited later'; body.resolutions[0]!.choice = 'theirs'; resume();
  const frozen = await capture;
  expect(frozen.body).toEqual({ name: 'reviewed', resolutions: [{ path: '/width', choice: 'ours' }] });
});
