import type { TemplateAuthoringDraftPut, TemplateAuthoringScope, TemplateOperationInput } from '@continuum/contracts';
import { openTemplateDraftDb } from './templateDraftRecovery';

export type ForgeDraftAction = {
  command: string;
  changes: Record<string, unknown>;
  affectedObjects?: string[];
  causedBy?: string[];
  origin?: TemplateOperationInput['origin'];
  evidence?: TemplateOperationInput['evidence'];
};

export type OperationJournalState = {
  workingCopyId: string;
  sequence: number;
  events: TemplateOperationInput[];
  acknowledged: string[];
  outbox: TemplateOperationInput[] | null;
  draftIntent?: TemplateAuthoringDraftPut;
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

type Captured = { id: string; action: ForgeDraftAction; draftRevision: number };

/** Capture precedes projection; UI stays optimistic until IndexedDB commits. Autosave awaits durable history. */
export class TemplateOperationJournal {
  private readonly key: string;
  private pending: Captured[] = [];
  private writes: Promise<void> = Promise.resolve();
  private sending: Promise<void> | null = null;

  constructor(private readonly options: {
    userId: string;
    scope: TemplateAuthoringScope;
    workspaceIdentity: string;
    sourceChecksum: string;
    baseRevisionId?: string;
    storage?: OperationJournalStorage;
    append: (events: TemplateOperationInput[]) => Promise<void>;
    onError?: (error: unknown) => void;
    onSaved?: () => void;
  }) {
    this.key = `operation-history:${options.userId}:${options.scope.brandId}:${options.scope.assetId}:${options.scope.baseVersionId}:${options.workspaceIdentity}${options.scope.workingCopyId ? `:working-copy:${options.scope.workingCopyId}` : ''}`;
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

  private preserve(): Promise<void> {
    const storage = this.options.storage ?? indexedDbOperationJournal;
    this.writes = this.writes.catch(() => undefined).then(async () => {
      while (this.pending.length) {
        const captured = this.pending[0]!;
        await storage.change(this.key, (state) => {
          if (state.events.some((event) => event.id === captured.id)) return;
          const { action } = captured;
          const prior = state.events.at(-1)?.id;
          const causedBy = [...new Set([...(action.causedBy ?? []), ...(prior ? [prior] : [])])].slice(-100);
          state.events.push({
            id: captured.id, workingCopyId: state.workingCopyId, sequence: ++state.sequence,
            command: action.command, baseRevisionId: this.options.baseRevisionId ?? null, channel: 'forge', outcome: 'succeeded',
            affectedObjects: action.affectedObjects ?? [], causedBy, evidence: action.evidence ?? 'recorded',
            changes: { ...action.changes, baseVersionId: this.options.scope.baseVersionId,
              ...(this.options.scope.workingCopyId ? { authoringWorkingCopyId: this.options.scope.workingCopyId } : {}),
              draftRevision: captured.draftRevision, sourceChecksum: this.options.sourceChecksum,
              workspaceIdentity: this.options.workspaceIdentity },
            ...(action.origin ? { origin: action.origin } : {}),
          });
        });
        this.pending.shift();
      }
    });
    return this.writes;
  }

  /** Parking waits for IndexedDB, without requiring a network save or changing the base. */
  preserveLocal(): Promise<void> { return this.preserve(); }

  flush(): Promise<void> {
    if (this.sending) return this.sending.then(() => this.pending.length ? this.flush() : undefined);
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
    })().finally(() => { this.sending = null; });
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
