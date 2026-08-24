import { describe, expect, it } from 'bun:test';
import { DEFAULT_CAPTION_STYLE } from '@/lib/clips/clipCaptionStyle';
import type { CaptionCue, CaptionWord } from './captionCues';
import { drawActiveCaption, wrapWords } from './drawCaptions';

const w = (text: string): CaptionWord => ({ text, startSec: 0, endSec: 1 });
// Fake measure: each character is 10px wide; a space is 10px.
const measure = (text: string) => text.length * 10;
const SPACE = 10;

describe('wrapWords', () => {
  it('keeps words on one line when they fit', () => {
    const lines = wrapWords(measure, [w('ab'), w('cd')], 100, SPACE);
    expect(lines).toHaveLength(1);
    expect(lines[0].map((x) => x.text)).toEqual(['ab', 'cd']);
  });

  it('wraps to a new line when the next word overflows maxWidth', () => {
    // "ab"(20) + space(10) + "cd"(20) = 50 fits; adding " ef"(10+20) = 80 > 70
    const lines = wrapWords(measure, [w('ab'), w('cd'), w('ef')], 70, SPACE);
    expect(lines.map((l) => l.map((x) => x.text))).toEqual([['ab', 'cd'], ['ef']]);
  });

  it('gives an over-wide single word its own line rather than dropping it', () => {
    const lines = wrapWords(measure, [w('supercalifragilistic')], 50, SPACE);
    expect(lines).toHaveLength(1);
    expect(lines[0][0].text).toBe('supercalifragilistic');
  });

  it('returns no lines for an empty cue', () => {
    expect(wrapWords(measure, [], 100, SPACE)).toEqual([]);
  });
});

// ── A recording 2D context ────────────────────────────────────────────────────────────
// Character widths scale with the parsed font px so the layout maths is checkable by hand.

type Op = { op: string; args: unknown[]; font?: string; fillStyle?: string; alpha?: number };

function fakeCtx() {
  const ops: Op[] = [];
  const measured: string[] = [];
  const state = { font: '', fillStyle: '', strokeStyle: '', globalAlpha: 1 };
  const stack: (typeof state)[] = [];
  const ctx = {
    get font() {
      return state.font;
    },
    set font(value: string) {
      state.font = value;
    },
    get fillStyle() {
      return state.fillStyle;
    },
    set fillStyle(value: string) {
      state.fillStyle = value;
    },
    get strokeStyle() {
      return state.strokeStyle;
    },
    set strokeStyle(value: string) {
      state.strokeStyle = value;
    },
    get globalAlpha() {
      return state.globalAlpha;
    },
    set globalAlpha(value: number) {
      state.globalAlpha = value;
    },
    textBaseline: '',
    lineJoin: '',
    lineWidth: 0,
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetY: 0,
    measureText(text: string) {
      measured.push(text);
      const px = Number(state.font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 10);
      return {
        width: text.length * px * 0.5,
        fontBoundingBoxAscent: px * 0.8,
        fontBoundingBoxDescent: px * 0.2,
      };
    },
    save() {
      stack.push({ ...state });
      ops.push({ op: 'save', args: [] });
    },
    restore() {
      const previous = stack.pop();
      if (previous) Object.assign(state, previous);
      ops.push({ op: 'restore', args: [] });
    },
    translate: (...args: unknown[]) => ops.push({ op: 'translate', args }),
    scale: (...args: unknown[]) => ops.push({ op: 'scale', args }),
    beginPath: () => ops.push({ op: 'beginPath', args: [] }),
    roundRect: (...args: unknown[]) => ops.push({ op: 'roundRect', args }),
    fill: () => ops.push({ op: 'fill', args: [] }),
    fillRect: (...args: unknown[]) =>
      ops.push({ op: 'fillRect', args, fillStyle: state.fillStyle, alpha: state.globalAlpha }),
    strokeText: (...args: unknown[]) => ops.push({ op: 'strokeText', args, font: state.font }),
    fillText: (...args: unknown[]) =>
      ops.push({
        op: 'fillText',
        args,
        font: state.font,
        fillStyle: state.fillStyle,
        alpha: state.globalAlpha,
      }),
  };
  return { ctx, ops, measured, state };
}

type Ctx = Parameters<typeof drawActiveCaption>[0];

const cueOf = (words: CaptionWord[], startSec = 0, endSec = 4): CaptionCue => ({
  id: 'c1',
  startSec,
  endSec,
  words,
});

const W = 1080;
const H = 1920;

const fillTexts = (ops: Op[]) => ops.filter((o) => o.op === 'fillText');
const strokeTexts = (ops: Op[]) => ops.filter((o) => o.op === 'strokeText');

describe('drawActiveCaption — measurement cost', () => {
  it('measures once per cue, NOT once per word per frame', () => {
    // The transform made this a prerequisite: measureText forces text shaping, and these
    // widths cannot change with t. If this ever regresses, the frame budget goes with it.
    const words = [w('alpha'), w('beta'), w('gamma'), w('delta')];
    const cue = cueOf(words);
    const { ctx, measured } = fakeCtx();
    drawActiveCaption(ctx as unknown as Ctx, cue, 0.5, W, H, DEFAULT_CAPTION_STYLE);
    // four words + the space probe + the 'Hg' font-metric probe
    expect(measured).toEqual(['alpha', 'beta', 'gamma', 'delta', ' ', 'Hg']);
  });

  it('costs the same per frame no matter how many frames are drawn', () => {
    const cue = cueOf([w('one'), w('two')]);
    const perFrame: number[] = [];
    for (const t of [0.1, 0.5, 0.9]) {
      const { ctx, measured } = fakeCtx();
      drawActiveCaption(ctx as unknown as Ctx, cue, t, W, H, DEFAULT_CAPTION_STYLE);
      perFrame.push(measured.length);
    }
    expect(new Set(perFrame).size).toBe(1);
  });
});

describe('drawActiveCaption — uppercase', () => {
  it('measures AND draws the upper-cased glyphs, never one and then the other', () => {
    // Measuring the lower-case string and drawing the upper-case one wraps wrong.
    const cue = cueOf([w('hello')]);
    const { ctx, ops, measured } = fakeCtx();
    drawActiveCaption(ctx as unknown as Ctx, cue, 0.5, W, H, {
      ...DEFAULT_CAPTION_STYLE,
      uppercase: true,
    });
    expect(measured).toContain('HELLO');
    expect(measured).not.toContain('hello');
    expect(fillTexts(ops)[0].args[0]).toBe('HELLO');
  });

  it('leaves casing alone by default', () => {
    const { ctx, ops } = fakeCtx();
    drawActiveCaption(ctx as unknown as Ctx, cueOf([w('hello')]), 0.5, W, H, DEFAULT_CAPTION_STYLE);
    expect(fillTexts(ops)[0].args[0]).toBe('hello');
  });
});

describe('drawActiveCaption — layout uses un-animated widths', () => {
  it('advances the cursor identically whether or not a word is mid-pop', () => {
    // The single most likely bug in the whole feature: if a scaled word advanced the
    // cursor, every word after it would jitter horizontally on every frame.
    const cue = cueOf([
      { text: 'aaa', startSec: 0, endSec: 0.5 },
      { text: 'bbb', startSec: 0.5, endSec: 1 },
      { text: 'ccc', startSec: 1, endSec: 1.5 },
    ]);
    const style = {
      ...DEFAULT_CAPTION_STYLE,
      animation: { kind: 'pop', durationSec: 0.18, amplitude: 0.28 } as const,
    };
    const xsAt = (t: number) => {
      const { ctx, ops } = fakeCtx();
      drawActiveCaption(ctx as unknown as Ctx, cue, t, W, H, style);
      return fillTexts(ops).map((o) => o.args[1]);
    };
    // t=0.55 has "bbb" mid-pop; t=1.4 has everything settled.
    expect(xsAt(0.55)).toEqual(xsAt(1.4));
  });

  it('still applies the scale transform to the popping word', () => {
    const cue = cueOf([{ text: 'aaa', startSec: 1, endSec: 2 }]);
    const { ctx, ops } = fakeCtx();
    drawActiveCaption(ctx as unknown as Ctx, cue, 1 + 0.099, W, H, {
      ...DEFAULT_CAPTION_STYLE,
      animation: { kind: 'pop', durationSec: 0.18, amplitude: 0.28 },
    });
    const scale = ops.find((o) => o.op === 'scale');
    expect(scale?.args[0]).toBeCloseTo(1.14, 6);
  });

  it('scales about the word centre, not the frame centre', () => {
    const cue = cueOf([{ text: 'aaa', startSec: 1, endSec: 2 }]);
    const { ctx, ops } = fakeCtx();
    drawActiveCaption(ctx as unknown as Ctx, cue, 1.05, W, H, {
      ...DEFAULT_CAPTION_STYLE,
      animation: { kind: 'pop' },
    });
    const translates = ops.filter((o) => o.op === 'translate');
    const [inX, inY] = translates[0].args as [number, number];
    const [outX, outY] = translates[1].args as [number, number];
    // The pair must be exact negatives (no dx/dy on pop), and centred on the word.
    expect(inX).toBeCloseTo(-outX, 6);
    expect(inY).toBeCloseTo(-outY, 6);
    expect(inX).toBeGreaterThan(0);
    expect(inX).toBeLessThan(W);
  });
});

describe('drawActiveCaption — classic stays byte-identical', () => {
  const cue = cueOf([
    { text: 'one', startSec: 0, endSec: 0.5 },
    { text: 'two', startSec: 0.5, endSec: 1 },
  ]);

  it('strokes then fills every word, in that order', () => {
    const { ctx, ops } = fakeCtx();
    drawActiveCaption(ctx as unknown as Ctx, cue, 0.2, W, H, DEFAULT_CAPTION_STYLE);
    const textOps = ops.filter((o) => o.op === 'strokeText' || o.op === 'fillText');
    expect(textOps.map((o) => o.op)).toEqual(['strokeText', 'fillText', 'strokeText', 'fillText']);
  });

  it('applies the karaoke highlight to exactly the spoken word', () => {
    const { ctx, ops } = fakeCtx();
    drawActiveCaption(ctx as unknown as Ctx, cue, 0.2, W, H, DEFAULT_CAPTION_STYLE);
    expect(fillTexts(ops).map((o) => o.fillStyle)).toEqual(['#ffd400', '#ffffff']);
  });

  it('sets no shadow and draws no rounded box', () => {
    const { ctx, ops } = fakeCtx();
    drawActiveCaption(ctx as unknown as Ctx, cue, 0.2, W, H, DEFAULT_CAPTION_STYLE);
    expect(ctx.shadowColor).toBe('');
    expect(ops.some((o) => o.op === 'roundRect')).toBe(false);
  });

  it('draws a square per-line background when a background colour is set', () => {
    const { ctx, ops } = fakeCtx();
    drawActiveCaption(ctx as unknown as Ctx, cue, 0.2, W, H, {
      ...DEFAULT_CAPTION_STYLE,
      backgroundColor: '#000000',
    });
    const rects = ops.filter((o) => o.op === 'fillRect');
    expect(rects).toHaveLength(1); // one LINE, not one per word
    expect(rects[0].alpha).toBeCloseTo(0.8, 6);
    expect(ops.some((o) => o.op === 'roundRect')).toBe(false);
  });

  it('draws no words at all when the cue is empty', () => {
    const { ctx, ops } = fakeCtx();
    drawActiveCaption(ctx as unknown as Ctx, cueOf([]), 0.2, W, H, DEFAULT_CAPTION_STYLE);
    expect(fillTexts(ops)).toHaveLength(0);
  });
});

describe('drawActiveCaption — emphasis', () => {
  const cue = cueOf([
    { text: 'you', startSec: 0, endSec: 0.4 },
    { text: 'never', startSec: 0.4, endSec: 0.9, emphasis: true },
    { text: 'lose', startSec: 0.9, endSec: 1.4 },
  ]);

  it('fills an emphasised word with the emphasis colour and its neighbours with the text colour', () => {
    const { ctx, ops } = fakeCtx();
    drawActiveCaption(ctx as unknown as Ctx, cue, 1.2, W, H, {
      ...DEFAULT_CAPTION_STYLE,
      activeWordMode: 'none',
      emphasis: { color: '#ffd93d' },
    });
    expect(fillTexts(ops).map((o) => o.fillStyle)).toEqual(['#ffffff', '#ffd93d', '#ffffff']);
  });

  it('lets the spoken word win over emphasis while it is actually being spoken', () => {
    // Active is momentary; emphasis lasts the word's life. Three colours on one word is
    // three signals fighting, so one of them has to yield.
    const { ctx, ops } = fakeCtx();
    drawActiveCaption(ctx as unknown as Ctx, cue, 0.5, W, H, {
      ...DEFAULT_CAPTION_STYLE,
      emphasis: { color: '#ffd93d' },
    });
    expect(fillTexts(ops)[1].fillStyle).toBe('#ffd400');
  });

  it('multiplies emphasis scale on top of the entry animation, never instead of it', () => {
    const { ctx, ops } = fakeCtx();
    drawActiveCaption(ctx as unknown as Ctx, cue, 3, W, H, {
      ...DEFAULT_CAPTION_STYLE,
      animation: { kind: 'pop', durationSec: 0.18 },
      emphasis: { scale: 1.1 },
    });
    const scales = ops.filter((o) => o.op === 'scale').map((o) => o.args[0] as number);
    expect(scales[0]).toBeCloseTo(1, 6);
    expect(scales[1]).toBeCloseTo(1.1, 6); // settled entry (1.0) x emphasis (1.1)
    expect(scales[2]).toBeCloseTo(1, 6);
  });

  it('draws an emphasised word in the heavier variable weight', () => {
    const { ctx, ops } = fakeCtx();
    drawActiveCaption(ctx as unknown as Ctx, cue, 1.2, W, H, {
      ...DEFAULT_CAPTION_STYLE,
      fontWeight: 600,
      emphasis: { weight: 800 },
    });
    const fonts = fillTexts(ops).map((o) => o.font);
    expect(fonts[0]).toContain('600 ');
    expect(fonts[1]).toContain('800 ');
    expect(fonts[2]).toContain('600 ');
  });

  it('measures an emphasised word in ITS OWN font, or the heavier glyphs overlap', () => {
    const { ctx, measured } = fakeCtx();
    const seen: string[] = [];
    drawActiveCaption(ctx as unknown as Ctx, cue, 1.2, W, H, {
      ...DEFAULT_CAPTION_STYLE,
      fontWeight: 600,
      emphasis: { weight: 800 },
    });
    seen.push(...measured);
    expect(seen).toEqual(['you', 'never', 'lose', ' ', 'Hg']);
  });
});

describe('drawActiveCaption — presets that need the new fields', () => {
  const cue = cueOf([
    { text: 'aa', startSec: 0, endSec: 0.5 },
    { text: 'bb', startSec: 0.5, endSec: 1 },
  ]);

  it('skips the stroke entirely for a no-outline preset', () => {
    // The historical max(2, ...) floor would paint a 2px hairline nobody asked for.
    const { ctx, ops } = fakeCtx();
    drawActiveCaption(ctx as unknown as Ctx, cue, 0.2, W, H, {
      ...DEFAULT_CAPTION_STYLE,
      outlineWidthFrac: 0,
      outlineColor: 'rgba(0,0,0,0)',
    });
    expect(strokeTexts(ops)).toHaveLength(0);
    expect(fillTexts(ops)).toHaveLength(2);
  });

  it('draws one rounded box PER WORD in word background mode', () => {
    const { ctx, ops } = fakeCtx();
    drawActiveCaption(ctx as unknown as Ctx, cue, 0.2, W, H, {
      ...DEFAULT_CAPTION_STYLE,
      backgroundColor: '#06120a',
      backgroundMode: 'word',
      backgroundRadiusFrac: 0.1,
    });
    expect(ops.filter((o) => o.op === 'roundRect')).toHaveLength(2);
    expect(ops.filter((o) => o.op === 'fillRect')).toHaveLength(0);
  });

  it('boxes only the spoken word under activeWordMode box', () => {
    const { ctx, ops } = fakeCtx();
    drawActiveCaption(ctx as unknown as Ctx, cue, 0.2, W, H, {
      ...DEFAULT_CAPTION_STYLE,
      backgroundMode: 'none',
      activeWordMode: 'box',
      activeBoxColor: '#ffd400',
      backgroundRadiusFrac: 0.2,
    });
    expect(ops.filter((o) => o.op === 'roundRect')).toHaveLength(1);
  });

  it('clears the shadow between stroke and fill so it is not painted twice', () => {
    const { ctx, ops } = fakeCtx();
    drawActiveCaption(ctx as unknown as Ctx, cue, 0.2, W, H, {
      ...DEFAULT_CAPTION_STYLE,
      shadow: { color: 'rgba(0,0,0,0.55)', blurFrac: 0.14, offsetYFrac: 0.05 },
    });
    // The last thing set before a fill must be the transparent shadow.
    expect(ctx.shadowColor).toBe('transparent');
    expect(ctx.shadowBlur).toBeGreaterThan(0);
    expect(strokeTexts(ops)).toHaveLength(2);
  });

  it('hides a word before its own start under reveal word, without moving its neighbours', () => {
    const style = { ...DEFAULT_CAPTION_STYLE, animation: { kind: 'pop', reveal: 'word' } as const };
    const { ctx: early, ops: earlyOps } = fakeCtx();
    drawActiveCaption(early as unknown as Ctx, cue, 0.2, W, H, style);
    expect(fillTexts(earlyOps).map((o) => o.args[0])).toEqual(['aa']);

    const { ctx: late, ops: lateOps } = fakeCtx();
    drawActiveCaption(late as unknown as Ctx, cue, 0.8, W, H, style);
    expect(fillTexts(lateOps).map((o) => o.args[0])).toEqual(['aa', 'bb']);
    // "aa" must not have shifted when "bb" appeared — layout comes from ALL words.
    expect(fillTexts(lateOps)[0].args[1]).toBe(fillTexts(earlyOps)[0].args[1]);
  });

  it('honours lineHeightFactor when stacking wrapped lines', () => {
    const many = Array.from({ length: 12 }, (_, i) => w(`word${i}`));
    const baselinesFor = (lineHeightFactor: number) => {
      const { ctx, ops } = fakeCtx();
      drawActiveCaption(ctx as unknown as Ctx, cueOf(many), 0.5, W, H, {
        ...DEFAULT_CAPTION_STYLE,
        lineHeightFactor,
      });
      return [...new Set(fillTexts(ops).map((o) => o.args[2] as number))];
    };
    const tight = baselinesFor(1.05);
    const loose = baselinesFor(1.6);
    expect(tight.length).toBeGreaterThan(1);
    expect(loose[1] - loose[0]).toBeGreaterThan(tight[1] - tight[0]);
  });

  it('never emits a non-finite coordinate for a degenerate cue', () => {
    const { ctx, ops } = fakeCtx();
    drawActiveCaption(
      ctx as unknown as Ctx,
      cueOf([{ text: 'x', startSec: Number.NaN, endSec: Number.NaN }]),
      0.5,
      W,
      H,
      { ...DEFAULT_CAPTION_STYLE, animation: { kind: 'pop' } },
    );
    for (const op of ops) {
      for (const arg of op.args) {
        if (typeof arg === 'number') expect(Number.isFinite(arg)).toBe(true);
      }
    }
  });
});
