import { describe, expect, test } from 'bun:test';
import type { LayerEditorLayer } from '../../types';
import { drawLayers } from './compositeLayers';

/**
 * A recording 2D context. The composite's whole contract is a SEQUENCE of context
 * calls, so the cheapest honest test of it is to record that sequence — the same idiom
 * `utils/splice/frameComposition.test.ts` uses. The pixels themselves are proved by
 * `studio:layers:e2e:bench` in a real Chrome tab.
 */
function recordingCtx() {
  const calls: string[] = [];
  const ctx = {
    _alpha: 1,
    _op: 'source-over',
    get globalAlpha() {
      return this._alpha;
    },
    set globalAlpha(value: number) {
      this._alpha = value;
      calls.push(`globalAlpha=${value}`);
    },
    get globalCompositeOperation() {
      return this._op;
    },
    set globalCompositeOperation(value: string) {
      this._op = value;
      calls.push(`gco=${value}`);
    },
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    translate: (x: number, y: number) => calls.push(`translate(${x},${y})`),
    rotate: (radians: number) => calls.push(`rotate(${radians.toFixed(4)})`),
    scale: (x: number, y: number) => calls.push(`scale(${x},${y})`),
    drawImage: (image: unknown, x: number, y: number, w: number, h: number) =>
      calls.push(`drawImage(${(image as { tag: string }).tag},${x},${y},${w},${h})`),
  };
  return { ctx, calls };
}

const layer = (id: string, patch: Partial<LayerEditorLayer> = {}): LayerEditorLayer => ({
  id,
  name: id,
  sourceNodeId: `n-${id}`,
  sourceWidth: 400,
  sourceHeight: 200,
  anchor: { x: 200, y: 100 },
  position: { x: 1024, y: 1024 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  opacity: 1,
  blendMode: 'normal',
  visible: true,
  locked: false,
  ...patch,
});

const images = (...tags: string[]): Map<string, CanvasImageSource> =>
  new Map(tags.map((tag) => [tag, { tag } as unknown as CanvasImageSource]));

const drawOrder = (calls: string[]): string[] =>
  calls.filter((call) => call.startsWith('drawImage')).map((call) => call.split(',')[0].slice(10));

describe('paint order', () => {
  test('is the ARRAY order, bottom first — index 0 paints first', () => {
    const { ctx, calls } = recordingCtx();
    // biome-ignore lint/suspicious/noExplicitAny: a recording double, not a real context
    drawLayers(
      ctx as any,
      [layer('bottom'), layer('middle'), layer('top')],
      images('bottom', 'middle', 'top'),
    );
    expect(drawOrder(calls)).toEqual(['bottom', 'middle', 'top']);
  });

  test('every layer is wrapped in its own save/restore', () => {
    const { ctx, calls } = recordingCtx();
    // biome-ignore lint/suspicious/noExplicitAny: a recording double, not a real context
    drawLayers(ctx as any, [layer('a'), layer('b')], images('a', 'b'));
    expect(calls.filter((call) => call === 'save')).toHaveLength(2);
    expect(calls.filter((call) => call === 'restore')).toHaveLength(2);
    expect(calls[0]).toBe('save');
    expect(calls.at(-1)).toBe('restore');
  });

  test('an invisible layer is skipped and does not renumber the rest', () => {
    const { ctx, calls } = recordingCtx();
    const result = drawLayers(
      // biome-ignore lint/suspicious/noExplicitAny: a recording double, not a real context
      ctx as any,
      [layer('a'), layer('hidden', { visible: false }), layer('c')],
      images('a', 'hidden', 'c'),
    );
    expect(drawOrder(calls)).toEqual(['a', 'c']);
    expect(result.drawn).toEqual(['a', 'c']);
    expect(result.missing).toEqual([]);
  });

  test('a LOCKED layer still renders — lock is an editing affordance, not a render flag', () => {
    const { ctx, calls } = recordingCtx();
    // biome-ignore lint/suspicious/noExplicitAny: a recording double, not a real context
    drawLayers(ctx as any, [layer('locked', { locked: true })], images('locked'));
    expect(drawOrder(calls)).toEqual(['locked']);
  });

  test('a layer with no pixels is REPORTED, not silently dropped', () => {
    const { ctx, calls } = recordingCtx();
    // biome-ignore lint/suspicious/noExplicitAny: a recording double, not a real context
    const result = drawLayers(ctx as any, [layer('a'), layer('gone')], images('a'));
    expect(drawOrder(calls)).toEqual(['a']);
    expect(result.missing).toEqual(['gone']);
  });
});

describe('the per-layer transform is the aep-interop §4.3 sequence', () => {
  test('translate(position) -> rotate -> scale -> drawImage(-anchor)', () => {
    const { ctx, calls } = recordingCtx();
    drawLayers(
      // biome-ignore lint/suspicious/noExplicitAny: a recording double, not a real context
      ctx as any,
      [layer('a', { position: { x: 1500, y: 1300 }, anchor: { x: 0, y: 0 }, rotation: 90 })],
      images('a'),
    );
    expect(calls).toEqual([
      'save',
      'globalAlpha=1',
      'gco=source-over',
      'translate(1500,1300)',
      `rotate(${(Math.PI / 2).toFixed(4)})`,
      'scale(1,1)',
      'drawImage(a,0,0,400,200)',
      'restore',
    ]);
  });

  test('the draw offset is the NEGATED anchor — that IS the pivot mechanism', () => {
    const { ctx, calls } = recordingCtx();
    // biome-ignore lint/suspicious/noExplicitAny: a recording double, not a real context
    drawLayers(ctx as any, [layer('a', { anchor: { x: 320, y: 40 } })], images('a'));
    expect(calls).toContain('drawImage(a,-320,-40,400,200)');
    // and NOT the frame centre, which is what applyCanvasTransform would use
    expect(calls.some((call) => call.includes('translate(1024,1024)'))).toBe(true);
    expect(calls.some((call) => call.startsWith('drawImage(a,-200,-100'))).toBe(false);
  });

  test('rotation of zero still emits no rotate call, and the rest is unchanged', () => {
    const { ctx, calls } = recordingCtx();
    // biome-ignore lint/suspicious/noExplicitAny: a recording double, not a real context
    drawLayers(ctx as any, [layer('a')], images('a'));
    expect(calls.some((call) => call.startsWith('rotate'))).toBe(false);
  });

  test('a negative axis scale reaches the context verbatim — the flip is the scale', () => {
    const { ctx, calls } = recordingCtx();
    // biome-ignore lint/suspicious/noExplicitAny: a recording double, not a real context
    drawLayers(ctx as any, [layer('a', { scale: { x: -1.5, y: 2 } })], images('a'));
    expect(calls).toContain('scale(-1.5,2)');
  });
});

describe('opacity and blend', () => {
  test('opacity rides globalAlpha, 0..1, per layer', () => {
    const { ctx, calls } = recordingCtx();
    // biome-ignore lint/suspicious/noExplicitAny: a recording double, not a real context
    drawLayers(
      ctx as any,
      [layer('a', { opacity: 0.5 }), layer('b', { opacity: 1 })],
      images('a', 'b'),
    );
    expect(calls.filter((call) => call.startsWith('globalAlpha'))).toEqual([
      'globalAlpha=0.5',
      'globalAlpha=1',
    ]);
  });

  test('`normal` maps to source-over; every other member is spelled identically', () => {
    const { ctx, calls } = recordingCtx();
    drawLayers(
      // biome-ignore lint/suspicious/noExplicitAny: a recording double, not a real context
      ctx as any,
      [
        layer('a', { blendMode: 'normal' }),
        layer('b', { blendMode: 'multiply' }),
        layer('c', { blendMode: 'difference' }),
      ],
      images('a', 'b', 'c'),
    );
    expect(calls.filter((call) => call.startsWith('gco='))).toEqual([
      'gco=source-over',
      'gco=multiply',
      'gco=difference',
    ]);
  });
});
