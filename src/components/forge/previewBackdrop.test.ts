/**
 * The backdrop pick behind the row preview: the closest finished render of a format — this row's,
 * the nearest row's in the set, else the template's newest — found by file name, never position.
 */

import { describe, expect, test } from 'bun:test';
import type { ApiRenderJob, RenderOutputFormatCandidate } from '@continuum/contracts';
import { pickBackdrop, rowDistance } from './previewBackdrop';

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

  test('a job’s still wins over its video; with only a video, the video is the backdrop', () => {
    const both = job('both', 'child', 1, [file('Square_v.mp4', 'video'), file('Square_s.png')]);
    expect(
      pickBackdrop({ ...base, rowJob: both, setJobs: [], templateJobs: [] })?.file.fileName,
    ).toBe('Square_s.png');
    // The server takes the frame the row is on screen at; a video render is a backdrop too.
    const video = job('video', 'child', 1, [file('Square_v.mp4', 'video')]);
    const picked = pickBackdrop({ ...base, rowJob: video, setJobs: [], templateJobs: [] });
    expect(picked).toMatchObject({ from: 'row', file: { fileName: 'Square_v.mp4' } });
  });

  test('a job with no file of the format is passed over, down to the template’s newest', () => {
    const otherFormat = job('story-only', 'root', 2, [file('Story_s.png')]);
    const templateOld = job('template-old', null, 48, [file('Square_t1.png')]);
    const templateNew = job('template-new', null, 20, [file('Square_t2.png')]);
    const picked = pickBackdrop({
      ...base,
      rowJob: null,
      setJobs: [otherFormat],
      templateJobs: [templateOld, templateNew],
    });
    expect(picked).toMatchObject({ from: 'template', job: { id: 'template-new' } });
  });

  test('no file of the format anywhere is no backdrop', () => {
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
