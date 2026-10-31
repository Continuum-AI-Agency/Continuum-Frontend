import { describe, expect, it } from 'bun:test';
import {
  CANVAS_VIEW_HINT_STORAGE_KEY,
  CANVAS_VIEW_STORAGE_KEY,
  type CanvasViewTask,
  canvasViewContextOf,
  canvasViewHintOf,
  decideCanvasView,
  nextCanvasViewTask,
  PROPOSED_READ_HINT,
  readCanvasViewHintDismissed,
  readStoredCanvasViews,
  resolveCanvasView,
  writeCanvasViewHintDismissed,
  writeStoredCanvasView,
} from './canvasView';

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  };
};

describe('resolveCanvasView', () => {
  it('opens a proposal in Lectura and a pane opened by hand in Mapa', () => {
    expect(resolveCanvasView({ context: 'proposed', stored: {}, isPhone: false })).toBe('lectura');
    expect(resolveCanvasView({ context: 'manual', stored: {}, isPhone: false })).toBe('mapa');
  });

  it("honours the person's choice per task, never across tasks", () => {
    const stored = { proposed: 'mapa' as const };
    expect(resolveCanvasView({ context: 'proposed', stored, isPhone: false })).toBe('mapa');
    expect(resolveCanvasView({ context: 'manual', stored, isPhone: false })).toBe('mapa');
    expect(
      resolveCanvasView({ context: 'manual', stored: { proposed: 'lectura' }, isPhone: false }),
    ).toBe('mapa');
  });

  it('always reads on a phone, whatever was chosen', () => {
    expect(
      resolveCanvasView({ context: 'manual', stored: { manual: 'mapa' }, isPhone: true }),
    ).toBe('lectura');
  });
});

describe('canvasViewContextOf', () => {
  it('treats a proposal and a live change as proposed, everything else as manual', () => {
    expect(canvasViewContextOf('proposed')).toBe('proposed');
    expect(canvasViewContextOf('live_change')).toBe('proposed');
    expect(canvasViewContextOf('thread')).toBe('manual');
    expect(canvasViewContextOf('expand')).toBe('manual');
    expect(canvasViewContextOf('manual')).toBe('manual');
  });
});

describe('stored views', () => {
  it('round-trips a choice per task and ignores junk', () => {
    const storage = memoryStorage();
    writeStoredCanvasView(storage, 'proposed', 'mapa');
    writeStoredCanvasView(storage, 'manual', 'lectura');
    expect(readStoredCanvasViews(storage)).toEqual({ proposed: 'mapa', manual: 'lectura' });
    storage.data.set(CANVAS_VIEW_STORAGE_KEY, '{"proposed":"zoom","manual":"lectura"}');
    expect(readStoredCanvasViews(storage)).toEqual({ manual: 'lectura' });
    storage.data.set(CANVAS_VIEW_STORAGE_KEY, 'not json');
    expect(readStoredCanvasViews(storage)).toEqual({});
  });

  it('reads a storage that throws as no preference, and a refused write as a no-op', () => {
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(readStoredCanvasViews(throwing)).toEqual({});
    expect(() => writeStoredCanvasView(throwing, 'manual', 'mapa')).not.toThrow();
    expect(readStoredCanvasViews(null)).toEqual({});
  });
});

describe('auto mode by task: auto picks per task, your last explicit pick per kind overrides', () => {
  const decide = (
    task: CanvasViewTask,
    stored: Partial<Record<'proposed' | 'manual', 'mapa' | 'lectura'>> = {},
  ) => decideCanvasView({ context: task.context, editing: task.editing, stored, isPhone: false });

  it('opens a Jaina proposal in Read and a hand-built scaffold in Map, both automatically', () => {
    const proposed = nextCanvasViewTask(
      { context: 'manual', editing: false },
      { type: 'task', context: 'proposed' },
    );
    expect(decide(proposed)).toEqual({ view: 'lectura', source: 'auto' });
    const manual = nextCanvasViewTask(proposed, { type: 'task', context: 'manual' });
    expect(decide(manual)).toEqual({ view: 'mapa', source: 'auto' });
  });

  it('switches to Map the moment the person edits, even over a remembered Read', () => {
    const editing = nextCanvasViewTask({ context: 'proposed', editing: false }, { type: 'edit' });
    expect(editing).toEqual({ context: 'manual', editing: true });
    expect(decide(editing, { manual: 'lectura', proposed: 'lectura' })).toEqual({
      view: 'mapa',
      source: 'editing',
    });
  });

  it("lets the person's pick win for that task kind from then on, and only that kind", () => {
    const stored = { proposed: 'mapa' as const };
    expect(decide({ context: 'proposed', editing: false }, stored)).toEqual({
      view: 'mapa',
      source: 'remembered',
    });
    expect(decide({ context: 'manual', editing: false }, stored).source).toBe('auto');
  });

  it('a pick ends the forced Map of an edit and keeps the task kind', () => {
    expect(nextCanvasViewTask({ context: 'manual', editing: true }, { type: 'pick' })).toEqual({
      context: 'manual',
      editing: false,
    });
  });

  it('a new task forgets the edit of the last one', () => {
    expect(
      nextCanvasViewTask(
        { context: 'manual', editing: true },
        { type: 'task', context: 'proposed' },
      ),
    ).toEqual({ context: 'proposed', editing: false });
  });

  it('phones always read, even mid-edit', () => {
    expect(
      decideCanvasView({ context: 'manual', editing: true, stored: {}, isPhone: true }).view,
    ).toBe('lectura');
  });
});

describe('the auto-switch hint', () => {
  const auto = { view: 'lectura' as const, source: 'auto' as const };

  it('explains the first auto Read of a proposal, until dismissed', () => {
    expect(canvasViewHintOf({ context: 'proposed', decision: auto, dismissed: false })).toBe(
      PROPOSED_READ_HINT,
    );
    expect(canvasViewHintOf({ context: 'proposed', decision: auto, dismissed: true })).toBeNull();
  });

  it('stays quiet when the view is the person’s own pick or the plain Map default', () => {
    expect(
      canvasViewHintOf({
        context: 'proposed',
        decision: { view: 'lectura', source: 'remembered' },
        dismissed: false,
      }),
    ).toBeNull();
    expect(
      canvasViewHintOf({
        context: 'manual',
        decision: { view: 'mapa', source: 'auto' },
        dismissed: false,
      }),
    ).toBeNull();
  });

  it('remembers a dismissal, and a storage that throws reads as not dismissed', () => {
    const storage = memoryStorage();
    expect(readCanvasViewHintDismissed(storage)).toBe(false);
    writeCanvasViewHintDismissed(storage);
    expect(readCanvasViewHintDismissed(storage)).toBe(true);
    expect(storage.data.get(CANVAS_VIEW_HINT_STORAGE_KEY)).toBe('dismissed');
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(readCanvasViewHintDismissed(throwing)).toBe(false);
    expect(() => writeCanvasViewHintDismissed(throwing)).not.toThrow();
  });
});
