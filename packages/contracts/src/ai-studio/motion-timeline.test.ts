import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { editorKeyframeSchema } from './editor-project-v2';
import { cubicBezierProgress, MOTION_BEZIER_PRESETS, springProgress } from './motion-eval';
import { EASE_OUT } from './motion-presets';
import {
  applyMotionOp,
  applyMotionOpsToHtml,
  compileMotionCss,
  diffMotion,
  type EditorEase,
  EMPTY_MOTION_DOC,
  easeKeyframes,
  editorKeyframeFromKeyInput,
  getMotionInputSchema,
  hyperframesMotionCommitRequestSchema,
  isValidMotionTarget,
  keyframeClipInputSchema,
  type MotionDoc,
  type MotionOpInput,
  MotionTimelineError,
  motionAnimationWindow,
  motionDocSchema,
  motionTargetSchema,
  parseMotionDoc,
  readMotionFromHtml,
  retimeKeyframes,
  retimeMotionInputSchema,
  sampleMotion,
  splitTextInHtml,
  staggerClipsInputSchema,
  staggerOffsets,
  stripMotionBlocks,
  validateRetimeMotionInput,
  writeMotionToHtml,
} from './motion-timeline';

const context = { width: 1080, height: 1920, fps: 30, durationSec: 4 };
const apply = (doc: MotionDoc, ...ops: MotionOpInput[]) =>
  ops.reduce((current, op) => applyMotionOp(current, op, context), doc);
const refusal = (run: () => unknown, pattern: RegExp) => {
  expect(run).toThrow(MotionTimelineError);
  expect(run).toThrow(pattern);
};

const fadeKeys: MotionOpInput = {
  type: 'add_animation',
  id: 'fade',
  label: 'Fade',
  targets: ['title'],
  startSec: 0.5,
  tracks: [
    {
      property: 'transform.opacity',
      keys: [
        { t: 0, v: 0, ease: 'easeOut' },
        { t: 0.5, v: 1 },
      ],
    },
  ],
};
const fadeDoc = () => apply(EMPTY_MOTION_DOC, fadeKeys);
const animation = (doc: MotionDoc, id: string) => {
  const found = doc.animations.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
};

describe('add_animation', () => {
  test('a preset expands through motionPresetKeyframes, position fractions to px', () => {
    const doc = apply(EMPTY_MOTION_DOC, {
      type: 'add_animation',
      label: 'Slide in',
      targets: ['card'],
      preset: 'slide_in_left',
    });
    const slide = animation(doc, 'slide-in');
    const position = slide.tracks.find((track) => track.property === 'transform.position');
    expect(position?.keyframes.map((key) => key.value)).toEqual([
      { x: -648, y: 0 },
      { x: 0, y: 0 },
    ]);
    expect(position?.keyframes[0]).toMatchObject({ interpolation: 'bezier', easing: EASE_OUT });
    const opacity = slide.tracks.find((track) => track.property === 'transform.opacity');
    expect(opacity?.keyframes.map((key) => [key.timeSec, key.value])).toEqual([
      [0, 0],
      [0.2, 1],
    ]);
  });

  test('a whole-clip preset without a duration runs to the end of the composition', () => {
    const doc = apply(EMPTY_MOTION_DOC, {
      type: 'add_animation',
      label: 'Drift',
      targets: ['bg'],
      startSec: 1,
      preset: 'ken_burns',
    });
    expect(motionAnimationWindow(animation(doc, 'drift'))).toEqual({ startSec: 1, endSec: 4 });
  });

  test('a preset on a 64-character animation id keeps valid key ids', () => {
    const id = 'a'.repeat(64);
    const doc = apply(EMPTY_MOTION_DOC, {
      type: 'add_animation',
      id,
      label: 'Long',
      targets: ['card'],
      preset: 'pop',
    });
    expect(animation(doc, id).tracks[0]?.keyframes[0]?.id).toBe(`${id}-0-0`);
    refusal(
      () =>
        apply(EMPTY_MOTION_DOC, {
          type: 'add_animation',
          label: 'Late drift',
          targets: ['bg'],
          startSec: 4,
          preset: 'ken_burns',
        }),
      /ken_burns would start after the composition ends/,
    );
  });

  test('hand-written tracks are sorted, keyed k0…, and carry their ease', () => {
    const doc = apply(EMPTY_MOTION_DOC, {
      type: 'add_animation',
      label: 'Spin',
      targets: ['logo'],
      tracks: [
        {
          property: 'transform.rotationDeg',
          keys: [
            { t: 1, v: 90 },
            { t: 0, v: 0, ease: 'crashIn' },
          ],
        },
      ],
    });
    expect(animation(doc, 'spin').tracks[0]?.keyframes).toEqual([
      {
        id: 'k0',
        property: 'transform.rotationDeg',
        timeSec: 0,
        value: 0,
        interpolation: 'linear',
        ease: 'crashIn',
      },
      {
        id: 'k1',
        property: 'transform.rotationDeg',
        timeSec: 1,
        value: 90,
        interpolation: 'linear',
      },
    ]);
  });

  test('a blur track is effect.parameter "blur"', () => {
    const doc = apply(EMPTY_MOTION_DOC, {
      type: 'add_animation',
      label: 'Focus',
      targets: ['bg'],
      tracks: [
        {
          property: 'effect.parameter',
          keys: [
            { t: 0, v: 12 },
            { t: 1, v: 0 },
          ],
        },
      ],
    });
    expect(animation(doc, 'focus').tracks[0]?.keyframes[0]?.parameterName).toBe('blur');
  });

  test('ids are slugged from the label and never collide', () => {
    const doc = apply(EMPTY_MOTION_DOC, fadeKeys, { ...fadeKeys, id: undefined, label: 'Fade' });
    expect(doc.animations.map((candidate) => candidate.id)).toEqual(['fade', 'fade-2']);
    refusal(() => apply(doc, fadeKeys), /already exists/);
  });

  test('refuses an animation that ends after the composition', () => {
    refusal(
      () => apply(EMPTY_MOTION_DOC, { ...fadeKeys, startSec: 3.8 }),
      /would end at 4.3s, after the composition ends at 4s/,
    );
  });

  test('refuses a preset and tracks together, or neither', () => {
    refusal(
      () => apply(EMPTY_MOTION_DOC, { ...fadeKeys, preset: 'fade_in' }),
      /either a preset or tracks/,
    );
    const { tracks: _tracks, ...bare } = fadeKeys as Extract<
      MotionOpInput,
      { type: 'add_animation' }
    >;
    refusal(() => apply(EMPTY_MOTION_DOC, bare), /either a preset or tracks/);
  });

  test('refuses every property CSS motion does not compile, by name', () => {
    refusal(
      () =>
        apply(EMPTY_MOTION_DOC, {
          ...fadeKeys,
          tracks: [
            {
              property: 'transform.rotateXDeg' as 'transform.opacity',
              keys: [
                { t: 0, v: 0 },
                { t: 1, v: 1 },
              ],
            },
          ],
        }),
      /transform\.rotateXDeg cannot be animated: motion supports transform\.position/,
    );
  });

  test('refuses position keys that are not points, and opacity outside 0..1', () => {
    refusal(
      () =>
        apply(EMPTY_MOTION_DOC, {
          ...fadeKeys,
          tracks: [
            {
              property: 'transform.position',
              keys: [
                { t: 0, v: 1 },
                { t: 1, v: 2 },
              ],
            },
          ],
        }),
      /position keys are \{ x, y \} pixel offsets/,
    );
    refusal(
      () =>
        apply(EMPTY_MOTION_DOC, {
          ...fadeKeys,
          tracks: [
            {
              property: 'transform.opacity',
              keys: [
                { t: 0, v: 0 },
                { t: 1, v: 2 },
              ],
            },
          ],
        }),
      /opacity keys lie between 0 and 1/,
    );
  });

  test('refuses keys closer than 1 ms', () => {
    refusal(
      () =>
        apply(EMPTY_MOTION_DOC, {
          ...fadeKeys,
          tracks: [
            {
              property: 'transform.opacity',
              keys: [
                { t: 0, v: 0 },
                { t: 0.0001, v: 1 },
              ],
            },
          ],
        }),
      /at least 1 ms apart/,
    );
  });
});

describe('editing ops', () => {
  test('remove_animation removes, and refuses an unknown id', () => {
    expect(apply(fadeDoc(), { type: 'remove_animation', animationId: 'fade' })).toEqual(
      EMPTY_MOTION_DOC,
    );
    refusal(
      () => apply(fadeDoc(), { type: 'remove_animation', animationId: 'nope' }),
      /no animation nope/,
    );
  });

  test('stagger sets the stagger, 0 removes it, and the last target must still end in time', () => {
    const many = apply(EMPTY_MOTION_DOC, { ...fadeKeys, targets: ['a', 'b', 'c'] });
    const staggered = apply(many, {
      type: 'stagger',
      animationId: 'fade',
      eachSec: 0.1,
      from: 'end',
    });
    expect(animation(staggered, 'fade').stagger).toEqual({ eachSec: 0.1, from: 'end' });
    expect(motionAnimationWindow(animation(staggered, 'fade')).endSec).toBe(1.2);
    expect(
      animation(apply(staggered, { type: 'stagger', animationId: 'fade', eachSec: 0 }), 'fade')
        .stagger,
    ).toBeUndefined();
    refusal(
      () => apply(many, { type: 'stagger', animationId: 'fade', eachSec: 2 }),
      /would end at/,
    );
    refusal(
      () => apply(many, { type: 'stagger', animationId: 'x', eachSec: 0.1 }),
      /no animation x/,
    );
  });

  test('retime moves the start and scales every track about the earliest key', () => {
    const doc = apply(EMPTY_MOTION_DOC, {
      type: 'add_animation',
      id: 'pair',
      label: 'Pair',
      targets: ['a'],
      tracks: [
        {
          property: 'transform.opacity',
          keys: [
            { t: 0.2, v: 0 },
            { t: 0.4, v: 1 },
          ],
        },
        {
          property: 'transform.rotationDeg',
          keys: [
            { t: 0.4, v: 0 },
            { t: 1.2, v: 10 },
          ],
        },
      ],
    });
    const retimed = apply(doc, {
      type: 'retime',
      animationId: 'pair',
      startSec: 1,
      durationSec: 2,
    });
    const pair = animation(retimed, 'pair');
    expect(pair.startSec).toBe(1);
    expect(pair.tracks.map((track) => track.keyframes.map((key) => key.timeSec))).toEqual([
      [0.2, 0.6],
      [0.6, 2.2],
    ]);
    refusal(() => apply(doc, { type: 'retime', animationId: 'pair' }), /startSec or durationSec/);
    refusal(
      () => apply(doc, { type: 'retime', animationId: 'pair', durationSec: 5 }),
      /would end at/,
    );
  });

  test('ease rewrites the outgoing ease of every key, or of one property', () => {
    const doc = apply(EMPTY_MOTION_DOC, {
      type: 'add_animation',
      id: 'pop',
      label: 'Pop',
      targets: ['a'],
      preset: 'pop',
    });
    const springy = apply(doc, { type: 'ease', animationId: 'pop', ease: 'bouncy' });
    for (const track of animation(springy, 'pop').tracks)
      for (const key of track.keyframes)
        expect(key).toMatchObject({ interpolation: 'spring', spring: { bounce: 0.7 } });
    const opacityOnly = apply(doc, {
      type: 'ease',
      animationId: 'pop',
      property: 'transform.opacity',
      ease: { bezier: [0.1, 0.2, 0.3, 1.4] },
    });
    const tracks = animation(opacityOnly, 'pop').tracks;
    expect(
      tracks.find((track) => track.property === 'transform.opacity')?.keyframes[0],
    ).toMatchObject({
      interpolation: 'bezier',
      easing: { x1: 0.1, y1: 0.2, x2: 0.3, y2: 1.4 },
    });
    expect(
      tracks.find((track) => track.property === 'transform.scaleX')?.keyframes[0]?.easing,
    ).toEqual(EASE_OUT);
    const motionmaxxing = apply(doc, { type: 'ease', animationId: 'pop', ease: 'popOver' });
    expect(animation(motionmaxxing, 'pop').tracks[0]?.keyframes[0]).toMatchObject({
      interpolation: 'linear',
      ease: 'popOver',
    });
    expect(animation(motionmaxxing, 'pop').tracks[0]?.keyframes[0]?.easing).toBeUndefined();
    refusal(
      () =>
        apply(doc, {
          type: 'ease',
          animationId: 'pop',
          property: 'effect.parameter',
          ease: 'linear',
        }),
      /has no effect.parameter track/,
    );
  });

  test('set_keyframes replaces a track, or adds one', () => {
    const replaced = apply(fadeDoc(), {
      type: 'set_keyframes',
      animationId: 'fade',
      property: 'transform.opacity',
      keys: [
        { t: 0, v: 1, ease: 'hold' },
        { t: 0.2, v: 0.5 },
        { t: 0.4, v: 0 },
      ],
    });
    expect(animation(replaced, 'fade').tracks[0]?.keyframes.map((key) => key.value)).toEqual([
      1, 0.5, 0,
    ]);
    const added = apply(fadeDoc(), {
      type: 'set_keyframes',
      animationId: 'fade',
      property: 'transform.scaleX',
      keys: [
        { t: 0, v: 0.5 },
        { t: 0.5, v: 1 },
      ],
    });
    expect(animation(added, 'fade').tracks.map((track) => track.property)).toEqual([
      'transform.opacity',
      'transform.scaleX',
    ]);
  });

  test('upsert_keyframe replaces the key within half a frame, else inserts with the previous ease', () => {
    const replaced = apply(fadeDoc(), {
      type: 'upsert_keyframe',
      animationId: 'fade',
      property: 'transform.opacity',
      key: { t: 0.51, v: 0.8 },
    });
    expect(animation(replaced, 'fade').tracks[0]?.keyframes.at(-1)).toMatchObject({
      id: 'k1',
      timeSec: 0.51,
      value: 0.8,
    });
    const inserted = apply(fadeDoc(), {
      type: 'upsert_keyframe',
      animationId: 'fade',
      property: 'transform.opacity',
      key: { t: 0.25, v: 0.3 },
    });
    expect(
      animation(inserted, 'fade').tracks[0]?.keyframes.map((key) => [key.id, key.timeSec]),
    ).toEqual([
      ['k0', 0],
      ['k2', 0.25],
      ['k1', 0.5],
    ]);
    expect(animation(inserted, 'fade').tracks[0]?.keyframes[1]).toMatchObject({
      interpolation: 'bezier',
      easing: MOTION_BEZIER_PRESETS.easeOut,
    });
    refusal(
      () =>
        apply(fadeDoc(), {
          type: 'upsert_keyframe',
          animationId: 'fade',
          property: 'transform.rotationDeg',
          key: { t: 0, v: 1 },
        }),
      /has no transform.rotationDeg track/,
    );
  });

  test('remove_keyframes removes by id, keeps two keys, refuses unknown ids', () => {
    const three = apply(fadeDoc(), {
      type: 'upsert_keyframe',
      animationId: 'fade',
      property: 'transform.opacity',
      key: { t: 0.25, v: 0.3 },
    });
    const removed = apply(three, {
      type: 'remove_keyframes',
      animationId: 'fade',
      property: 'transform.opacity',
      keyIds: ['k2'],
    });
    expect(removed).toEqual(fadeDoc());
    refusal(
      () =>
        apply(removed, {
          type: 'remove_keyframes',
          animationId: 'fade',
          property: 'transform.opacity',
          keyIds: ['k1'],
        }),
      /at least two keys/,
    );
    refusal(
      () =>
        apply(removed, {
          type: 'remove_keyframes',
          animationId: 'fade',
          property: 'transform.opacity',
          keyIds: ['k9'],
        }),
      /no transform.opacity keys k9/,
    );
  });

  test('split_text is an HTML op', () => {
    refusal(
      () => apply(fadeDoc(), { type: 'split_text', hfId: 'title' }),
      /use applyMotionOpsToHtml/,
    );
  });
});

describe('split_text', () => {
  const html = '<body><h1 class="headline" data-hf-id="headline"> Ship  it now </h1></body>';

  test('wraps each word, keeping every space', () => {
    expect(splitTextInHtml(html, 'headline')).toBe(
      '<body><h1 class="headline" data-hf-id="headline"> ' +
        '<span data-hf-id="headline-w1" style="display:inline-block">Ship</span>  ' +
        '<span data-hf-id="headline-w2" style="display:inline-block">it</span> ' +
        '<span data-hf-id="headline-w3" style="display:inline-block">now</span> </h1></body>',
    );
  });

  test('refuses a missing, a non-text, or an already split element', () => {
    refusal(() => splitTextInHtml(html, 'nope'), /no element with data-hf-id nope/);
    refusal(
      () => splitTextInHtml('<div data-hf-id="x">a <b>b</b></div>', 'x'),
      /not a text-only element/,
    );
    refusal(() => splitTextInHtml('<img data-hf-id="x">', 'x'), /not a text-only element/);
    refusal(
      () => splitTextInHtml(splitTextInHtml(html, 'headline'), 'headline'),
      /not a text-only/,
    );
    refusal(() => splitTextInHtml('<p data-hf-id="x">  </p>', 'x'), /no words/);
  });

  test('applyMotionOpsToHtml splits, then staggers the words in one batch', () => {
    const { html: out, doc } = applyMotionOpsToHtml(
      html,
      [
        { type: 'split_text', hfId: 'headline' },
        {
          ...fadeKeys,
          id: 'words',
          targets: ['headline-w1', 'headline-w2', 'headline-w3'],
          stagger: { eachSec: 0.1 },
        },
      ],
      context,
    );
    expect(out).toContain('data-hf-id="headline-w3"');
    expect(readMotionFromHtml(out)).toEqual(doc);
    expect(sampleMotion(doc, 'headline-w3', 1.2).opacity).toBe(1);
    expect(sampleMotion(doc, 'headline-w3', 0.65).opacity).toBe(0);
  });
});

describe('the HTML blocks', () => {
  const page = '<!doctype html><html><body><div data-hf-id="title">Hi</div>\n</body></html>';

  test('write is idempotent, round-trips, and sits before </body>', () => {
    const once = writeMotionToHtml(page, fadeDoc());
    expect(writeMotionToHtml(once, fadeDoc())).toBe(once);
    expect(readMotionFromHtml(once)).toEqual(fadeDoc());
    expect(once).toMatch(
      /<\/div>\n<script type="application\/json" data-hf-motion="">.*<\/script>\n<style data-hf-motion-css="">.*<\/style>\n<\/body><\/html>$/s,
    );
    expect(stripMotionBlocks(once)).toBe(page);
  });

  test('write replaces a previous motion and appends at the end without a body', () => {
    const changed = apply(fadeDoc(), { type: 'retime', animationId: 'fade', startSec: 1 });
    const twice = writeMotionToHtml(writeMotionToHtml(page, fadeDoc()), changed);
    expect(twice).toBe(writeMotionToHtml(page, changed));
    expect(twice.match(/data-hf-motion="">/g)).toHaveLength(1);
    const fragment = writeMotionToHtml('<div data-hf-id="title">Hi</div>', fadeDoc());
    expect(fragment.startsWith('<div data-hf-id="title">Hi</div><script')).toBe(true);
    expect(writeMotionToHtml(fragment, fadeDoc())).toBe(fragment);
  });

  test('an empty doc removes the blocks', () => {
    expect(writeMotionToHtml(writeMotionToHtml(page, fadeDoc()), EMPTY_MOTION_DOC)).toBe(page);
    expect(readMotionFromHtml(page)).toEqual(EMPTY_MOTION_DOC);
  });

  test('labels cannot carry markup or the words the SDK reads as GSAP', () => {
    for (const label of ['a <b>', 'x > y', 'a=b', 'gsap intro', 'my __timelines', 'ScrollTrigger'])
      refusal(() => apply(EMPTY_MOTION_DOC, { ...fadeKeys, label }), /labels may not contain/);
  });

  test('no id can smuggle a GSAP word into the script, and < is escaped', () => {
    const doc = fadeDoc();
    const sneaky = parseMotionDoc({
      ...doc,
      animations: doc.animations.map((entry) => ({ ...entry, id: 'gsap-fade' })),
    });
    refusal(() => writeMotionToHtml(page, sneaky), /would read it as a GSAP script/);
    const script = writeMotionToHtml(page, doc).match(/data-hf-motion="">(.*?)<\/script>/s)?.[1];
    expect(script).not.toContain('<');
  });

  test('a corrupted or repeated block is refused, not silently dropped', () => {
    refusal(
      () => readMotionFromHtml('<script type="application/json" data-hf-motion>{nope</script>'),
      /not valid JSON/,
    );
    const once = writeMotionToHtml(page, fadeDoc());
    const block = once.match(/<script[^>]*data-hf-motion="">.*?<\/script>/s)?.[0] ?? '';
    refusal(() => readMotionFromHtml(`${once}${block}`), /more than one motion block/);
  });
});

describe('diffMotion', () => {
  test('names added, removed and changed animations, ignoring key order', () => {
    const before = apply(fadeDoc(), { ...fadeKeys, id: 'keep', targets: ['other'] });
    const after = apply(
      before,
      { type: 'retime', animationId: 'fade', startSec: 1 },
      { ...fadeKeys, id: 'new', targets: ['x'] },
    );
    expect(diffMotion(before, after)).toEqual(['fade', 'new']);
    expect(diffMotion(after, before)).toEqual(['fade', 'new']);
    const shuffled = {
      ...after,
      animations: after.animations.map((entry) =>
        Object.fromEntries(Object.entries(entry).toReversed()),
      ),
    } as MotionDoc;
    expect(diffMotion(after, shuffled)).toEqual([]);
    expect(
      diffMotion(after, apply(after, { type: 'remove_animation', animationId: 'keep' })),
    ).toEqual(['keep']);
  });
});

describe('compileMotionCss', () => {
  const doc = apply(
    EMPTY_MOTION_DOC,
    {
      type: 'add_animation',
      id: 'in',
      label: 'In',
      targets: ['a', 'b'],
      startSec: 0.5,
      stagger: { eachSec: 0.25 },
      tracks: [
        {
          property: 'transform.position',
          keys: [
            { t: 0, v: { x: 0, y: 40 }, ease: 'easeOut' },
            { t: 1, v: { x: 0, y: 0 } },
          ],
        },
        {
          property: 'transform.opacity',
          keys: [
            { t: 0.1, v: 0, ease: 'hold' },
            { t: 0.3, v: 1 },
          ],
        },
      ],
    },
    {
      type: 'add_animation',
      id: 'pop',
      label: 'Pop',
      targets: ['a'],
      startSec: 2,
      preset: 'spring_in',
    },
    {
      type: 'add_animation',
      id: 'out',
      label: 'Out',
      targets: ['a'],
      startSec: 3,
      tracks: [
        {
          property: 'transform.opacity',
          keys: [
            { t: 0, v: 1, ease: 'crashOut' },
            { t: 0.5, v: 0 },
          ],
        },
        {
          property: 'effect.parameter',
          keys: [
            { t: 0, v: 0 },
            { t: 0.5, v: 8 },
          ],
        },
        {
          property: 'transform.rotationDeg',
          keys: [
            { t: 0, v: 0 },
            { t: 0.5, v: -15 },
          ],
        },
      ],
    },
  );
  const compiled = compileMotionCss(doc);

  test('one @keyframes per animation and CSS property, each key with its own timing', () => {
    expect(compiled).toContain(
      '@keyframes hfm-in-0{0%{translate:0px 40px;animation-timing-function:cubic-bezier(0,0,0.58,1)}100%{translate:0px 0px}}',
    );
    expect(compiled).toContain(
      '@keyframes hfm-in-3{0%{opacity:0;animation-timing-function:step-start}100%{opacity:1}}',
    );
    expect(compiled).toContain(
      '@keyframes hfm-out-4{0%{filter:blur(0px);animation-timing-function:linear}100%{filter:blur(8px)}}',
    );
    expect(compiled).toContain('@keyframes hfm-out-2{0%{rotate:0deg;');
    const spring = compiled.match(
      /@keyframes hfm-pop-1\{0%\{scale:0\.6 0\.6;animation-timing-function:linear\(([^)]*)\)/,
    );
    expect(spring?.[1]?.split(',')).toHaveLength(64);
    expect(
      compiled
        .match(/hfm-out-3\{0%\{opacity:1;animation-timing-function:linear\(([^)]*)\)/)?.[1]
        ?.split(','),
    ).toHaveLength(64);
  });

  test('one important animation list per target, by start, fill both then forwards', () => {
    expect(compiled).toContain(
      '[data-hf-id="a"]{animation:hfm-in-0 1s linear 0.5s 1 normal both,hfm-in-3 0.2s linear 0.6s 1 normal both,' +
        'hfm-pop-1 0.6s linear 2s 1 normal both,hfm-pop-3 0.15s linear 2s 1 normal forwards,' +
        'hfm-out-2 0.5s linear 3s 1 normal both,hfm-out-3 0.5s linear 3s 1 normal forwards,' +
        'hfm-out-4 0.5s linear 3s 1 normal both !important}',
    );
    expect(compiled).toContain(
      '[data-hf-id="b"]{animation:hfm-in-0 1s linear 0.75s 1 normal both,hfm-in-3 0.2s linear 0.85s 1 normal both !important}',
    );
    expect(compiled).not.toMatch(/transform\s*:/);
  });

  test('sampleMotion is what the compiled CSS shows', () => {
    expect(sampleMotion(doc, 'b', 0)).toEqual({
      translateX: 0,
      translateY: 40,
      scale: [1, 1],
      rotateDeg: 0,
      opacity: 0,
      blurPx: 0,
    });
    expect(sampleMotion(doc, 'b', 0.85).opacity).toBe(1);
    expect(sampleMotion(doc, 'b', 0.84).opacity).toBe(0);
    expect(sampleMotion(doc, 'a', 1.5).translateY).toBe(0);
    expect(sampleMotion(doc, 'a', 1).translateY).toBeCloseTo(
      40 - 40 * cubicBezierProgress(0.5, MOTION_BEZIER_PRESETS.easeOut),
      9,
    );
    expect(sampleMotion(doc, 'a', 1.9).scale).toEqual([0.6, 0.6]);
    const midSpring = sampleMotion(doc, 'a', 2.3).scale[0];
    expect(midSpring).toBeCloseTo(0.6 + 0.4 * springProgress(0.5, 0.5), 2);
    expect(sampleMotion(doc, 'a', 2.9).opacity).toBe(1);
    expect(sampleMotion(doc, 'a', 3.25).blurPx).toBe(4);
    expect(sampleMotion(doc, 'a', 3.6)).toMatchObject({ opacity: 0, blurPx: 8, rotateDeg: -15 });
    expect(sampleMotion(doc, 'nobody', 1)).toEqual(sampleMotion(EMPTY_MOTION_DOC, 'a', 1));
  });

  test('sampled opacity clamps overshoot the way CSS does', () => {
    const bouncy = apply(EMPTY_MOTION_DOC, {
      ...fadeKeys,
      tracks: [
        {
          property: 'transform.opacity',
          keys: [
            { t: 0, v: 0, ease: 'bouncy' },
            { t: 1, v: 1 },
          ],
        },
      ],
    });
    const samples = Array.from(
      { length: 20 },
      (_, index) => sampleMotion(bouncy, 'title', 0.5 + index / 20).opacity,
    );
    expect(Math.max(...samples)).toBe(1);
  });
});

describe('scale', () => {
  test('scaleX and scaleY must share key times and eases', () => {
    const doc = fadeDoc();
    refusal(
      () =>
        apply(
          doc,
          {
            type: 'set_keyframes',
            animationId: 'fade',
            property: 'transform.scaleX',
            keys: [
              { t: 0, v: 0.5 },
              { t: 0.5, v: 1 },
            ],
          },
          {
            type: 'set_keyframes',
            animationId: 'fade',
            property: 'transform.scaleY',
            keys: [
              { t: 0, v: 0.5 },
              { t: 0.4, v: 1 },
            ],
          },
        ),
      /key times and eases must match/,
    );
  });

  test('a single axis keeps the other at 1', () => {
    const doc = apply(fadeDoc(), {
      type: 'set_keyframes',
      animationId: 'fade',
      property: 'transform.scaleY',
      keys: [
        { t: 0, v: 0 },
        { t: 0.5, v: 2 },
      ],
    });
    expect(compileMotionCss(doc)).toContain('0%{scale:1 0;');
    expect(sampleMotion(doc, 'title', 0.75).scale).toEqual([1, 1]);
  });
});

describe('shared editor helpers', () => {
  test('staggerOffsets from start, end and center', () => {
    expect(staggerOffsets(3, 0.1, 'start')).toEqual([0, 0.1, 0.2]);
    expect(staggerOffsets(3, 0.1, 'end')).toEqual([0.2, 0.1, 0]);
    expect(staggerOffsets(5, 0.1, 'center')).toEqual([0.2, 0.1, 0, 0.1, 0.2]);
    expect(staggerOffsets(4, 0.1, 'center')).toEqual([0.1, 0, 0, 0.1]);
    expect(staggerOffsets(0, 0.1)).toEqual([]);
  });

  test('retimeKeyframes scales about the earliest key or a pivot, shifts, and rescales wiggle', () => {
    const keys = [{ timeSec: 1, expression: 'wiggle(2, 5)' }, { timeSec: 2 }];
    expect(retimeKeyframes(keys, { scale: 2, shiftSec: 0.5 })).toEqual([
      { timeSec: 1.5, expression: 'wiggle(1, 5)' },
      { timeSec: 3.5 },
    ]);
    expect(retimeKeyframes(keys, { scale: 0.5, pivotSec: 0 }).map((key) => key.timeSec)).toEqual([
      0.5, 1,
    ]);
    refusal(() => retimeKeyframes(keys, { scale: 0 }), /positive scale/);
  });

  test('easeKeyframes keeps EditorKeyframes valid for the video editor', () => {
    const keys = editorKeyframeSchema.array().parse([
      {
        id: 'a',
        property: 'transform.scaleX',
        timeSec: 0,
        value: 1,
        interpolation: 'bezier',
        easing: EASE_OUT,
      },
      { id: 'b', property: 'transform.scaleX', timeSec: 1, value: 2, interpolation: 'linear' },
    ]);
    for (const ease of [
      'hold',
      'spring',
      'easeInOutBack',
      'gentle',
      { bezier: [0, 0, 1, 1] },
    ] satisfies EditorEase[]) {
      const eased = easeKeyframes(keys, ease);
      expect(editorKeyframeSchema.array().safeParse(eased).success).toBe(true);
    }
    expect(easeKeyframes(keys, 'linear')[0]?.easing).toBeUndefined();
  });

  test('isValidMotionTarget refuses clips, the root and data-start', () => {
    expect(isValidMotionTarget({ 'data-hf-id': 'a', class: 'headline' })).toBe(true);
    expect(isValidMotionTarget({ 'data-hf-id': 'a', class: 'big clip' })).toBe(false);
    expect(isValidMotionTarget({ 'data-hf-id': 'a', 'data-start': '0' })).toBe(false);
    expect(isValidMotionTarget({ 'data-hf-id': 'root', 'data-composition-id': 'c' })).toBe(false);
    expect(isValidMotionTarget({ class: 'headline' })).toBe(false);
  });
});

describe('wire schemas', () => {
  test('the motion doc is strict and versioned', () => {
    expect(motionDocSchema.safeParse({ version: 2, animations: [] }).success).toBe(false);
    expect(motionDocSchema.safeParse({ ...fadeDoc(), extra: 1 }).success).toBe(false);
  });

  test('a motion target names a selection', () => {
    expect(motionTargetSchema.safeParse({ revisionId: 'r' }).success).toBe(false);
    expect(motionTargetSchema.parse({ revisionId: 'r', hfIds: ['headline'] })).toEqual({
      revisionId: 'r',
      animationIds: [],
      hfIds: ['headline'],
    });
  });

  test('a motion commit carries ops and the fingerprint it expects', () => {
    const fingerprint = 'f'.repeat(64);
    expect(
      hyperframesMotionCommitRequestSchema.safeParse({ ops: [], expectedFingerprint: fingerprint })
        .success,
    ).toBe(false);
    expect(
      hyperframesMotionCommitRequestSchema.parse({
        ops: [{ type: 'stagger', animationId: 'words', eachSec: 0.1 }],
        expectedFingerprint: fingerprint,
      }).ops[0],
    ).toEqual({ type: 'stagger', animationId: 'words', eachSec: 0.1, from: 'start' });
  });

  const projectRef = { projectId: z.string().uuid() };
  const projectId = '00000000-0000-4000-8000-000000000000';
  const editorInputs = {
    get_motion: getMotionInputSchema,
    keyframe_clip: keyframeClipInputSchema,
    stagger_clips: staggerClipsInputSchema,
    retime_motion: retimeMotionInputSchema,
  };

  test.each(
    Object.entries(editorInputs),
  )('%s: an agent tool can omit projectId and fill it (no union, no object refinement)', (_op, schema) => {
    const tool = schema.extend(projectRef).omit({ projectId: true });
    expect(JSON.stringify(z.toJSONSchema(tool))).not.toMatch(/"(anyOf|oneOf|allOf)"/);
    expect(
      schema.extend(projectRef).safeParse({ projectId, extra: 1, clipIds: ['a', 'b'] }).success,
    ).toBe(false);
  });

  test('keyframe_clip keys: v or x/y, an ease name or bezier points', () => {
    const parsed = keyframeClipInputSchema.extend(projectRef).parse({
      projectId,
      clipId: 'c',
      property: 'transform.position',
      keys: [{ t: 1, x: 0.25, y: 0.5, ease: 'easeOut' }],
    });
    expect(parsed.replace).toBe(false);
    expect(editorKeyframeFromKeyInput(parsed, parsed.keys[0] ?? { t: 0 }, 'k')).toEqual({
      id: 'k',
      property: 'transform.position',
      timeSec: 1,
      value: { x: 0.25, y: 0.5 },
      interpolation: 'bezier',
      easing: MOTION_BEZIER_PRESETS.easeOut,
    });
    expect(
      editorKeyframeFromKeyInput(
        { property: 'transform.opacity' },
        { t: 0, v: 0.5, bezier: [0.2, 0, 0.4, 1] },
        'k',
      ),
    ).toMatchObject({
      value: 0.5,
      interpolation: 'bezier',
      easing: { x1: 0.2, y1: 0, x2: 0.4, y2: 1 },
    });
    expect(
      editorKeyframeFromKeyInput({ property: 'transform.scaleX' }, { t: 0, v: 2 }, 'k')
        .interpolation,
    ).toBe('linear');
    refusal(
      () => editorKeyframeFromKeyInput({ property: 'transform.position' }, { t: 0, v: 1 }, 'k'),
      /position keys take x and y, not v/,
    );
    refusal(
      () =>
        editorKeyframeFromKeyInput({ property: 'transform.opacity' }, { t: 0, x: 1, y: 1 }, 'k'),
      /transform.opacity keys take v, not x or y/,
    );
    refusal(
      () =>
        editorKeyframeFromKeyInput(
          { property: 'transform.opacity' },
          { t: 0, v: 1, ease: 'easeIn', bezier: [0, 0, 1, 1] },
          'k',
        ),
      /ease or bezier, not both/,
    );
    refusal(
      () =>
        editorKeyframeFromKeyInput(
          { property: 'transform.opacity' },
          { t: 0, v: 1, bezier: [2, 0, 1, 1] },
          'k',
        ),
      /x1, x2 in 0..1/,
    );
    refusal(
      () => editorKeyframeFromKeyInput({ property: 'effect.parameter' }, { t: 0, v: 1 }, 'k'),
      /parameterName/,
    );
    expect(
      keyframeClipInputSchema.safeParse({
        clipId: 'c',
        property: 'transform.opacity',
        keys: [{ t: 0, v: 1, ease: 'crashIn' }],
      }).success,
    ).toBe(false);
  });

  test('stagger_clips refuses a repeated clip', () => {
    expect(staggerClipsInputSchema.safeParse({ clipIds: ['a', 'a'], eachSec: 0.1 }).success).toBe(
      false,
    );
  });

  test('validateRetimeMotionInput needs something to change and one ease', () => {
    const input = retimeMotionInputSchema.extend(projectRef).parse({ projectId, clipIds: ['a'] });
    refusal(() => validateRetimeMotionInput(input), /needs shiftSec, durationSec, ease or bezier/);
    expect(validateRetimeMotionInput({ ease: 'bouncy' }).ease).toBe('bouncy');
    expect(validateRetimeMotionInput({ bezier: [0.1, 0, 0.2, 1] }).ease).toEqual({
      bezier: [0.1, 0, 0.2, 1],
    });
    expect(validateRetimeMotionInput({ durationSec: 0.4 })).toEqual({
      shiftSec: undefined,
      durationSec: 0.4,
      ease: undefined,
    });
    refusal(
      () => validateRetimeMotionInput({ ease: 'linear', bezier: [0, 0, 1, 1] }),
      /ease or bezier, not both/,
    );
  });
});
