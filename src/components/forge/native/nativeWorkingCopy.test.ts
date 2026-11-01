import { expect, test } from 'bun:test';
import type { TemplateOperationInput } from '@continuum/contracts';
import type { OperationJournalState, OperationJournalStorage } from '../templateOperationJournal';
import { NativeWorkingCopy, type NativeCopyIdentity } from './nativeWorkingCopy';

const identity: NativeCopyIdentity = { userId: 'owner-a', brandId: 'brand-a', templateId: 'template-a',
  family: 'hyperframes', variantId: 'branch-a', baseRevisionId: 'revision-a', sourceAssetId: 'source-a',
  sourceVersionId: 'version-a', sourceChecksum: 'a'.repeat(64) };
function harness() {
  const records = new Map<string, OperationJournalState>();
  const events: TemplateOperationInput[] = [];
  let rejectAcknowledgement = false;
  let rejectEdit = false;
  const storage: OperationJournalStorage = { async change(key, update) {
    const row = structuredClone(records.get(key) ?? { workingCopyId: crypto.randomUUID(), sequence: 0, events: [], acknowledged: [], outbox: null });
    const result = update(row);
    if (rejectEdit && row.events.at(-1)?.command === 'forge_native_edit') { rejectEdit = false; throw new Error('Private edit interrupted'); }
    if (rejectAcknowledgement && row.events.at(-1)?.command === 'forge_native_save' && row.events.at(-1)?.outcome === 'succeeded') { rejectAcknowledgement = false; throw new Error('Atomic acknowledgement interrupted'); }
    records.set(key, row); return structuredClone(result);
  } };
  const open = (variantId = 'branch-a', baseRevisionId = 'revision-a') => NativeWorkingCopy.open({
    identity: { ...identity, variantId, baseRevisionId }, initial: { width: 32, height: 24 }, storage,
    append: async (batch) => { for (const event of batch) if (!events.some(value => value.id === event.id)) events.push(event); },
  });
  return { open, events, records, rejectNextEdit: () => { rejectEdit = true; }, rejectNextAcknowledgement: () => { rejectAcknowledgement = true; } };
}
const change = { command: 'forge_native_edit', origin: { tool: 'Forge native inspector', control: 'Width' } };
const request = (base: NativeCopyIdentity, value: { width: number; height: number }, key: string) => ({
  brandId: base.brandId, parentRevisionId: base.baseRevisionId, variantId: base.variantId,
  expectedHeadRevisionId: base.baseRevisionId, idempotencyKey: key, edits: value,
});
const accepted = { ...identity, baseRevisionId: 'revision-saved', sourceVersionId: 'version-saved' };

test('native dirty branches and undo state survive reopening with exact captured base', async () => {
  const h = harness(); const a = await h.open();
  await a.edit({ width: 41, height: 24 }, change, 'width');
  await a.edit({ width: 42, height: 24 }, change, 'width');
  const b = await h.open('branch-b', 'revision-b');
  expect((await b.read()).history.present.width).toBe(32);
  await b.edit({ width: 57, height: 24 }, change, 'width');
  const restarted = await h.open('branch-a', 'new-remote-head');
  expect((await restarted.read()).base.baseRevisionId).toBe('revision-a');
  expect((await restarted.read()).history.present.width).toBe(42);
  await restarted.undo({ button: 'Undo native change' });
  expect((await restarted.read()).history.present.width).toBe(32);
  await restarted.redo({ button: 'Redo native change' });
  expect((await restarted.read()).history.present.width).toBe(42);
  await restarted.flush();
  const edits = h.events.filter(event => event.command === 'forge_native_edit');
  expect(edits).toHaveLength(3);
  expect(h.events.every(event => event.baseRevisionId === 'revision-a' || event.baseRevisionId === 'revision-b')).toBe(true);
});

test('uncertain native save retries identical routing and intent after restart, preserving later edits on acknowledgement', async () => {
  const h = harness(); const a = await h.open(); await a.edit({ width: 40, height: 24 }, change);
  const sent: object[] = [];
  await expect(a.save(request, async (intent) => { sent.push(intent); throw new Error('reply lost'); }, async () => identity.userId)).rejects.toThrow('reply lost');
  const frozen = (await a.read()).pending; expect(frozen).not.toBeNull();
  await a.edit({ width: 48, height: 24 }, change);
  const restarted = await h.open();
  await restarted.save(() => { throw new Error('Retry must use the frozen request'); }, async (intent) => { sent.push(intent); return accepted; }, async () => identity.userId);
  expect(sent[1]).toEqual(sent[0]);
  const final = await restarted.read();
  expect(final.pending).toBeNull(); expect(final.base.baseRevisionId).toBe('revision-saved');
  expect(final.history.baseline.width).toBe(40); expect(final.history.present.width).toBe(48);
  expect(final.history.past).toEqual([{ width: 40, height: 24 }]);
});

test('native save refuses a different signed-in account and pins the principal passed to the sender', async () => {
  const h = harness(); const a = await h.open(); await a.edit({ width: 40, height: 24 }, change);
  let sends = 0;
  await expect(a.save(request, async () => { sends++; return accepted; }, async () => 'other-owner')).rejects.toThrow(/account/);
  expect(sends).toBe(0);
  await a.save(request, async (intent) => { expect(intent.userId).toBe(identity.userId); sends++; return accepted; }, async () => identity.userId);
  expect(sends).toBe(1);
});

test('discard retains permanent edits and adds a separate causally ordered event', async () => {
  const h = harness(); const a = await h.open(); await a.edit({ width: 40, height: 24 }, change);
  await a.discard({ button: 'Discard changes' }); await a.flush();
  expect((await a.read()).history.present.width).toBe(32);
  expect(h.events.map(event => event.command)).toEqual(['forge_native_edit', 'forge_native_discard']);
  expect(h.events[1]!.causedBy).toContain(h.events[0]!.id);
  expect(h.events[1]!.origin?.button).toBe('Discard changes');
});

test('save capture ends the same-field group; in-flight and acknowledged undo reach the frozen accepted value', async () => {
  const h = harness(); const a = await h.open();
  await a.edit({ width: 40, height: 24 }, change, 'width');
  let release!: (value: NativeCopyIdentity) => void;
  const pending = new Promise<NativeCopyIdentity>(resolve => { release = resolve; });
  let sent!: object;
  const saving = a.save(request, async intent => { sent = structuredClone(intent); return pending; }, async () => identity.userId);
  for (let step = 0; step < 100 && !sent; step++) await new Promise(resolve => setTimeout(resolve, 0));
  expect(sent).toBeDefined();
  await a.edit({ width: 48, height: 24 }, change, 'width');
  await a.undo({ button: 'Undo native change' }); expect((await a.read()).history.present.width).toBe(40);
  await a.redo({ button: 'Redo native change' });
  expect((await a.read()).pending).toEqual(sent);
  release(accepted); await saving;
  await a.undo({ button: 'Undo native change' }); expect((await a.read()).history.present.width).toBe(40);
  await a.flush();
  const originalEdit = h.events.find(event => event.command === 'forge_native_edit');
  expect(h.events.filter(event => event.command === 'forge_native_undo').at(-1)!.causedBy).toContain(originalEdit!.id);
});


test('a failed local acknowledgement transaction keeps frozen intent and later edits for exact restart replay', async () => {
  const h = harness(); const a = await h.open(); await a.edit({ width: 40, height: 24 }, change);
  h.rejectNextAcknowledgement();
  let sent!: object;
  await expect(a.save(request, async intent => { sent = structuredClone(intent); await a.edit({ width: 48, height: 24 }, change); return accepted; },
    async () => identity.userId)).rejects.toThrow('Atomic acknowledgement interrupted');
  const retained = await a.read(); expect(retained.pending).toEqual(sent); expect(retained.base.baseRevisionId).toBe('revision-a');
  const restarted = await h.open();
  await restarted.save(() => { throw new Error('Do not rebuild an uncertain intent'); }, async intent => { expect(intent).toEqual(sent); return accepted; }, async () => identity.userId);
  const landed = await restarted.read(); expect(landed.pending).toBeNull(); expect(landed.base.baseRevisionId).toBe('revision-saved');
  expect(landed.history.baseline.width).toBe(40); expect(landed.history.present.width).toBe(48);
});


test('a failed native edit refuses parking and can retry its exact visible snapshot', async () => {
  const h = harness(); const copy = await h.open(); h.rejectNextEdit();
  await expect(copy.edit({ width: 40, height: 24 }, change)).rejects.toThrow('Private edit interrupted');
  await expect(copy.park()).rejects.toThrow('Private edit interrupted');
  await copy.edit({ width: 40, height: 24 }, change); await copy.flush(); await copy.park();
  expect((await copy.read()).history.present.width).toBe(40);
});
