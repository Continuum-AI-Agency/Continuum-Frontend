import { describe, expect, it } from 'bun:test';
import { LOOK_EFFECT_IDS, lookEffectInstance } from '@continuum/contracts';
import { clipEffectSpecFromEditorClip } from '@/lib/client-render/executors/timelineEditor';
import {
  type ClipEffectSpec,
  cornerRadiusFracFor,
  filterString,
  resolveAdjustments,
} from '../render/effectSpec';

// Every look in LOOK_EFFECTS, through the REAL export draw (drawClipFrame → prepareSource),
// on a canvas stand-in that only copies pixels. bun has no WebGPU, so a look that reached
// for the GPU would throw here; a look drawn twice would not match one application of the
// pixel pass. The filter looks (a CSS `filter` on the context) and the frame looks (corner
// radius) are asserted at the seam that draws them.

const W = 128;
const H = 96;

class FakeCanvas {
  data: Uint8ClampedArray;
  constructor(
    public width: number,
    public height: number,
  ) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }
  getContext() {
    return new FakeContext(this);
  }
}

class FakeContext {
  filter = 'none';
  globalAlpha = 1;
  globalCompositeOperation = 'source-over';
  imageSmoothingEnabled = true;
  fillStyle = '#000';
  constructor(readonly canvas: FakeCanvas) {}
  setTransform() {}
  save() {}
  restore() {}
  translate() {}
  rotate() {}
  scale() {}
  beginPath() {}
  roundRect() {}
  clip() {}
  clearRect() {
    this.canvas.data.fill(0);
  }
  fillRect() {}
  drawImage(source: FakeCanvas, dx: number, dy: number, dw: number, dh: number) {
    // Nearest-neighbour resample into the destination rect (pixelate's down/up scale).
    for (let y = 0; y < dh; y += 1) {
      for (let x = 0; x < dw; x += 1) {
        const sx = Math.min(source.width - 1, Math.floor((x * source.width) / dw));
        const sy = Math.min(source.height - 1, Math.floor((y * source.height) / dh));
        const from = (sy * source.width + sx) * 4;
        const to = ((dy + y) * this.canvas.width + dx + x) * 4;
        this.canvas.data.set(source.data.subarray(from, from + 4), to);
      }
    }
  }
  getImageData(_x: number, _y: number, width: number, height: number) {
    return { data: new Uint8ClampedArray(this.canvas.data), width, height } as ImageData;
  }
  putImageData(image: ImageData) {
    this.canvas.data.set(image.data);
  }
}

(globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = FakeCanvas;
const { applyPixelEffects, drawClipFrame, pixelLooks } = await import('./frameDraw');

/** A gradient, so displacement and mosaics have something to move. */
function source(): FakeCanvas {
  const canvas = new FakeCanvas(W, H);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      canvas.data.set([40 + x, 60 + y * 2, 180 - x, 255], (y * W + x) * 4);
    }
  }
  return canvas;
}

const specFor = (effectId: (typeof LOOK_EFFECT_IDS)[number]): ClipEffectSpec =>
  clipEffectSpecFromEditorClip({
    timelineStartSec: 0,
    durationSec: 2,
    transform: {
      position: { x: 0.5, y: 0.5 },
      scaleX: 1,
      scaleY: 1,
      rotationDeg: 0,
      opacity: 1,
    },
    effects: [lookEffectInstance(effectId, { id: 'look', strength: 0.6 })],
  });

async function exported(spec: ClipEffectSpec, t = 0.25): Promise<Uint8ClampedArray> {
  const target = new FakeCanvas(W, H);
  await drawClipFrame(
    target.getContext() as unknown as OffscreenCanvasRenderingContext2D,
    source() as unknown as CanvasImageSource,
    W,
    H,
    W,
    H,
    spec,
    t,
  );
  return target.data;
}

/** The pixel pass applied ONCE to the source — what a single draw of the look is. */
function once(spec: ClipEffectSpec, t = 0.25): Uint8ClampedArray {
  const image = { data: new Uint8ClampedArray(source().data), width: W, height: H } as ImageData;
  applyPixelEffects(image, pixelLooks(spec, t), W, H, t);
  return image.data;
}

const PIXEL_LOOKS = new Set([
  'tint',
  'vignette',
  'film_grain',
  'chromatic_aberration',
  'vhs',
  'chroma_key',
]);

describe('LOOK_EFFECTS on the export draw', () => {
  for (const effectId of LOOK_EFFECT_IDS) {
    it(`${effectId} draws exactly once and needs no GPU`, async () => {
      const spec = specFor(effectId);
      const drawn = await exported(spec);
      if (PIXEL_LOOKS.has(effectId)) {
        expect([...drawn]).toEqual([...once(spec)]);
        expect([...drawn]).not.toEqual([...source().data]);
      } else if (effectId === 'pixelate') {
        expect(spec.pixelate?.blockPx).toBeGreaterThanOrEqual(2);
        expect([...drawn]).not.toEqual([...source().data]);
      } else if (effectId === 'corner_radius') {
        expect(cornerRadiusFracFor(spec)).toBeGreaterThan(0);
      } else {
        // bw … dream and blur: a CSS filter on the context, the same string in both places.
        expect(filterString(resolveAdjustments(spec))).not.toBe('');
        expect([...drawn]).toEqual([...source().data]);
      }
    });
  }

  it("a canvas shader node's deferred stack draws through the same pass, keyframes sampled", async () => {
    const stack: ClipEffectSpec = {
      shaderStack: {
        version: 1,
        effects: [
          {
            effectId: 'tint',
            enabled: true,
            parameters: { color: '#ff7a00', amount: 0.2 },
            keyframes: [
              {
                id: 'k',
                property: 'effect.parameter',
                parameterName: 'amount',
                timeSec: 1,
                value: 0.8,
                interpolation: 'linear',
              },
            ],
          },
        ],
      },
    };
    expect(pixelLooks(stack, 0.5).tint).toEqual({ color: '#ff7a00', amount: 0.8 });
    expect([...(await exported(stack, 0.5))]).toEqual([...once(stack, 0.5)]);
    // The clip's own field wins over a stack entry for the same look.
    expect(pixelLooks({ ...stack, tint: { color: '#00ff00', amount: 0.3 } }, 0.5).tint).toEqual({
      color: '#00ff00',
      amount: 0.3,
    });
  });
});
