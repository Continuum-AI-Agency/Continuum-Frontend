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


test('another tab cannot capture a new save after the shared copy was acknowledged clean', async () => {
  const h = harness(); const a = await h.open(); const b = await h.open();
  await a.edit({ width: 40, height: 24 }, change);
  await a.save(request, async () => accepted, async () => identity.userId);
  let sends = 0;
  await expect(b.save(request, async () => { sends++; return accepted; }, async () => identity.userId))
    .rejects.toThrow(/unsaved/);
  expect(sends).toBe(0); expect((await b.read()).pending).toBeNull();
});

test('duplicate native acknowledgements preserve later edits and a newer pending intent across tabs', async () => {
  const h = harness(); const a = await h.open(); const b = await h.open();
  await a.edit({ width: 40, height: 24 }, change);
  let sentA!: object; let sentB!: object;
  let resolveA!: (value: NativeCopyIdentity) => void; let resolveB!: (value: NativeCopyIdentity) => void;
  const pa = new Promise<NativeCopyIdentity>(resolve => { resolveA = resolve; });
  const pb = new Promise<NativeCopyIdentity>(resolve => { resolveB = resolve; });
  const first = a.save(request, async intent => { sentA = intent; return pa; }, async () => identity.userId);
  for (let i = 0; i < 100 && !sentA; i++) await new Promise(resolve => setTimeout(resolve, 0));
  const duplicate = b.save(request, async intent => { sentB = intent; return pb; }, async () => identity.userId);
  for (let i = 0; i < 100 && !sentB; i++) await new Promise(resolve => setTimeout(resolve, 0));
  expect(sentA).toEqual(sentB); resolveA(accepted); await first;
  await a.edit({ width: 48, height: 24 }, change);
  let newerIntent!: object; let resolveNew!: (value: NativeCopyIdentity) => void;
  const pn = new Promise<NativeCopyIdentity>(resolve => { resolveNew = resolve; });
  const newer = a.save(request, async intent => { newerIntent = intent; return pn; }, async () => identity.userId);
  for (let i = 0; i < 100 && !newerIntent; i++) await new Promise(resolve => setTimeout(resolve, 0));
  resolveB(accepted); await duplicate;
  expect((await b.read()).pending).toEqual(newerIntent);
  expect((await b.read()).history.present.width).toBe(48);
  resolveNew({ ...accepted, baseRevisionId: 'revision-newer' }); await newer;
  expect((await b.read()).history.baseline.width).toBe(48);
  await b.flush();
  expect(h.events.filter(event => event.command === 'forge_native_save' && event.outcome === 'succeeded')).toHaveLength(2);
});

test('an accepted native receipt is frozen before acknowledgement and cannot alias its sender', async () => {
  const h = harness(); const copy = await h.open(); await copy.edit({ width: 40, height: 24 }, change);
  const receipt = structuredClone(accepted);
  const result = await copy.save(request, async () => receipt, async () => identity.userId);
  receipt.userId = 'different-owner'; receipt.baseRevisionId = 'mutated-after-return';
  expect(result.accepted.userId).toBe(identity.userId);
  expect(result.accepted.baseRevisionId).toBe('revision-saved');
  expect((await copy.read()).base.baseRevisionId).toBe('revision-saved');
});

test('an old identical acknowledgement cannot rewind a newer accepted base', async () => {
  const h = harness(); const a = await h.open(); const b = await h.open(); await a.edit({ width: 40, height: 24 }, change);
  let sent = false; let resume!: (value: NativeCopyIdentity) => void;
  const waiting = new Promise<NativeCopyIdentity>(resolve => { resume = resolve; });
  let firstResume!: (value: NativeCopyIdentity) => void;
  const firstWait = new Promise<NativeCopyIdentity>(resolve => { firstResume = resolve; });
  const first = a.save(request, async () => { sent = true; return firstWait; }, async () => identity.userId);
  for (let i = 0; i < 100 && !sent; i++) await new Promise(resolve => setTimeout(resolve, 0));
  let duplicateSent = false;
  const duplicate = b.save(request, async () => { duplicateSent = true; return waiting; }, async () => identity.userId);
  for (let i = 0; i < 100 && !duplicateSent; i++) await new Promise(resolve => setTimeout(resolve, 0));
  firstResume(accepted); await first; await a.edit({ width: 48, height: 24 }, change);
  await a.save(request, async () => ({ ...accepted, baseRevisionId: 'revision-newer' }), async () => identity.userId);
  resume(accepted); await duplicate;
  expect((await b.read()).base.baseRevisionId).toBe('revision-newer');
  expect((await b.read()).history.baseline.width).toBe(48);
});

test('explicit native save-as-variant retains its original private branch projection', async () => {
  const h = harness(); const copy = await h.open(); await copy.edit({ width: 40, height: 24 }, change);
  const result = await copy.save((base, value, key) => ({ ...request(base, value, key), variantId: undefined, name: 'Explicit new variant', expectedHeadRevisionId: null }),
    async () => ({ ...accepted, variantId: 'explicit-new-branch' }), async () => identity.userId);
  expect(result.accepted.variantId).toBe('explicit-new-branch');
  expect(result.state.base.variantId).toBe('branch-a'); expect(result.state.pending).toBeNull();
  expect(result.state.history.present.width).toBe(40); expect(result.state.history.baseline.width).toBe(32);
});

test('a contradictory duplicate receipt is refused without changing acknowledged work', async () => {
  const h = harness(); const a = await h.open(); const b = await h.open();
  await a.edit({ width: 40, height: 24 }, change);
  let firstSent = false; let duplicateSent = false;
  let resumeFirst!: (value: NativeCopyIdentity) => void; let resumeDuplicate!: (value: NativeCopyIdentity) => void;
  const firstReceipt = new Promise<NativeCopyIdentity>(resolve => { resumeFirst = resolve; });
  const duplicateReceipt = new Promise<NativeCopyIdentity>(resolve => { resumeDuplicate = resolve; });
  const first = a.save(request, async () => { firstSent = true; return firstReceipt; }, async () => identity.userId);
  for (let i = 0; i < 100 && !firstSent; i++) await new Promise(resolve => setTimeout(resolve, 0));
  const duplicate = b.save(request, async () => { duplicateSent = true; return duplicateReceipt; }, async () => identity.userId)
    .catch(error => error as Error);
  for (let i = 0; i < 100 && !duplicateSent; i++) await new Promise(resolve => setTimeout(resolve, 0));
  expect(firstSent && duplicateSent).toBe(true);
  resumeFirst(accepted); await first; await a.edit({ width: 48, height: 24 }, change);
  const before = await a.read();
  resumeDuplicate({ ...accepted, baseRevisionId: 'contradictory-revision' });
  const refusal = await duplicate; expect(refusal).toBeInstanceOf(Error);
  expect((refusal as Error).message).toContain('changed an acknowledged native save identity');
  expect(await b.read()).toEqual(before); await b.flush();
  expect(h.events.filter(event => event.command === 'forge_native_save' && event.outcome === 'succeeded')).toHaveLength(1);
});
