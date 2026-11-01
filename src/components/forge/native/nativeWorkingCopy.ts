import type { TemplateOperationInput } from '@continuum/contracts';
import { createLayerHistory, endLayerHistoryGroup, isLayerHistoryDirty, markLayerHistorySaved, redoLayerHistory, undoLayerHistory, updateLayerHistory, type LayerHistory } from '../layerHistory';
import { TemplateOperationJournal, type ForgeDraftAction, type OperationJournalStorage } from '../templateOperationJournal';

export type NativeCopyIdentity = { userId: string; brandId: string; templateId: string; variantId: string;
  family: 'blender' | 'hyperframes'; baseRevisionId: string; sourceAssetId: string; sourceVersionId: string; sourceChecksum: string };
export type NativeSaveIntent<T> = { id: string; userId: string; assetId: string; body: Record<string, unknown>;
  snapshot: T; base: NativeCopyIdentity; throughSequence: number };
export type NativeCopyState<T> = { workingCopyId: string; base: NativeCopyIdentity; history: LayerHistory<T>;
  sequence: number; editIds: string[]; pending: NativeSaveIntent<T> | null };
type Options<T> = { identity: NativeCopyIdentity; initial: T; storage?: OperationJournalStorage;
  append: (events: TemplateOperationInput[]) => Promise<void>; onError?: (error: unknown) => void };

/** A format projection in the existing private journal; the Backend remains the commit authority. */
export class NativeWorkingCopy<T> {
  private readonly journal: TemplateOperationJournal;
  private readonly initial: NativeCopyState<T>;
  private constructor(private readonly options: Options<T>) {
    const base = options.identity;
    this.initial = { workingCopyId: crypto.randomUUID(), base: structuredClone(base), history: createLayerHistory(options.initial), sequence: 0, editIds: [], pending: null };
    this.journal = new TemplateOperationJournal({ userId: base.userId,
      scope: { brandId: base.brandId, assetId: base.templateId, baseVersionId: base.sourceVersionId },
      workspaceIdentity: `${base.family}:${base.variantId}`, sourceChecksum: base.sourceChecksum, baseRevisionId: base.baseRevisionId,
      storageKey: `native-editor:${base.userId}:${base.brandId}:${base.templateId}:${base.family}:${base.variantId}`,
      storage: options.storage, append: options.append, onError: options.onError });
  }
  static async open<T>(options: Options<T>) {
    const copy = new NativeWorkingCopy(options); await copy.read(true); return copy;
  }
  read(reconcileInitial = false) {
    return this.journal.changeProjection(this.initial, (state) => {
      const expected = this.options.identity;
      for (const key of ['userId', 'brandId', 'templateId', 'family', 'variantId'] as const)
        if (state.base[key] !== expected[key]) throw new Error('This private copy belongs to another account or branch.');
      if (reconcileInitial && !state.pending && !isLayerHistoryDirty(state.history) && state.base.baseRevisionId !== expected.baseRevisionId)
        state = { ...state, base: structuredClone(expected), history: createLayerHistory(this.options.initial) };
      return { projection: state };
    });
  }
  private transition(update: (state: NativeCopyState<T>, eventId: string) => { state: NativeCopyState<T>; action: ForgeDraftAction }) {
    return this.journal.changeProjection(this.initial, (current, coverage) => {
      const { state, action } = update(current, coverage.eventId); state.sequence = current.sequence + 1;
      return { projection: state, action: { ...action, changes: { ...action.changes, nativeWorkingCopyId: current.workingCopyId } },
        revision: state.sequence, context: { baseRevisionId: current.base.baseRevisionId,
          baseVersionId: current.base.sourceVersionId, sourceChecksum: current.base.sourceChecksum } };
    });
  }
  edit(value: T, action: Omit<ForgeDraftAction, 'changes'> & { changes?: Record<string, unknown> }, group: string | null = null) {
    return this.transition((current, eventId) => ({ state: { ...current, editIds: [...current.editIds, eventId].slice(-99), history: updateLayerHistory(current.history, value, group) },
      action: { ...action, changes: { ...action.changes, before: current.history.present, after: value } } }));
  }
  undo(origin: TemplateOperationInput['origin']) {
    return this.transition((current) => { const history = undoLayerHistory(current.history); return { state: { ...current, history },
      action: { command: 'forge_native_undo', origin, causedBy: current.editIds, changes: { before: current.history.present, after: history.present } } }; });
  }
  redo(origin: TemplateOperationInput['origin']) {
    return this.transition((current) => { const history = redoLayerHistory(current.history); return { state: { ...current, history },
      action: { command: 'forge_native_redo', origin, causedBy: current.editIds, changes: { before: current.history.present, after: history.present } } }; });
  }
  discard(origin: TemplateOperationInput['origin']) {
    return this.transition((current) => ({ state: { ...current, history: updateLayerHistory(current.history, current.history.baseline) },
      action: { command: 'forge_native_discard', origin, causedBy: current.editIds, changes: { before: current.history.present, after: current.history.baseline } } }));
  }
  dismissSave(origin: TemplateOperationInput['origin']) {
    return this.transition(current => ({ state: { ...current, pending: null }, action: {
      command: 'forge_native_save', outcome: 'cancelled', origin,
      changes: { retainedIntent: current.pending, note: 'Retry stopped. Refresh the branch to determine any uncertain remote outcome.' },
    } }));
  }
  hydrate(transform: (snapshot: T) => T) {
    return this.journal.changeProjection(this.initial, state => ({ projection: state.pending ? state : { ...state,
      history: { ...state.history, present: transform(state.history.present), baseline: transform(state.history.baseline),
        past: state.history.past.map(transform), future: state.history.future.map(transform) } } }));
  }
  flush() { return this.journal.flush(); }
  park() { return this.journal.preserveLocal(); }
  async save(build: (base: NativeCopyIdentity, snapshot: T, id: string) => Record<string, unknown>,
    send: (intent: NativeSaveIntent<T>) => Promise<NativeCopyIdentity>, currentPrincipal: () => Promise<string>,
    origin: TemplateOperationInput['origin'] = { tool: 'Forge native editor', button: 'Save revision' }) {
    await this.journal.preserveLocal();
    if (await currentPrincipal() !== this.options.identity.userId)
      throw new Error('This save belongs to another signed-in account. Its private copy is preserved.');
    const captured = await this.journal.changeProjection(this.initial, (state, coverage) => {
      if (state.pending) return { projection: state };
      const id = crypto.randomUUID();
      const intent: NativeSaveIntent<T> = { id, userId: state.base.userId, assetId: state.base.templateId,
        base: structuredClone(state.base), snapshot: structuredClone(state.history.present), throughSequence: coverage.throughSequence,
        body: { ...build(state.base, structuredClone(state.history.present), id), ...(coverage.throughSequence > 0 ? { operationCoverage: { workingCopyId: coverage.workingCopyId, throughSequence: coverage.throughSequence } } : {}) } };
      return { projection: { ...state, history: endLayerHistoryGroup(state.history), pending: intent, sequence: state.sequence + 1 },
        action: { command: 'forge_native_save', outcome: 'requested' as const, origin,
          changes: { intentId: id, body: intent.body, nativeWorkingCopyId: state.workingCopyId, throughSequence: coverage.throughSequence } },
        context: { baseRevisionId: state.base.baseRevisionId, baseVersionId: state.base.sourceVersionId, sourceChecksum: state.base.sourceChecksum } };
    });
    const intent = captured.pending;
    if (!intent || intent.userId !== this.options.identity.userId) throw new Error('The retained save belongs to another account.');
    await this.journal.flush();
    if (await currentPrincipal() !== intent.userId) throw new Error('Switch back to the account that owns this retained save.');
    // The sender must bind this principal to the token captured by its HTTP helper.
    const accepted = await send(structuredClone(intent));
    if (accepted.userId !== intent.userId || accepted.brandId !== intent.base.brandId || accepted.templateId !== intent.base.templateId)
      throw new Error('The server accepted a different native template identity. The save intent is preserved.');
    const state = await this.transition((current) => {
      if (current.pending?.id !== intent.id) throw new Error('A different save owns this acknowledgement.');
      const sameBranch = accepted.variantId === current.base.variantId;
      return { state: { ...current, pending: null, ...(sameBranch ? { base: accepted, history: markLayerHistorySaved(current.history, intent.snapshot) } : {}) },
        action: { command: 'forge_native_save', outcome: 'succeeded', origin,
          changes: { intentId: intent.id, revisionId: accepted.baseRevisionId, nativeWorkingCopyId: current.workingCopyId,
            throughSequence: intent.throughSequence, savedToAnotherBranch: !sameBranch } } };
    });
    return { state, accepted };
  }
}
