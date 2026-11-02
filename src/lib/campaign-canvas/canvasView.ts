// Which way the companion canvas shows a campaign: Mapa (the node graph, to think and edit) or
// Lectura (cards, to read and approve) — design C, Ramiro 2026-10-31.
//
// The default follows the task: a pane Jaina opened on a proposal opens in Lectura, because
// the job is to approve; a pane someone opened themselves opens in Mapa. A person's own choice
// is remembered PER TASK, so preferring the Mapa for proposals never changes what opens when
// they edit by hand. A phone always reads: the Mapa needs room it does not have.

export type CanvasView = 'mapa' | 'lectura';

/** Why the pane is showing what it shows. */
export type CanvasViewContext = 'proposed' | 'manual';

export const CANVAS_VIEW_STORAGE_KEY = 'continuum.canvas.view.v1';

/** Below this viewport width the pane is a phone sheet and only Lectura fits. */
export const CANVAS_VIEW_PHONE_MAX_WIDTH = 639;

type StoredViews = Partial<Record<CanvasViewContext, CanvasView>>;

const isView = (value: unknown): value is CanvasView => value === 'mapa' || value === 'lectura';

export const defaultCanvasView = (context: CanvasViewContext): CanvasView =>
  context === 'proposed' ? 'lectura' : 'mapa';

export const resolveCanvasView = (params: {
  context: CanvasViewContext;
  stored: StoredViews;
  isPhone: boolean;
}): CanvasView => decideCanvasView({ ...params, editing: false }).view;

// ---------------------------------------------------------------------------
// Auto mode by task (option 23). THE RULE: auto picks per task — Jaina proposes, so Read;
// the person edits or builds by hand, so Map — and your last explicit pick per task kind
// overrides auto for that kind from then on. Starting to edit is itself explicit: it is the
// one act that always lands in the Map, because that is the only place editing happens.
// ---------------------------------------------------------------------------

/** Where the view on screen came from, most specific first. */
export type CanvasViewSource = 'phone' | 'editing' | 'remembered' | 'auto';

export type CanvasViewDecision = { view: CanvasView; source: CanvasViewSource };

export const decideCanvasView = (params: {
  context: CanvasViewContext;
  stored: StoredViews;
  isPhone: boolean;
  /** The person started editing a node (or pressed Edit) since the pane opened for this task. */
  editing: boolean;
}): CanvasViewDecision => {
  if (params.isPhone) return { view: 'lectura', source: 'phone' };
  if (params.editing) return { view: 'mapa', source: 'editing' };
  const stored = params.stored[params.context];
  if (isView(stored)) return { view: stored, source: 'remembered' };
  return { view: defaultCanvasView(params.context), source: 'auto' };
};

/** What a pane knows about its task: why it opened, and whether editing has begun. */
export type CanvasViewTask = { context: CanvasViewContext; editing: boolean };

export type CanvasViewEvent =
  /** The pane opened (or re-pointed) for a task: Jaina proposed, or the person opened it. */
  | { type: 'task'; context: CanvasViewContext }
  /** The person pressed Edit or changed a node: the task is now theirs. */
  | { type: 'edit' }
  /** The person used the toggle; the hook remembers the pick for the current task kind. */
  | { type: 'pick' };

export const nextCanvasViewTask = (
  task: CanvasViewTask,
  event: CanvasViewEvent,
): CanvasViewTask => {
  switch (event.type) {
    case 'task':
      return { context: event.context, editing: false };
    case 'edit':
      return { context: 'manual', editing: true };
    case 'pick':
      // A pick is the person's word for this task kind: it outranks an edit's forced Map.
      return { context: task.context, editing: false };
  }
};

export const CANVAS_VIEW_HINT_STORAGE_KEY = 'continuum.canvas.view-hint.v1';

export const PROPOSED_READ_HINT = 'Opened in Read because Jaina proposed changes';

/**
 * The one-line hint beside the toggle the first time auto mode picks Read for a proposal, so
 * the switch away from the Map never surprises. Never after it was dismissed, and never when
 * the view is the person's own pick.
 */
export const canvasViewHintOf = (params: {
  context: CanvasViewContext;
  decision: CanvasViewDecision;
  dismissed: boolean;
}): string | null =>
  !params.dismissed &&
  params.decision.source === 'auto' &&
  params.context === 'proposed' &&
  params.decision.view === 'lectura'
    ? PROPOSED_READ_HINT
    : null;

export const readCanvasViewHintDismissed = (storage: Pick<Storage, 'getItem'> | null): boolean => {
  try {
    return storage?.getItem(CANVAS_VIEW_HINT_STORAGE_KEY) === 'dismissed';
  } catch {
    return false;
  }
};

export const writeCanvasViewHintDismissed = (storage: Pick<Storage, 'setItem'> | null): void => {
  try {
    storage?.setItem(CANVAS_VIEW_HINT_STORAGE_KEY, 'dismissed');
  } catch {
    // A refused write only means the hint may show once more in a later session.
  }
};

/** The scaffold-focus reasons the Scale page receives, mapped to a context. */
export const canvasViewContextOf = (
  reason: 'proposed' | 'thread' | 'expand' | 'live_change' | 'manual',
): CanvasViewContext => (reason === 'proposed' || reason === 'live_change' ? 'proposed' : 'manual');

/** A missing, blocked or corrupt store reads as "no preference" — never as an error. */
export const readStoredCanvasViews = (storage: Pick<Storage, 'getItem'> | null): StoredViews => {
  try {
    const raw = storage?.getItem(CANVAS_VIEW_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: StoredViews = {};
    for (const context of ['proposed', 'manual'] as const) {
      const value = (parsed as Record<string, unknown>)[context];
      if (isView(value)) out[context] = value;
    }
    return out;
  } catch {
    // Private windows and blocked site data throw on access; the default is the answer.
    return {};
  }
};

export const writeStoredCanvasView = (
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
  context: CanvasViewContext,
  view: CanvasView,
): void => {
  try {
    const next = { ...readStoredCanvasViews(storage), [context]: view };
    storage?.setItem(CANVAS_VIEW_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Remembering is a convenience: a refused write keeps the choice for this session only.
  }
};
