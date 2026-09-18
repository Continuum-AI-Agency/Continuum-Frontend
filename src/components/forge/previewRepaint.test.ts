/**
 * The pure half of the row preview: the 2-colour sampler that reads a box off a real render, the
 * diff that says which values a render did not use, and the backdrop pick that finds the closest
 * render of a format — by file name, never by position.
 */

import { describe, expect, test } from 'bun:test';
import type { ApiRenderJob, RenderOutputFormatCandidate } from '@continuum/contracts';
import { changedKeys, clampBox, pickBackdrop, rowDistance, twoTone } from './previewRepaint';

type Rgb = [number, number, number];

/** A `width`×`height` RGBA box painted `ground`, with `ink` over each [x0, y0, x1, y1] rectangle. */
function box(width: number, height: number, ground: Rgb, ink: Rgb, marks: number[][]): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inked = marks.some(
        ([x0 = 0, y0 = 0, x1 = 0, y1 = 0]) => x >= x0 && x < x1 && y >= y0 && y < y1,
      );
      pixels.set([...(inked ? ink : ground), 255], (y * width + x) * 4);
    }
  }
  return pixels;
}

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];
const CYAN: Rgb = [0, 255, 244];

describe('twoTone', () => {
  test('the majority is the fill, the minority the ink, and the ink says where the text sat', () => {
    const pixels = box(40, 20, WHITE, BLACK, [[10, 6, 30, 12]]);
    expect(twoTone(pixels, 40)).toEqual({
      fill: '#ffffff',
      ink: '#000000',
      inkBox: [10, 6, 30, 12],
      lineHeight: 6,
    });
  });

  test('white type on a cyan bar reads cyan fill and white ink', () => {
    const tone = twoTone(box(40, 20, CYAN, WHITE, [[4, 8, 12, 14]]), 40);
    expect(tone.fill).toBe('#00fff4');
    expect(tone.ink).toBe('#ffffff');
    expect(tone.inkBox).toEqual([4, 8, 12, 14]);
  });

  test('a flat box has no ink to erase, and gets an ink that reads on it', () => {
    // Compression noise of a few levels is still one colour.
    const noisy = box(10, 10, [250, 250, 250], [244, 246, 250], [[2, 2, 4, 4]]);
    expect(twoTone(noisy, 10)).toEqual({
      fill: '#fafafa',
      ink: '#000000',
      inkBox: null,
      lineHeight: null,
    });
    expect(twoTone(box(10, 10, [20, 20, 40], [20, 20, 40], []), 10).ink).toBe('#ffffff');
  });

  test('a second line of the paragraph joins the block; a neighbour’s edge far below does not', () => {
    const pixels = box(60, 60, WHITE, BLACK, [
      [10, 10, 50, 20], // the heaviest line
      [14, 24, 40, 32], // the next line, 4 px down
      [20, 56, 30, 60], // another element's top, crossing the box's bottom edge
    ]);
    const tone = twoTone(pixels, 60);
    expect(tone.inkBox).toEqual([10, 10, 50, 32]);
    expect(tone.lineHeight).toBe(10);
  });
});

describe('clampBox', () => {
  test('a measured box that runs off the frame is cut to it, in whole pixels', () => {
    expect(clampBox([95.01, 1001.77, 995.66, 1111.46], { width: 1080, height: 1080 })).toEqual([
      95, 1001, 996, 1080,
    ]);
    expect(clampBox([-460, -565.08, 1540, 1434.92], { width: 1080, height: 1080 })).toEqual([
      0, 0, 1080, 1080,
    ]);
  });
});

const VARIABLES = [
  { key: 'headline', kind: 'text', reserved: false },
  { key: 'price', kind: 'number', reserved: false },
  { key: 'accent', kind: 'color', reserved: false },
  { key: 'hero', kind: 'image', reserved: false },
  { key: 'logo', kind: 'image', reserved: true },
] as const;

const PIN = '77777777-7777-4777-8777-777777777777';
const OTHER_PIN = '88888888-8888-4888-8888-888888888888';

describe('changedKeys', () => {
  const rendered = {
    headline: 'Launch day',
    price: 9.99,
    accent: '#FF4500',
    hero: { assetId: PIN, versionId: '99999999-9999-4999-8999-999999999999' },
    logo: { assetId: OTHER_PIN },
  };

  test('the values a render was made with are not changes, however they are spelled', () => {
    expect(
      changedKeys(
        VARIABLES,
        { headline: ' Launch day ', price: 9.99, accent: 'ff4500', hero: { assetId: PIN } },
        rendered,
      ),
    ).toEqual([]);
  });

  test('a new headline, a new picture, and a cleared value are changes; Continuum’s own fills are not', () => {
    expect(
      changedKeys(
        VARIABLES,
        { headline: 'Carrier has arrived', accent: '#ff4500', hero: [{ assetId: OTHER_PIN }] },
        rendered,
      ),
    ).toEqual(['headline', 'price', 'hero']);
  });

  test('an unrecorded render input rules nothing out: every value the row has is a change', () => {
    expect(
      changedKeys(VARIABLES, { headline: 'Hola', price: '', accent: '#000000' }, null),
    ).toEqual(['headline', 'accent']);
  });
});

const ROWS = [
  { id: 'root', parentId: null },
  { id: 'child', parentId: 'root' },
  { id: 'sibling', parentId: 'root' },
  { id: 'grandchild', parentId: 'child' },
  { id: 'cousin', parentId: 'sibling' },
  { id: 'solo', parentId: null },
];

describe('rowDistance', () => {
  test('counts steps through the nearest shared ancestor; top-level rows are siblings', () => {
    expect(rowDistance(ROWS, 'child', 'root')).toBe(1);
    expect(rowDistance(ROWS, 'child', 'sibling')).toBe(2);
    expect(rowDistance(ROWS, 'grandchild', 'root')).toBe(2);
    expect(rowDistance(ROWS, 'grandchild', 'cousin')).toBe(4);
    expect(rowDistance(ROWS, 'root', 'solo')).toBe(2);
    expect(rowDistance(ROWS, 'child', 'child')).toBe(0);
  });

  test('a row no longer in the set is no relative at all', () => {
    expect(rowDistance(ROWS, 'child', 'deleted')).toBe(Number.POSITIVE_INFINITY);
  });
});

const FORMATS: RenderOutputFormatCandidate[] = [
  { id: 'square', ratio: '1:1', comp: { name: 'Square', width: 1080, height: 1080 } },
  { id: 'story', ratio: '9:16', comp: { name: 'Story', width: 1080, height: 1920 } },
];

const file = (fileName: string, kind: 'image' | 'video' = 'image') => ({
  id: `hash-${fileName}`,
  kind,
  fileName,
  mimeType: kind === 'image' ? 'image/png' : 'video/mp4',
  url: `https://cdn.test/${fileName}`,
  width: null,
  height: null,
  assetId: null,
  versionId: null,
});

const job = (
  name: string,
  rowId: string | null,
  hoursAgo: number,
  outputs: ReturnType<typeof file>[],
) =>
  ({
    id: name,
    status: 'finished',
    renderSetRowId: rowId,
    outputs,
    createdAt: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
    finishedAt: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
  }) as unknown as ApiRenderJob;

describe('pickBackdrop', () => {
  const base = { rowId: 'child', rows: ROWS, formats: FORMATS, formatId: 'square' };

  test('this row’s own render wins, with the file named for the format — never the first file', () => {
    const own = job('own', 'child', 5, [file('Story_a1.png'), file('Square_b2.png')]);
    const picked = pickBackdrop({ ...base, rowJob: own, setJobs: [], templateJobs: [] });
    expect(picked?.from).toBe('row');
    expect(picked?.file.fileName).toBe('Square_b2.png');
  });

  test('without one, the nearest row of the set — the parent before a newer cousin', () => {
    const parent = job('parent', 'root', 30, [file('Square_p.png')]);
    const cousin = job('cousin', 'cousin', 1, [file('Square_c.png')]);
    const sibling = job('sibling', 'sibling', 2, [file('Square_s.png')]);
    const picked = pickBackdrop({
      ...base,
      rowJob: null,
      setJobs: [cousin, sibling, parent],
      templateJobs: [],
    });
    expect(picked).toMatchObject({ from: 'set', job: { id: 'parent' } });

    // Two rows equally near: the newer render.
    const older = job('older-sibling', 'sibling', 9, [file('Square_o.png')]);
    const newer = job('newer-sibling', 'sibling', 3, [file('Square_n.png')]);
    expect(
      pickBackdrop({ ...base, rowJob: null, setJobs: [older, newer], templateJobs: [] })?.job.id,
    ).toBe('newer-sibling');
  });

  test('a video file is not a backdrop; the next still is, down to the template’s newest', () => {
    const video = job('video', 'child', 1, [file('Square_v.mp4', 'video')]);
    const otherFormat = job('story-only', 'root', 2, [file('Story_s.png')]);
    const templateOld = job('template-old', null, 48, [file('Square_t1.png')]);
    const templateNew = job('template-new', null, 20, [file('Square_t2.png')]);
    const picked = pickBackdrop({
      ...base,
      rowJob: video,
      setJobs: [otherFormat],
      templateJobs: [templateOld, templateNew],
    });
    expect(picked).toMatchObject({ from: 'template', job: { id: 'template-new' } });
  });

  test('no still of the format anywhere is no backdrop', () => {
    expect(
      pickBackdrop({
        ...base,
        formatId: 'story',
        rowJob: job('own', 'child', 1, [file('Square_x.png')]),
        setJobs: [],
        templateJobs: [],
      }),
    ).toBeNull();
  });
});
