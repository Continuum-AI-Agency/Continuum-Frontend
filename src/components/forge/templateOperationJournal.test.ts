import { expect, test } from 'bun:test';
import type { TemplateAuthoringCommand, TemplateAuthoringDraftPut, TemplateOperationInput } from '@continuum/contracts';
import { appendLayerDraftCommand } from './layerDraft';
import { TemplateOperationJournal, type OperationJournalState, type OperationJournalStorage } from './templateOperationJournal';

const scope = {
  brandId: '00000000-0000-4000-8000-000000000001', assetId: '00000000-0000-4000-8000-000000000002',
  baseVersionId: '00000000-0000-4000-8000-000000000003',
};
const command = (rotation: number): TemplateAuthoringCommand => ({
  type: 'layer.edit', nodeId: 'aep:1:2', edit: { compId: 1, layerId: 2, rotation },
});
class MemoryStorage implements OperationJournalStorage {
  readonly states = new Map<string, OperationJournalState>();
  failAcknowledgement = false;
  async change<T>(key: string, update: (state: OperationJournalState) => T): Promise<T> {
    const state = structuredClone(this.states.get(key) ?? {
      workingCopyId: crypto.randomUUID(), sequence: 0, events: [], acknowledged: [], outbox: null,
    });
    const result = update(state);
    if (this.failAcknowledgement && state.acknowledged.length) {
      this.failAcknowledgement = false;
      throw new Error('Injected crash before acknowledgement commit');
    }
    this.states.set(key, state);
    return structuredClone(result);
  }
  get state() { return [...this.states.values()][0]!; }
}
function journal(storage: MemoryStorage, append: (events: TemplateOperationInput[]) => Promise<void>) {
  return new TemplateOperationJournal({ userId: 'authenticated-browser-account', scope, storage,
    workspaceIdentity: 'pinned-source', sourceChecksum: 'a'.repeat(64), append });
}
async function until(predicate: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 1));
  }
  throw new Error('Expected operation boundary was not reached');
}

test('two actual commands remain ordered even when the existing draft projection coalesces them', async () => {
  const storage = new MemoryStorage();
  const accepted = new Map<string, TemplateOperationInput>();
  const history = journal(storage, async events => { for (const event of events) accepted.set(event.id, event); });
  let snapshot = { edits: {}, orders: {}, nodeOrders: {}, exposures: {}, operations: [] as TemplateAuthoringCommand[] };
  for (const rotation of [10, 20]) {
    const raw = command(rotation);
    history.capture({ command: 'forge_authoring_command', changes: { command: raw } }, 3);
    snapshot = appendLayerDraftCommand(snapshot, raw);
  }
  await history.flush();
  expect(snapshot.operations).toHaveLength(1);
  expect([...accepted.values()].map(event => event.changes.command)).toEqual([command(10), command(20)]);
  expect(storage.state.events.map(event => event.sequence)).toEqual([1, 2]);
  expect(storage.state.events[1]!.causedBy).toContain(storage.state.events[0]!.id);
  expect(storage.state.events[0]!.baseRevisionId).toBeNull();
  expect(storage.state.events[0]!.changes).toMatchObject({ baseVersionId: scope.baseVersionId, draftRevision: 3 });
  expect('principalId' in storage.state.events[0]!).toBe(false);
});

test('same-byte branches isolate durable streams and bind each action to its captured authoring base', async () => {
  const storage = new MemoryStorage();
  const sent: TemplateOperationInput[] = [];
  const make = (workingCopyId: string, baseRevisionId?: string) => new TemplateOperationJournal({ userId: 'actor',
    scope: { ...scope, workingCopyId }, baseRevisionId, sourceChecksum: 'a'.repeat(64), workspaceIdentity: 'identical-package', storage,
    append: async (events) => { sent.push(...events); } });
  const a = make('50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001');
  const b = make('50000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002');
  a.capture({ command: 'forge_authoring_command', changes: { command: command(10) } }, 1);
  b.capture({ command: 'forge_authoring_command', changes: { command: command(20) } }, 1);
  await Promise.all([a.flush(), b.flush()]);
  expect(storage.states.size).toBe(2);
  expect(new Set(sent.map(event => event.workingCopyId)).size).toBe(2);
  expect(sent.map(event => event.baseRevisionId).sort()).toEqual(['60000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000002']);
  expect(sent.every(event => event.changes.authoringWorkingCopyId && event.changes.baseVersionId === scope.baseVersionId)).toBe(true);
  expect(() => make('50000000-0000-4000-8000-000000000003').capture({ command: 'forge_clear', changes: {} }, 1)).toThrow('exact working-copy base');
});

test('edits arriving during a failed send persist immediately and retry the frozen batch unchanged', async () => {
  const storage = new MemoryStorage();
  const attempts: TemplateOperationInput[][] = [];
  let rejectFirst!: (error: Error) => void;
  const blocked = new Promise<void>((_resolve, reject) => { rejectFirst = reject; });
  const history = journal(storage, async events => {
    attempts.push(structuredClone(events));
    if (attempts.length === 1) await blocked;
  });
  history.capture({ command: 'forge_authoring_command', changes: { command: command(10) } }, 1);
  await until(() => attempts.length === 1);
  history.capture({ command: 'forge_authoring_command', changes: { command: command(20) } }, 1);
  await until(() => storage.state.events.length === 2);
  const pending = history.flush();
  rejectFirst(new Error('Lost response'));
  await expect(pending).rejects.toThrow('Lost response');
  await history.flush();
  expect(attempts[1]).toEqual(attempts[0]);
  expect(attempts[2]!.map(event => event.sequence)).toEqual([2]);
  expect(storage.state.acknowledged).toHaveLength(2);
  expect(storage.state.events).toHaveLength(2);
});

test('restart after remote acceptance and local acknowledgement failure replays identical event identities', async () => {
  const storage = new MemoryStorage();
  const attempts: TemplateOperationInput[][] = [];
  const append = async (events: TemplateOperationInput[]) => { attempts.push(structuredClone(events)); };
  const first = journal(storage, append);
  storage.failAcknowledgement = true;
  first.capture({ command: 'forge_clear', changes: { before: [command(10)], after: [] } }, 1);
  await expect(first.flush()).rejects.toThrow('Injected crash');
  await journal(storage, append).flush();
  expect(attempts[1]).toEqual(attempts[0]);
  expect(storage.state.events).toHaveLength(1);
  expect(storage.state.acknowledged).toEqual([storage.state.events[0]!.id]);
});

test('undo, redo and clear preserve references to their raw actions after acknowledgements', async () => {
  const storage = new MemoryStorage();
  const history = journal(storage, async () => undefined);
  const original = history.capture({ command: 'forge_authoring_command', changes: { command: command(10) } }, 1);
  const undo = history.capture({ command: 'forge_undo', changes: { before: [command(10)], after: [] }, causedBy: [original], origin: { shortcut: 'Control+Z' } }, 1);
  history.capture({ command: 'forge_redo', changes: { after: [command(10)] }, causedBy: [original, undo] }, 1);
  history.capture({ command: 'forge_clear', changes: { after: [] }, origin: { button: 'Reset edits' } }, 1);
  await history.flush();
  expect(storage.state.events.map(event => event.command)).toEqual(['forge_authoring_command', 'forge_undo', 'forge_redo', 'forge_clear']);
  expect(storage.state.events[1]!.causedBy).toContain(original);
  expect(storage.state.events[2]!.causedBy).toContain(undo);
  expect(storage.state.events[1]!.origin?.shortcut).toBe('Control+Z');
  expect(storage.state.events.every(event => !('occurredAt' in event))).toBe(true);
});

test('ambiguous draft writes retain their exact request ID and body before newer snapshots can land', async () => {
  const storage = new MemoryStorage();
  const history = journal(storage, async () => undefined);
  const first: TemplateAuthoringDraftPut = { brandId: scope.brandId, baseVersionId: scope.baseVersionId, expectedRevision: 1, commands: [command(10)] };
  const attempts: TemplateAuthoringDraftPut[] = [];
  const write = async (request: TemplateAuthoringDraftPut) => {
    attempts.push(structuredClone(request));
    if (attempts.length === 1) throw new Error('Lost draft acknowledgement');
    return { revision: 2 };
  };
  await expect(history.writeDraft(first, write)).rejects.toThrow('Lost draft acknowledgement');
  const changed = { ...first, commands: [command(20)] };
  const replay = await journal(storage, async () => undefined).writeDraft(changed, write);
  expect(attempts[1]).toEqual(attempts[0]);
  expect(attempts[0]!.requestId).toBeTruthy();
  expect(replay.matched).toBe(false);
  expect(storage.state.draftIntent).toBeUndefined();
});

test('restart resumes an uncertain draft without requiring another edit, retaining failures until exact acknowledgement', async () => {
  const storage = new MemoryStorage();
  const first = journal(storage, async () => undefined);
  const request: TemplateAuthoringDraftPut = { brandId: scope.brandId, baseVersionId: scope.baseVersionId,
    expectedRevision: 1, commands: [command(10)] };
  await expect(first.writeDraft(request, async () => { throw new Error('Lost acknowledgement'); })).rejects.toThrow();
  const frozen = structuredClone(storage.state.draftIntent);
  const restarted = journal(storage, async () => undefined);
  await expect(restarted.resumeDraft(async (intent) => {
    expect(intent).toEqual(frozen);
    throw new Error('Still offline');
  })).rejects.toThrow('Still offline');
  expect(storage.state.draftIntent).toEqual(frozen);
  expect(await restarted.resumeDraft(async (intent) => {
    expect(intent).toEqual(frozen);
    return { revision: 2 };
  })).toEqual({ revision: 2 });
  expect(storage.state.draftIntent).toBeUndefined();
  expect(await restarted.resumeDraft(async () => { throw new Error('No pending write'); })).toBeNull();
});
