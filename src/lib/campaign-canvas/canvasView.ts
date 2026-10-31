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
}): CanvasView => {
  if (params.isPhone) return 'lectura';
  const stored = params.stored[params.context];
  return isView(stored) ? stored : defaultCanvasView(params.context);
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
