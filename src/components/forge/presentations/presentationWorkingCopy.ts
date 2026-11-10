import {
  type PresentationCommand,
  type PresentationDocument,
  type PresentationEnvelope,
  presentationApplyRequestSchema,
  presentationEnvelopeSchema,
  presentationHistoryRequestSchema,
  presentationTemplateRoute,
} from '@continuum/contracts';
import { http } from '@/lib/api/http';
import type { PresentationScope } from '@/lib/api/presentations.client';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  createLayerHistory,
  type LayerHistory,
  redoLayerHistory,
  undoLayerHistory,
  updateLayerHistory,
} from '../layerHistory';
import {
  type ForgeDraftAction,
  type OperationJournalStorage,
  TemplateOperationJournal,
} from '../templateOperationJournal';

type Snapshot = { document: PresentationDocument; commands: PresentationCommand[] };
export type PresentationPending = {
  id: string;
  expectedRevision: number;
  snapshot: Snapshot;
  throughSequence: number;
} & (
  | { kind: 'apply'; commands: PresentationCommand[] }
  | { kind: 'history'; direction: 'undo' | 'redo' }
);
export type PresentationCopyState = {
  userId: string;
  scope: PresentationScope;
  sourceChecksum: string;
  engineVersion: string;
  version: number;
  server: PresentationEnvelope;
  history: LayerHistory<Snapshot>;
  pending: PresentationPending | null;
  evidence: Array<{ id: string; commands?: PresentationCommand[]; intent?: PresentationPending }>;
};
type Options = {
  userId: string;
  scope: PresentationScope;
  initial: PresentationEnvelope;
  process: (
    document: PresentationDocument,
    commands: PresentationCommand[],
    retryId: string,
  ) => Promise<PresentationDocument>;
  currentPrincipal: () => Promise<string>;
  send: (intent: PresentationPending) => Promise<PresentationEnvelope>;
  append: ConstructorParameters<typeof TemplateOperationJournal>[0]['append'];
  storage?: OperationJournalStorage;
  onError?: (error: unknown) => void;
};
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
const digest = async (value: unknown) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value))),
    ),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
const semantic = ({
  nativeDocument: _native,
  revision: _revision,
  ...document
}: PresentationDocument) => canonical(document);
const binaryReferences = (commands: PresentationCommand[], evidenceId: string) =>
  JSON.parse(
    JSON.stringify(commands, (key, value: unknown) =>
      key === 'bytesBase64' || key === 'nativeDocument'
        ? { privateProjectionEvidenceId: evidenceId }
        : value,
    ),
  ) as unknown;

/** Legacy draft CAS remains the authority. No document counter is treated as a shared revision UUID. */
export class PresentationWorkingCopy {
  private readonly initial: PresentationCopyState;
  private readonly journal: TemplateOperationJournal;
  private queued: Promise<void> = Promise.resolve();
  private sending: Promise<PresentationCopyState> | null = null;
  private constructor(private readonly options: Options) {
    const source = options.initial.document.source;
    if (
      !source ||
      source.assetId !== options.scope.assetId ||
      source.assetVersionId !== options.scope.baseVersionId
    )
      throw new Error('The saved presentation has no matching source pin.');
    this.initial = {
      userId: options.userId,
      scope: options.scope,
      sourceChecksum: source.checksum,
      engineVersion: options.initial.document.engineVersion,
      version: 0,
      server: options.initial,
      history: createLayerHistory({ document: options.initial.document, commands: [] }),
      pending: null,
      evidence: [],
    };
    this.journal = new TemplateOperationJournal({
      userId: options.userId,
      scope: options.scope,
      workspaceIdentity: 'presentation-legacy',
      sourceChecksum: source.checksum,
      storageKey: `presentation-editor:${options.userId}:${options.scope.brandId}:${options.scope.assetId}:${options.scope.baseVersionId}`,
      storage: options.storage,
      append: options.append,
      onError: options.onError,
    });
  }
  static async open(options: Options) {
    const copy = new PresentationWorkingCopy(options);
    await copy.journal.changeProjection(copy.initial, (state) => {
      if (
        state.userId !== options.userId ||
        canonical(state.scope) !== canonical(options.scope) ||
        state.sourceChecksum !== copy.initial.sourceChecksum ||
        state.engineVersion !== copy.initial.engineVersion
      )
        throw new Error('This private presentation belongs to another account, source or engine.');
      if (
        !state.pending &&
        !state.history.present.commands.length &&
        state.server.draftRevision !== options.initial.draftRevision
      )
        state = {
          ...state,
          server: options.initial,
          history: createLayerHistory({ document: options.initial.document, commands: [] }),
          version: state.version + 1,
        };
      return { projection: state };
    });
    return copy;
  }
  read() {
    return this.journal.changeProjection(this.initial, (projection) => ({ projection }));
  }
  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queued.catch(() => undefined).then(work);
    this.queued = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  private async event(
    command: string,
    state: PresentationCopyState,
    commands: PresentationCommand[] = [],
  ) {
    return {
      command,
      origin: { tool: 'Forge presentation editor' },
      changes: {
        legacyDraftRevision: state.server.draftRevision,
        sourceVersionId: state.scope.baseVersionId,
        sourceChecksum: state.sourceChecksum,
        documentId: state.history.present.document.id,
        engineVersion: state.engineVersion,
        commandCount: commands.length,
        commandDigest: await digest(commands),
        projectionStorage: 'private IndexedDB presentation projection',
      },
      affectedObjects: commands.flatMap((item) =>
        'objectId' in item ? [item.objectId] : 'slideId' in item ? [item.slideId] : [],
      ),
    } satisfies ForgeDraftAction;
  }
  perform(commands: PresentationCommand[]) {
    const frozen = structuredClone(commands);
    return this.serialize(async () => {
      const before = await this.read();
      if (before.pending?.kind === 'history')
        throw new Error('Resolve the pending history request before editing.');
      const document = await this.options.process(
        before.history.present.document,
        frozen,
        crypto.randomUUID(),
      );
      const action = await this.event('forge_presentation_edit', before, frozen);
      return this.journal.changeProjection(this.initial, (state, coverage) => {
        if (state.version !== before.version)
          throw new Error('Another presentation editor changed this private copy. Retry the edit.');
        const details = binaryReferences(frozen, coverage.eventId);
        return {
          projection: {
            ...state,
            version: state.version + 1,
            history: updateLayerHistory(state.history, {
              document,
              commands: [...state.history.present.commands, ...frozen],
            }),
            evidence: [...state.evidence, { id: coverage.eventId, commands: frozen }],
          },
          action: {
            ...action,
            changes: {
              ...action.changes,
              privateProjectionEvidenceId: coverage.eventId,
              ...(canonical(details).length < 200_000 ? { commands: details } : {}),
            },
          },
        };
      });
    });
  }
  history(direction: 'undo' | 'redo') {
    return this.serialize(async () => {
      const before = await this.read();
      if (before.pending)
        throw new Error('Resolve the pending Save request before changing history.');
      const local =
        direction === 'undo' ? before.history.past.length : before.history.future.length;
      if (
        !local ||
        (!before.history.present.commands.length &&
          direction === 'redo' &&
          !before.history.future.length)
      )
        return { state: before, remote: !before.history.present.commands.length };
      const action = await this.event(`forge_presentation_${direction}`, before);
      const state = await this.journal.changeProjection(this.initial, (current) => ({
        projection: {
          ...current,
          version: current.version + 1,
          history:
            direction === 'undo'
              ? undoLayerHistory(current.history)
              : redoLayerHistory(current.history),
        },
        action,
      }));
      return { state, remote: false };
    }).then((result) => (result.remote ? this.send('history', direction) : result.state));
  }
  discard() {
    return this.serialize(async () => {
      const before = await this.read();
      if (before.pending)
        throw new Error('The Save outcome is uncertain. Retry it before discarding changes.');
      const action = await this.event('forge_presentation_discard', before);
      return this.journal.changeProjection(this.initial, (state) => ({
        projection: {
          ...state,
          version: state.version + 1,
          history: createLayerHistory(state.history.baseline),
        },
        action,
      }));
    });
  }
  replace(envelope: PresentationEnvelope) {
    const frozen = structuredClone(envelope);
    return this.serialize(() =>
      this.journal.changeProjection(this.initial, (state) => {
        if (state.pending)
          throw new Error('Resolve the pending Save request before replacing this presentation.');
        if (state.history.present.commands.length)
          throw new Error(
            'Newer private edits are preserved. Save or discard them before adopting the server presentation.',
          );
        const pin = frozen.document.source;
        if (
          !pin ||
          pin.assetId !== state.scope.assetId ||
          pin.assetVersionId !== state.scope.baseVersionId ||
          pin.checksum !== state.sourceChecksum ||
          frozen.document.engineVersion !== state.engineVersion
        )
          throw new Error('The server presentation belongs to another source or engine.');
        if (frozen.draftRevision < state.server.draftRevision)
          throw new Error('The server presentation is older than the accepted private base.');
        return {
          projection: {
            ...state,
            version: state.version + 1,
            server: frozen,
            history: createLayerHistory({ document: frozen.document, commands: [] }),
          },
        };
      }),
    );
  }
  async park() {
    await this.queued;
    await this.journal.preserveLocal();
  }
  save() {
    return this.send('apply');
  }
  private send(
    kind: 'apply' | 'history',
    direction?: 'undo' | 'redo',
  ): Promise<PresentationCopyState> {
    if (this.sending) return this.sending;
    const run = async () => {
      if ((await this.options.currentPrincipal()) !== this.options.userId)
        throw new Error(
          'This presentation belongs to another signed-in account. Its private changes are preserved.',
        );
      const captured = await this.serialize(async () => {
        const before = await this.read();
        if (before.pending || (kind === 'apply' && !before.history.present.commands.length))
          return before;
        const action = await this.event(
          `forge_presentation_${kind === 'apply' ? 'save' : direction}`,
          before,
        );
        return this.journal.changeProjection(this.initial, (state, coverage) => {
          const pending: PresentationPending = {
            id: crypto.randomUUID(),
            expectedRevision: state.server.draftRevision,
            snapshot: structuredClone(state.history.present),
            throughSequence: coverage.throughSequence,
            ...(kind === 'apply'
              ? { kind, commands: structuredClone(state.history.present.commands) }
              : { kind, direction: direction! }),
          };
          return {
            projection: {
              ...state,
              version: state.version + 1,
              pending,
              evidence: [...state.evidence, { id: coverage.eventId, intent: pending }],
            },
            action: {
              ...action,
              outcome: 'requested',
              changes: {
                ...action.changes,
                intentId: pending.id,
                privateProjectionEvidenceId: coverage.eventId,
                expectedRevision: pending.expectedRevision,
              },
            },
          };
        });
      });
      const intent = captured.pending;
      if (!intent) return captured;
      const envelope = await this.options.send(intent);
      const pin = envelope.document.source;
      if (
        !pin ||
        pin.assetId !== captured.scope.assetId ||
        pin.assetVersionId !== captured.scope.baseVersionId ||
        pin.checksum !== captured.sourceChecksum ||
        envelope.document.engineVersion !== captured.engineVersion ||
        envelope.draftRevision <= intent.expectedRevision
      )
        throw new Error(
          'The server returned a different presentation source, engine or revision. The pending request is preserved.',
        );
      return this.serialize(async () => {
        const before = await this.read();
        if (before.pending?.id !== intent.id)
          throw new Error('Another request owns this presentation acknowledgement.');
        const covered = intent.kind === 'apply' ? intent.commands : [];
        const present = before.history.present.commands;
        if (canonical(present.slice(0, covered.length)) !== canonical(covered))
          throw new Error(
            'The saved command boundary changed. Both the request and private work are preserved.',
          );
        const later = present.slice(covered.length);
        if (
          later.length &&
          (envelope.draftRevision !== intent.expectedRevision + 1 ||
            semantic(envelope.document) !== semantic(intent.snapshot.document))
        )
          throw new Error(
            'The saved presentation also changed remotely. Later private edits are preserved for review.',
          );
        const baseline = { document: envelope.document, commands: [] as PresentationCommand[] };
        const document = later.length
          ? await this.options.process(envelope.document, later, crypto.randomUUID())
          : envelope.document;
        const history = later.length
          ? updateLayerHistory(createLayerHistory(baseline), { document, commands: later })
          : createLayerHistory(baseline);
        const action = await this.event('forge_presentation_save', before);
        return this.journal.changeProjection(this.initial, (state) => {
          if (state.version !== before.version)
            throw new Error(
              'Another editor changed this presentation during acknowledgement. Retry the retained request.',
            );
          return {
            projection: {
              ...state,
              version: state.version + 1,
              server: envelope,
              history,
              pending: null,
            },
            action: {
              ...action,
              changes: {
                ...action.changes,
                intentId: intent.id,
                acceptedDraftRevision: envelope.draftRevision,
                throughSequence: intent.throughSequence,
              },
            },
          };
        });
      });
    };
    const result = run();
    this.sending = result;
    void result
      .finally(() => {
        if (this.sending === result) this.sending = null;
      })
      .catch(() => undefined);
    return result;
  }
}

/** Capture the checked owner's token for this request; a later token lookup cannot substitute another account. */
export async function sendPresentationRequest(
  scope: PresentationScope,
  userId: string,
  intent: PresentationPending,
) {
  const { data } = await createSupabaseBrowserClient().auth.getSession();
  if (!data.session?.access_token || data.session.user.id !== userId)
    throw new Error(
      'This presentation belongs to another signed-in account. Its pending request is preserved.',
    );
  const shared = {
    brandId: scope.brandId,
    baseVersionId: scope.baseVersionId,
    expectedRevision: intent.expectedRevision,
    retryId: intent.id,
  };
  return http.request<PresentationEnvelope>({
    path: presentationTemplateRoute(scope.assetId) + (intent.kind === 'history' ? '/history' : ''),
    method: intent.kind === 'apply' ? 'PUT' : 'POST',
    headers: { Authorization: `Bearer ${data.session.access_token}` },
    body:
      intent.kind === 'apply'
        ? presentationApplyRequestSchema.parse({ ...shared, commands: intent.commands })
        : presentationHistoryRequestSchema.parse({ ...shared, direction: intent.direction }),
    schema: presentationEnvelopeSchema,
  });
}
