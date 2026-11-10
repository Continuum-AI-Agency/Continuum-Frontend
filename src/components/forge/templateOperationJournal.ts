import type { TemplateAuthoringDraftPut, TemplateAuthoringScope, TemplateOperationInput } from '@continuum/contracts';
import { openTemplateDraftDb } from './templateDraftRecovery';

export type ForgeDraftAction = {
  command: string;
  changes: Record<string, unknown>;
  affectedObjects?: string[];
  causedBy?: string[];
  origin?: TemplateOperationInput['origin'];
  outcome?: TemplateOperationInput['outcome'];
  evidence?: TemplateOperationInput['evidence'];
};

export type OperationJournalState = {
  workingCopyId: string;
  sequence: number;
  events: TemplateOperationInput[];
  acknowledged: string[];
  outbox: TemplateOperationInput[] | null;
  draftIntent?: TemplateAuthoringDraftPut;
  projection?: unknown;
};

export type OperationJournalStorage = {
  change<T>(key: string, update: (state: OperationJournalState) => T): Promise<T>;
};

const initial = (): OperationJournalState => ({
  workingCopyId: crypto.randomUUID(), sequence: 0, events: [], acknowledged: [], outbox: null,
});

/** Reuse the private draft database without changing its version or removing saved evidence. */
export const indexedDbOperationJournal: OperationJournalStorage = {
  async change<T>(key: string, update: (state: OperationJournalState) => T): Promise<T> {
    const db = await openTemplateDraftDb();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      const store = tx.objectStore('drafts');
      const request = store.get(key);
      let result: T;
      let failure: unknown;
      request.onsuccess = () => {
        try {
          const state = (request.result as OperationJournalState | undefined) ?? initial();
          result = update(state);
          store.put(state, key);
        } catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onerror = tx.onabort = () => {
        db.close();
        reject(failure ?? tx.error ?? new Error('Forge operation history could not be preserved.'));
      };
    });
  },
};

export type OperationContext = { baseRevisionId: string; baseVersionId: string; sourceChecksum: string };
type Captured = { id: string; action: ForgeDraftAction; draftRevision: number; context?: OperationContext };

/** Capture precedes projection; UI stays optimistic until IndexedDB commits. Autosave awaits durable history. */
export class TemplateOperationJournal {
  private readonly key: string;
  private pending: Captured[] = [];
  private writes: Promise<void> = Promise.resolve();
  private sending: Promise<void> | null = null;
  private projections: Promise<void> = Promise.resolve();
  private projectionFailure: unknown;

  constructor(private readonly options: {
    userId: string;
    storageKey?: string;
    scope: TemplateAuthoringScope;
    workspaceIdentity: string;
    sourceChecksum: string;
    baseRevisionId?: string;
    storage?: OperationJournalStorage;
    append: (events: TemplateOperationInput[]) => Promise<void>;
    onError?: (error: unknown) => void;
    onSaved?: () => void;
  }) {
    this.key = options.storageKey ?? `operation-history:${options.userId}:${options.scope.brandId}:${options.scope.assetId}:${options.scope.baseVersionId}:${options.workspaceIdentity}${options.scope.workingCopyId ? `:working-copy:${options.scope.workingCopyId}` : ''}`;
  }

  get busy(): boolean { return this.pending.length > 0 || this.sending !== null; }

  capture(action: ForgeDraftAction, draftRevision: number): string {
    if (this.options.scope.workingCopyId && !this.options.baseRevisionId)
      throw new Error('The exact working-copy base must be opened before recording an edit.');
    const id = crypto.randomUUID();
    this.pending.push({ id, action: structuredClone(action), draftRevision });
    void this.preserve().then(() => this.flush()).then(() => this.options.onSaved?.(), (error: unknown) => this.options.onError?.(error));
    return id;
  }

  private appendCaptured(state: OperationJournalState, captured: Captured) {
          if (state.events.some((event) => event.id === captured.id)) return;
          const { action } = captured;
          const prior = state.events.at(-1)?.id;
          const causedBy = [...new Set([...(action.causedBy ?? []), ...(prior ? [prior] : [])])].slice(-100);
          state.events.push({
            id: captured.id, workingCopyId: state.workingCopyId, sequence: ++state.sequence,
            command: action.command, baseRevisionId: captured.context?.baseRevisionId ?? this.options.baseRevisionId ?? null, channel: 'forge', outcome: action.outcome ?? 'succeeded',
            affectedObjects: action.affectedObjects ?? [], causedBy, evidence: action.evidence ?? 'recorded',
            changes: { ...action.changes, baseVersionId: captured.context?.baseVersionId ?? this.options.scope.baseVersionId,
              ...(this.options.scope.workingCopyId ? { authoringWorkingCopyId: this.options.scope.workingCopyId } : {}),
              draftRevision: captured.draftRevision, sourceChecksum: captured.context?.sourceChecksum ?? this.options.sourceChecksum,
              workspaceIdentity: this.options.workspaceIdentity },
            ...(action.origin ? { origin: action.origin } : {}),
          });
  }

  /** Native inspectors reuse the journal transaction: evidence and its undo projection land together. */
  changeProjection<T>(initial: T, change: (projection: T, coverage: { workingCopyId: string; throughSequence: number; eventId: string }) => {
    projection: T; action?: ForgeDraftAction; context?: OperationContext; revision?: number;
  }): Promise<T> {
    const write = async () => {
    await this.preserve();
    const storage = this.options.storage ?? indexedDbOperationJournal;
    const projection = await storage.change(this.key, (state) => {
      const eventId = crypto.randomUUID();
      const next = change(structuredClone((state.projection as T | undefined) ?? initial),
        { workingCopyId: state.workingCopyId, throughSequence: state.sequence, eventId });
      if (next.action) this.appendCaptured(state, { id: eventId, action: next.action,
        draftRevision: next.revision ?? state.sequence + 1, context: next.context });
      state.projection = structuredClone(next.projection);
      return structuredClone(next.projection);
    });
    void this.flush().catch((error: unknown) => this.options.onError?.(error));
    return projection;
    };
    const result = this.projections.catch(() => undefined).then(write);
    this.projections = result.then(() => { this.projectionFailure = undefined; }, error => { this.projectionFailure = error; });
    return result;
  }

  private preserve(): Promise<void> {
    const storage = this.options.storage ?? indexedDbOperationJournal;
    this.writes = this.writes.catch(() => undefined).then(async () => {
      while (this.pending.length) {
        const captured = this.pending[0]!;
        await storage.change(this.key, (state) => {
          this.appendCaptured(state, captured);
        });
        this.pending.shift();
      }
    });
    return this.writes;
  }

  /** Parking waits for IndexedDB, without requiring a network save or changing the base. */
  async preserveLocal(): Promise<void> { await this.projections; if (this.projectionFailure) throw this.projectionFailure; await this.preserve(); }

  flush(): Promise<void> {
    if (this.sending) return this.sending.then(() => this.flush());
    const storage = this.options.storage ?? indexedDbOperationJournal;
    this.sending = (async () => {
      while (true) {
        await this.preserve();
        const batch = await storage.change(this.key, (state) => {
          if (!state.outbox) {
            const acknowledged = new Set(state.acknowledged);
            const unsent = state.events.filter((event) => !acknowledged.has(event.id)).slice(0, 500);
            if (unsent.length) state.outbox = structuredClone(unsent);
          }
          return structuredClone(state.outbox);
        });
        if (!batch) return;
        await this.options.append(structuredClone(batch));
        await storage.change(this.key, (state) => {
          const accepted = new Set(batch.map((event) => event.id));
          if (batch.every((event) => state.acknowledged.includes(event.id))) return;
          if (state.outbox && JSON.stringify(state.outbox) !== JSON.stringify(batch))
            throw new Error('A different operation-history batch owns this acknowledgement.');
          state.acknowledged = [...new Set([...state.acknowledged, ...accepted])];
          state.outbox = null;
        });
      }
    })().finally(() => { this.sending = null; }).then(() => { this.options.onSaved?.(); });
    return this.sending;
  }

  async writeDraft<T extends { revision: number }>(
    request: TemplateAuthoringDraftPut,
    write: (frozen: TemplateAuthoringDraftPut) => Promise<T>,
  ): Promise<{ result: T; matched: boolean }> {
    await this.flush();
    const storage = this.options.storage ?? indexedDbOperationJournal;
    const frozen = await storage.change(this.key, (state) => {
      state.draftIntent ??= { ...structuredClone(request), requestId: request.requestId ?? crypto.randomUUID() };
      return structuredClone(state.draftIntent);
    });
    const result = await write(structuredClone(frozen));
    await storage.change(this.key, (state) => {
      if (state.draftIntent && JSON.stringify(state.draftIntent) !== JSON.stringify(frozen))
        throw new Error('A different frozen draft owns this acknowledgement.');
      delete state.draftIntent;
    });
    const { requestId: _frozenId, ...frozenBody } = frozen;
    const { requestId: _requestId, ...requestBody } = request;
    const matched = JSON.stringify(frozenBody) === JSON.stringify(requestBody);
    if (!matched && request.expectedRevision === result.revision) return this.writeDraft(request, write);
    return { result, matched };
  }

  /** Recover an uncertain acknowledgement even when the fetched server commands already match. */
  async resumeDraft<T extends { revision: number }>(
    write: (frozen: TemplateAuthoringDraftPut) => Promise<T>,
  ): Promise<T | null> {
    const storage = this.options.storage ?? indexedDbOperationJournal;
    const frozen = await storage.change(this.key, (state) => state.draftIntent ? structuredClone(state.draftIntent) : null);
    if (!frozen) return null;
    return (await this.writeDraft(frozen, write)).result;
  }
}
