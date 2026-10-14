import type {
  TemplateAuthoringCommand,
  TemplateAuthoringDraft,
  TemplateAuthoringScope,
} from '@continuum/contracts';
import { templateAuthoringNodeId } from '@continuum/contracts';
import type { LayerDraftSnapshot } from '@/components/forge/layerHistory';

export type LayerDraftSyncStatus =
  'loading' | 'saved' | 'saving' | 'unsaved' | 'error' | 'conflict' | 'source-mismatch';

export type LayerDraftState = {
  dirty: boolean;
  busy: boolean;
  saveLabel: string;
  save: () => Promise<boolean>;
  discard: () => void;
  status?: LayerDraftSyncStatus;
  retry?: () => Promise<boolean>;
};

export type LayerDraftChange = (draft: LayerDraftState | null) => void;

export function appendLayerDraftCommand(
  snapshot: LayerDraftSnapshot,
  command: TemplateAuthoringCommand,
): LayerDraftSnapshot {
  const operations = snapshot.operations.map((item) => structuredClone(item));
  const last = operations.at(-1);
  if (last?.type === 'layer.edit' && command.type === 'layer.edit' && last.nodeId === command.nodeId) {
    operations[operations.length - 1] = {
      ...last,
      edit: { ...last.edit, ...command.edit } as typeof last.edit,
    };
  } else if (
    last?.type === 'composition.order' && command.type === 'composition.order' &&
    (last.compId !== undefined && last.compId === command.compId ||
      last.artboardId !== undefined && last.artboardId === command.artboardId)
  ) {
    operations[operations.length - 1] = structuredClone(command);
  } else if (
    last?.type === 'exposure.set' && command.type === 'exposure.set' &&
    last.slotKey === command.slotKey
  ) {
    operations[operations.length - 1] = structuredClone(command);
  } else {
    operations.push(structuredClone(command));
  }
  return { ...snapshot, operations };
}

export function commandsFromLayerSnapshot(
  snapshot: LayerDraftSnapshot,
): TemplateAuthoringCommand[] {
  if (snapshot.operations.length) return snapshot.operations.map((command) => structuredClone(command));
  return [
    ...Object.values(snapshot.edits)
      .sort((a, b) => a.compId - b.compId || a.layerId - b.layerId)
      .map((edit) => ({
        type: 'layer.edit' as const,
        nodeId: templateAuthoringNodeId(edit),
        edit: structuredClone(edit),
      })),
    ...snapshot.operations.map((command) => structuredClone(command)),
    ...Object.entries(snapshot.nodeOrders)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([compId, nodeIds]) => ({
        type: 'composition.order' as const,
        compId: Number(compId),
        nodeIds: [...nodeIds],
      })),
    ...Object.entries(snapshot.orders)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([compId, layerIds]) => ({
        type: 'composition.order' as const,
        compId: Number(compId),
        layerIds: [...layerIds],
      })),
    ...Object.entries(snapshot.exposures)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([slotKey, exposed]) => ({ type: 'exposure.set' as const, slotKey, exposed })),
  ];
}

export function layerSnapshotFromCommands(
  commands: readonly TemplateAuthoringCommand[],
): LayerDraftSnapshot {
  const snapshot: LayerDraftSnapshot = {
    edits: {}, orders: {}, nodeOrders: {}, exposures: {}, operations: [],
  };
  const layerRefs = new Map<number, number>();
  for (const command of commands) {
    if (command.type === 'layer.edit') {
      if (command.nodeId.startsWith('aep:')) {
        if (!('compId' in command.edit) || !('layerId' in command.edit) ||
          command.nodeId !== templateAuthoringNodeId(command.edit))
          throw new Error('This draft contains a layer with an invalid source identity.');
        const existingComp = layerRefs.get(command.edit.layerId);
        if (existingComp !== undefined && existingComp !== command.edit.compId)
          throw new Error(
            'This draft contains overlapping layer IDs that this editor cannot safely restore.',
          );
        layerRefs.set(command.edit.layerId, command.edit.compId);
        snapshot.edits[command.edit.layerId] = structuredClone(command.edit);
        snapshot.operations.push(structuredClone(command));
      } else {
        snapshot.operations.push(structuredClone(command));
      }
    } else if (command.type === 'composition.order') {
      if (command.nodeIds && command.compId !== undefined) snapshot.nodeOrders[command.compId] = [...command.nodeIds];
      else if (command.layerIds && command.compId !== undefined) snapshot.orders[command.compId] = [...command.layerIds];
      else if (command.nodeIds && command.artboardId) { /* preserved in operations for draft artboards */ }
      else throw new Error('This draft contains an incomplete layer order.');
      snapshot.operations.push(structuredClone(command));
    } else if (command.type === 'exposure.set') {
      snapshot.exposures[command.slotKey] = command.exposed;
      snapshot.operations.push(structuredClone(command));
    } else {
      snapshot.operations.push(structuredClone(command));
    }
  }
  return snapshot;
}

export class TemplateAuthoringDraftError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message = code,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'TemplateAuthoringDraftError';
  }
}

export type LayerDraftAutosaveView = {
  status: LayerDraftSyncStatus;
  revision: number;
  dirty: boolean;
  error: string | null;
};

type LayerDraftAutosaverOptions = {
  scope: TemplateAuthoringScope;
  revision: number;
  persistedCommands: TemplateAuthoringCommand[];
  commands?: TemplateAuthoringCommand[];
  write: (
    scope: TemplateAuthoringScope,
    expectedRevision: number,
    commands: TemplateAuthoringCommand[],
  ) => Promise<TemplateAuthoringDraft>;
  onChange?: (
    view: LayerDraftAutosaveView,
    commands: TemplateAuthoringCommand[],
    persistedCommands: TemplateAuthoringCommand[],
  ) => void;
  delayMs?: number;
  initialError?: string;
  initialConflict?: boolean;
};

const equalCommands = (
  a: readonly TemplateAuthoringCommand[],
  b: readonly TemplateAuthoringCommand[],
) => JSON.stringify(a) === JSON.stringify(b);

/** Serializes revision-checked writes so an edit made during a request is saved at the next revision. */
export class LayerDraftAutosaver {
  private revision: number;
  private current: TemplateAuthoringCommand[];
  private persisted: TemplateAuthoringCommand[];
  private status: LayerDraftSyncStatus = 'saved';
  private error: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<boolean> | null = null;
  private disposed = false;
  private readonly delayMs: number;

  constructor(private readonly options: LayerDraftAutosaverOptions) {
    this.revision = options.revision;
    this.current = structuredClone(options.commands ?? options.persistedCommands);
    this.persisted = structuredClone(options.persistedCommands);
    this.delayMs = options.delayMs ?? 500;
    this.error = options.initialError ?? null;
    this.status = options.initialConflict ? 'conflict' : options.initialError ? 'error' : 'saved';
    this.publish();
  }

  get view(): LayerDraftAutosaveView {
    return {
      status: this.status,
      revision: this.revision,
      dirty:
        !equalCommands(this.current, this.persisted) ||
        this.status === 'error' ||
        this.status === 'conflict' ||
        this.status === 'source-mismatch',
      error: this.error,
    };
  }

  update(commands: TemplateAuthoringCommand[], immediate = false) {
    if (this.disposed) return;
    this.current = structuredClone(commands);
    if (this.status === 'conflict' || this.status === 'source-mismatch') {
      this.clearTimer();
      this.publish();
      return;
    }
    if (!equalCommands(this.current, this.persisted)) {
      this.status = 'unsaved';
      this.error = null;
      this.publish();
      this.schedule(immediate ? 0 : this.delayMs);
    } else {
      this.clearTimer();
      this.status = 'saved';
      this.error = null;
      this.publish();
    }
  }

  flush(): Promise<boolean> {
    this.clearTimer();
    if (this.inFlight)
      return this.inFlight.then((ok) => (ok && !this.isDirty() ? true : ok ? this.flush() : false));
    if (this.status === 'conflict' || this.status === 'source-mismatch')
      return Promise.resolve(false);
    if (!this.isDirty()) return Promise.resolve(true);
    const snapshot = structuredClone(this.current);
    this.status = 'saving';
    this.error = null;
    this.publish();
    const request = this.options.write(this.options.scope, this.revision, snapshot);
    this.inFlight = request
      .then(
        (draft) => {
          this.revision = draft.revision;
          this.persisted = snapshot;
          this.status = equalCommands(this.current, this.persisted) ? 'saved' : 'unsaved';
          this.error = null;
          this.publish();
          return true;
        },
        (error: unknown) => {
          if (error instanceof TemplateAuthoringDraftError && error.code === 'revision_conflict') {
            this.status = 'conflict';
          } else if (
            error instanceof TemplateAuthoringDraftError &&
            error.code === 'source_mismatch'
          ) {
            this.status = 'source-mismatch';
          } else {
            this.status = 'error';
          }
          this.error = error instanceof Error ? error.message : 'Draft could not be saved.';
          this.publish();
          return false;
        },
      )
      .finally(() => {
        this.inFlight = null;
        if (!this.disposed && this.status === 'unsaved') this.schedule(0);
      });
    return this.inFlight.then((ok) => (ok && this.isDirty() ? this.flush() : ok));
  }

  setConflict(message: string, sourceMismatch = false) {
    this.clearTimer();
    this.status = sourceMismatch ? 'source-mismatch' : 'conflict';
    this.error = message;
    this.publish();
  }

  adoptServerDraft(revision: number, commands: TemplateAuthoringCommand[]) {
    this.clearTimer();
    this.revision = revision;
    this.current = structuredClone(commands);
    this.persisted = structuredClone(commands);
    // Choosing content does not reconcile the immutable source it was authored against.
    if (this.status !== 'source-mismatch') {
      this.status = 'saved';
      this.error = null;
    }
    this.publish();
  }

  retry(): Promise<boolean> {
    if (this.status === 'conflict' || this.status === 'source-mismatch')
      return Promise.resolve(false);
    if (!this.isDirty()) {
      this.status = 'saved';
      this.error = null;
      this.publish();
      return Promise.resolve(true);
    }
    this.status = 'unsaved';
    this.error = null;
    this.publish();
    return this.flush();
  }

  dispose() {
    this.disposed = true;
    this.clearTimer();
  }

  private isDirty() {
    return !equalCommands(this.current, this.persisted);
  }

  private schedule(delay: number) {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delay);
  }

  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private publish() {
    this.options.onChange?.(
      this.view,
      structuredClone(this.current),
      structuredClone(this.persisted),
    );
  }
}
