import { describe, expect, it } from 'bun:test';
import {
  CANVAS_VIEW_STORAGE_KEY,
  canvasViewContextOf,
  readStoredCanvasViews,
  resolveCanvasView,
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
