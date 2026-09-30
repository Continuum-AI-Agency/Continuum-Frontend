/**
 * The Live preview's text layout, against a face whose every number is round: letters 5 px wide
 * at size 10, a space 2.5 px, "AV" kerned in by 1 px, each glyph a 1×7 px bar from its pen. The
 * real faces are the parity bench's (`forge:preview:live:bench`, every line against py's own
 * composer); these pin each rule the port copies, one at a time.
 */
import { describe, expect, test } from 'bun:test';
import { layoutText, liveScene, paragraphWrap } from './forge-live-text';
import {
  paintScene,
  type Scene,
  type SceneGlyphKit,
  type SceneLayer,
  type SceneTextKit,
} from './forge-scene';

const BAR =
  'M 0 0 C 0 0 100 0 100 0 C 100 0 100 700 100 700 C 100 700 0 700 0 700 C 0 700 0 0 0 0 Z';
const FACE: SceneGlyphKit = {
  upem: 1000,
  ascender: 0.8,
  chars: {
    ...Object.fromEntries([...'abcdefghijklmnopqrstuvwxyz$.,'].map((ch) => [ch, [500, 500, BAR]])),
    A: [600, 600, BAR],
    V: [600, 600, BAR],
    ' ': [250, 250, ''],
  },
  kern: { AV: -100 },
};

const kit = (over: Partial<SceneTextKit> = {}): SceneTextKit => ({
  font: 'Round-Regular',
  size: 10,
  tracking: 0,
  hscale: 1,
  fauxbold: false,
  caps: 0,
  leading: 12,
  justify: 7413,
  indents: [0, 0, 0],
  box: [0, 0, 20, 30, 0],
  matrix: [1, 0, 0, 1, 0, 0],
  ...over,
});

const textLayer = (over: Partial<SceneTextKit> = {}): SceneLayer => ({
  id: 1,
  name: 'Headline',
  kind: 'text',
  depth: 0,
  enabled: true,
  guide: false,
  opacity: 100,
  onscreen: true,
  tier: 'measured',
  fill: '#111111',
  corners: null,
  text: { value: 'authored', fill: '#111111' },
  kit: kit(over),
});

const laid = (value: string, over: Partial<SceneTextKit> = {}) => {
  const result = layoutText(textLayer(over), value, FACE);
  if ('why' in result) throw new Error(result.why);
  return result.layer;
};
const lines = (layer: SceneLayer) =>
  (layer.text as { lines: { text: string; width: number }[] }).lines;
const starts = (layer: SceneLayer) =>
  (layer.text?.paths ?? []).map((d) => d.split(' ').slice(1, 3).map(Number));

describe('the Paragraph Text Resize rig', () => {
  // The rig's own Source Text expression, run as After Effects runs it: its last statement is its value.
  const EXPRESSION =
    'temptxt = value;\rmaxline=effect("Paragraph Text Resize")("Maximum lines allowed");\rminchar=effect("Paragraph Text Resize")("Minimum char per line");\rdo{\rlinecount = 0;\rtxt = temptxt;\routStr = "";\rnewLine = ""\rsplt = txt.split(" ")\rfor (i = 0; i < splt.length; i++){\r  if ((newLine + " " + splt[i]).length > minchar){\r    if (outStr != "") outStr += "\\r";\r    outStr += newLine;\r    linecount = linecount+1;\r    newLine = splt[i];\r  }else{\r    if (newLine != "") newLine += " ";\r    newLine += splt[i];\r  }\r}\rif (newLine != ""){\r  if (outStr != "") outStr += "\\r";\r  outStr += newLine;\r  linecount = linecount+1;\r}\rminchar=minchar+1;\r}while (linecount>maxline)\routStr;';
  const afterEffects = (value: string, minchar: number, maxline: number): string => {
    const effect = () => (name: string) => (name === 'Maximum lines allowed' ? maxline : minchar);
    return new Function(
      'value',
      'effect',
      `var temptxt, maxline, minchar, linecount, txt, outStr, newLine, splt, i; return eval(${JSON.stringify(EXPRESSION)});`,
    )(value, effect);
  };

  test.each([
    [
      'Suggested retail price. Applies only to the combo advertised and does not include extra products.',
      10,
      3,
    ],
    ['Aplican T&C. Fotos referenciales.', 10, 3],
    ['Short', 10, 3],
    ['Supercalifragilisticexpialidocious is a very long first word', 10, 2],
    ['one  two   three    spaced', 5, 2],
    ['a b c d e f g h i j k l m n o p q r s t u v w x y z', 3, 1],
    ['', 10, 3],
  ] as const)('wraps %p exactly as the rig’s own expression does', (text, minchar, maxline) => {
    expect(paragraphWrap(text, minchar, maxline)).toBe(afterEffects(text, minchar, maxline));
  });
});

describe('box text, as the composer breaks it', () => {
  test('breaks greedily at spaces; a trailing space rides along but never shifts a centred line', () => {
    const layer = laid('aaa bbb', { justify: 7415 });
    expect(lines(layer)).toEqual([
      { text: 'aaa ', width: 15 },
      { text: 'bbb', width: 15 },
    ]);
    // Centred in a 20 px box: (20 - 15) / 2, on baselines 0.8 × 10 and then one leading lower.
    expect(starts(layer).slice(0, 1)).toEqual([[2.5, 8]]);
    expect(starts(layer)[3]).toEqual([2.5, 20]);
  });

  test('a token wider than the line wraps at the character level', () => {
    expect(lines(laid('aaaaaa')).map((line) => line.text)).toEqual(['aaaa', 'aa']);
  });

  test('a line whose baseline falls below the box is clipped, and the layer says it overflows', () => {
    const layer = laid('aaa bbb ccc');
    expect(lines(layer).map((line) => line.text)).toEqual(['aaa ', 'bbb ']);
    expect(layer.text?.overflow).toBe(true);
    expect(layer.corners).toEqual([
      [0, 0],
      [20, 0],
      [20, 30],
      [0, 30],
    ]);
  });
});

describe('point text', () => {
  test('keeps the authored lines, right-justified about the origin, one leading apart', () => {
    const layer = laid('ab\nc', { box: null, justify: 7414 });
    expect(lines(layer)).toEqual([
      { text: 'ab', width: 10 },
      { text: 'c', width: 5 },
    ]);
    expect(starts(layer)).toEqual([
      [-10, 0],
      [-5, 0],
      [-5, 12],
    ]);
  });

  test('measures with pair kerning but plants glyphs at unkerned advances, as the server draws', () => {
    const layer = laid('AV', { box: null });
    expect(lines(layer)[0]?.width).toBe(11);
    expect(starts(layer)).toEqual([
      [0, 0],
      [6, 0],
    ]);
  });

  test('tracking widens every character, the last one included', () => {
    expect(lines(laid('ab', { box: null, tracking: 100 }))[0]?.width).toBe(12);
  });
});

describe('the rig on a laid-out block', () => {
  test('re-wraps the value, then shrinks the block to its maximum width about a centred anchor', () => {
    const rig = {
      minchar: 3,
      maxline: 2,
      centering: 2,
      maxWidth: 12,
      anchor: true,
      scale: true,
      anchorPoint: [0, 0] as [number, number],
      scaleValue: [100, 100] as [number, number],
    };
    const layer = laid('aa bb cc', { box: [0, 0, 100, 100, 0], rig });
    expect(lines(layer).map((line) => line.text)).toEqual(['aa bb', 'cc']);
    // Ink from 0 to 18.5 px across: 12 / 18.5 of it.
    expect(layer.rig).toEqual({ kind: 'Paragraph Text Resize', lines: 2, scale: 0.6486 });
  });
});

describe('what the browser leaves to the server', () => {
  test('a character outside the face, a tab, and a layer with no kit each say why', () => {
    expect(layoutText(textLayer(), 'ü', FACE)).toEqual({ why: 'a character is not in the face' });
    expect('why' in layoutText(textLayer(), 'a\tb', FACE)).toBe(true);
    expect(
      layoutText({ ...textLayer(), kit: null, kitWhy: 'box auto-fit policy' }, 'a', FACE),
    ).toEqual({
      why: 'box auto-fit policy',
    });
  });

  test('an empty value draws nothing and has no box', () => {
    const layer = laid('');
    expect(layer.text?.paths).toEqual([]);
    expect(layer.corners).toBeNull();
  });

  test('a scene holding a row lays out each text variable’s layers and names the ones it cannot', () => {
    const scene: Scene = {
      ok: true,
      comp: { name: 'C', width: 100, height: 100 },
      at: 1,
      layers: [textLayer(), { ...textLayer(), id: 2, name: 'Price' }],
      glyphs: { 'Round-Regular': FACE },
    };
    const variables = [
      { key: 'headline', label: 'Headline', kind: 'text' as const, reserved: false },
      { key: 'price', label: 'Price', kind: 'number' as const, reserved: false },
    ];
    const { scene: live, unlaid } = liveScene(scene, {
      variables,
      values: { headline: 'abc', price: 'ü' },
      layersOf: (variable) => new Set([variable.key === 'headline' ? 1 : 2]),
    });
    expect(live.layers[0]?.text?.value).toBe('abc');
    expect(live.layers[1]).toBe(scene.layers[1] as SceneLayer);
    expect(unlaid).toEqual(['Price: a character is not in the face']);
  });
});

describe('paintScene', () => {
  test('a colour controller repaints the layers reading it, and text past its box is named', () => {
    const plate: SceneLayer = {
      id: 3,
      name: 'Plate',
      kind: 'shape',
      depth: 0,
      enabled: true,
      guide: false,
      opacity: 100,
      onscreen: true,
      tier: 'measured',
      fill: '#000000',
      corners: [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ],
      refs: [{ layer: 'Controls', effect: 'Key Color', prop: 'ADBE Vector Fill Color' }],
    };
    const headline = laid('aaa bbb ccc');
    const scene: Scene = {
      ok: true,
      comp: { name: 'C', width: 100, height: 100 },
      at: 1,
      layers: [headline, plate],
    };
    const variables = [
      { key: 'key_color', label: 'Key Color', kind: 'color' as const },
      { key: 'headline', label: 'Headline', kind: 'text' as const },
    ];
    const { svg, overflows } = paintScene(scene, {
      variables,
      values: { key_color: '#C2410C' },
      layersOf: (variable) => new Set(variable.key === 'headline' ? [1] : []),
      picture: () => null,
      footage: () => null,
      notes: new Set(),
    });
    expect(svg).toContain('fill="#c2410c"');
    expect(svg).toContain('fill="#111111"');
    // The plate is listed last, so it is painted first, under the type.
    expect(svg.indexOf('#c2410c')).toBeLessThan(svg.indexOf('#111111'));
    expect(overflows).toEqual(['Headline']);
  });
});
