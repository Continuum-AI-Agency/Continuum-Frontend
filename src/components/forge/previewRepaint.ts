import {
  type ApiRenderInputValue,
  type ApiRenderJob,
  type ApiRenderOutput,
  type ApiRenderVariable,
  matchOutputFormat,
  type PixelBox,
  type RenderOutputFormatCandidate,
} from '@continuum/contracts';

// A row's preview is a real render with the row's changes painted over it. This file decides which
// render (the backdrop), which of the row's values that render did not use (the diff), and what
// colours sit inside a slot's box (the tones), so the repaint reads like the render around it.

export type Backdrop = {
  job: ApiRenderJob;
  /** The job's still for this format. Never a video: a video's poster is not painted over yet. */
  file: ApiRenderOutput;
  /** This row's own render, another row of the set, or any render of the template. */
  from: 'row' | 'set' | 'template';
};

type TreeRow = { id: string; parentId: string | null };

/** Steps between two rows through their nearest shared ancestor. Top-level rows are siblings. */
export function rowDistance(rows: readonly TreeRow[], from: string, to: string): number {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const chain = (id: string) => {
    const ids: string[] = [];
    for (let row = byId.get(id); row && !ids.includes(row.id); ) {
      ids.push(row.id);
      row = row.parentId ? byId.get(row.parentId) : undefined;
    }
    return ids;
  };
  const up = chain(from);
  const down = chain(to);
  if (up.length === 0 || down.length === 0) return Number.POSITIVE_INFINITY;
  const shared = up.findIndex((id) => down.includes(id));
  return shared >= 0 ? shared + down.indexOf(up[shared] as string) : up.length + down.length;
}

const finishedAt = (job: ApiRenderJob) => Date.parse(job.finishedAt ?? job.createdAt);

const stillFor = (
  job: ApiRenderJob,
  formats: readonly RenderOutputFormatCandidate[],
  formatId: string,
): ApiRenderOutput | null =>
  job.status === 'finished'
    ? (job.outputs.find(
        (output) =>
          output.kind === 'image' && matchOutputFormat(output.fileName, formats)?.id === formatId,
      ) ?? null)
    : null;

/**
 * The closest finished still of one format: this row's newest render, else the nearest row of the
 * set that has one (ties go to the newest), else the template's newest. File by name, never by
 * position — the fleet lists a job's files in a different order every time.
 */
export function pickBackdrop(args: {
  rowId: string;
  rows: readonly TreeRow[];
  rowJob: ApiRenderJob | null | undefined;
  setJobs: readonly ApiRenderJob[];
  templateJobs: readonly ApiRenderJob[];
  formats: readonly RenderOutputFormatCandidate[];
  formatId: string;
}): Backdrop | null {
  const found = (job: ApiRenderJob, from: Backdrop['from']): Backdrop | null => {
    const file = stillFor(job, args.formats, args.formatId);
    return file ? { job, file, from } : null;
  };
  const own = args.rowJob ? found(args.rowJob, 'row') : null;
  if (own) return own;
  const relatives = args.setJobs
    .map((job) => ({
      job,
      distance: job.renderSetRowId
        ? rowDistance(args.rows, args.rowId, job.renderSetRowId)
        : Number.POSITIVE_INFINITY,
    }))
    .filter((entry) => Number.isFinite(entry.distance))
    .sort((a, b) => a.distance - b.distance || finishedAt(b.job) - finishedAt(a.job));
  for (const { job } of relatives) {
    const hit = found(job, job.renderSetRowId === args.rowId ? 'row' : 'set');
    if (hit) return hit;
  }
  for (const job of [...args.templateJobs].sort((a, b) => finishedAt(b) - finishedAt(a))) {
    const hit = found(job, 'template');
    if (hit) return hit;
  }
  return null;
}

type DiffVariable = Pick<ApiRenderVariable, 'key' | 'kind' | 'reserved'>;

/** One comparable spelling per value: pins by asset, colours without case or `#`, blanks empty. */
function comparable(value: ApiRenderInputValue | undefined, kind: string): string {
  if (value === undefined) return '';
  if (typeof value === 'object') {
    return (Array.isArray(value) ? value : [value]).map((pin) => pin.assetId).join(',');
  }
  const text = String(value).trim();
  return kind === 'color' ? text.replace(/^#/, '').toLowerCase() : text;
}

/**
 * The keys whose value on the row differs from what the render was made with. Reserved variables
 * are Continuum's to fill, so they are never the row's change. A null `renderInput` is a render
 * whose input was not recorded: every key the row has a value for comes back, because none of
 * them can be ruled out.
 */
export function changedKeys(
  variables: readonly DiffVariable[],
  values: Readonly<Record<string, ApiRenderInputValue>>,
  renderInput: Readonly<Record<string, ApiRenderInputValue>> | null,
): string[] {
  return variables
    .filter((variable) => {
      if (variable.reserved) return false;
      const now = comparable(values[variable.key], variable.kind);
      return renderInput === null
        ? now !== ''
        : now !== comparable(renderInput[variable.key], variable.kind);
    })
    .map((variable) => variable.key);
}

export type Tone = {
  /** The box's majority colour: what the slot sits on. */
  fill: string;
  /** Its minority colour: the ink of whatever the render drew there. */
  ink: string;
  /**
   * The block of ink the render drew here, in the sampled pixels' coordinates — its heaviest line
   * and the lines next to it, not a neighbour's edge the box crosses. Null when the box is flat.
   */
  inkBox: PixelBox | null;
  /** The height of that block's heaviest line: how big the render's own type was. */
  lineHeight: number | null;
};

// ponytail: two flat colours per box. A gradient, a photo or two-colour type reads as its two
// averages; upgrade to per-glyph sampling (or a server still) when repaints look flat.
const ROUNDS = 10;
/** Two centres closer than this (RGB distance) are one colour plus compression noise. */
const FLAT_DISTANCE = 48;
/** Ink rows this close to a line (as a share of its height) belong to the same block of text. */
const SAME_BLOCK_GAP = 0.6;

const hex = (rgb: ArrayLike<number>) =>
  `#${[rgb[0], rgb[1], rgb[2]].map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
const lumaOf = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * 2-means over a box's RGBA pixels (alpha ignored), seeded with its darkest and lightest pixel.
 * The bigger cluster is the fill, the smaller the ink, and the ink's bounding box is where the
 * render drew over the fill. `width` is the row length of `rgba` in pixels.
 */
export function twoTone(rgba: ArrayLike<number>, width: number): Tone {
  const count = Math.floor(rgba.length / 4);
  const luma = (index: number) => lumaOf(rgba[index * 4], rgba[index * 4 + 1], rgba[index * 4 + 2]);
  let dark = 0;
  let light = 0;
  for (let index = 1; index < count; index++) {
    if (luma(index) < luma(dark)) dark = index;
    if (luma(index) > luma(light)) light = index;
  }
  // [r, g, b] of cluster 0 (seeded dark), then of cluster 1 (seeded light).
  const centres = new Float64Array(6);
  for (let channel = 0; channel < 3; channel++) {
    centres[channel] = rgba[dark * 4 + channel];
    centres[3 + channel] = rgba[light * 4 + channel];
  }
  const gap = (index: number, cluster: number) => {
    let sum = 0;
    for (let channel = 0; channel < 3; channel++) {
      sum += (rgba[index * 4 + channel] - centres[cluster * 3 + channel]) ** 2;
    }
    return sum;
  };
  const side = new Uint8Array(count);
  for (let round = 0; round < ROUNDS; round++) {
    const sums = new Float64Array(8);
    let moved = round === 0;
    for (let index = 0; index < count; index++) {
      const cluster = gap(index, 1) < gap(index, 0) ? 1 : 0;
      if (side[index] !== cluster) moved = true;
      side[index] = cluster;
      for (let channel = 0; channel < 3; channel++) {
        sums[cluster * 4 + channel] += rgba[index * 4 + channel];
      }
      sums[cluster * 4 + 3] += 1;
    }
    for (let cluster = 0; cluster < 2; cluster++) {
      const size = sums[cluster * 4 + 3];
      for (let channel = 0; channel < 3 && size; channel++) {
        centres[cluster * 3 + channel] = sums[cluster * 4 + channel] / size;
      }
    }
    if (!moved) break;
  }

  let ones = 0;
  for (let index = 0; index < count; index++) ones += side[index];
  const inkCluster = ones * 2 <= count ? 1 : 0;
  const inkCount = inkCluster === 1 ? ones : count - ones;
  const fill = centres.subarray((1 - inkCluster) * 3, (1 - inkCluster) * 3 + 3);
  const ink = centres.subarray(inkCluster * 3, inkCluster * 3 + 3);
  const apart = Math.hypot(ink[0] - fill[0], ink[1] - fill[1], ink[2] - fill[2]);
  if (inkCount === 0 || apart < FLAT_DISTANCE) {
    // One flat colour: nothing drawn here to erase, so the ink is whatever reads on it.
    const onLight = lumaOf(fill[0], fill[1], fill[2]) > 140;
    return {
      fill: hex(fill),
      ink: onLight ? '#000000' : '#ffffff',
      inkBox: null,
      lineHeight: null,
    };
  }
  // The ink's rows, in runs. The heaviest run is one line of the render's text; runs closer to it
  // than a fraction of that line's height are the same block (the next line of a paragraph), and a
  // run further off is another element whose edge the measured box happens to cross.
  const rows = Math.ceil(count / width);
  const perRow = new Uint32Array(rows);
  for (let index = 0; index < count; index++) {
    if (side[index] === inkCluster) perRow[Math.floor(index / width)] += 1;
  }
  const runs: Array<{ from: number; to: number; ink: number }> = [];
  for (let y = 0; y < rows; y++) {
    if (!perRow[y]) continue;
    const last = runs[runs.length - 1];
    if (last && last.to === y) {
      last.to = y + 1;
      last.ink += perRow[y];
    } else runs.push({ from: y, to: y + 1, ink: perRow[y] });
  }
  const heaviest = runs.reduce((best, run, index) => (run.ink > runs[best].ink ? index : best), 0);
  const line = runs[heaviest];
  const joins = (line.to - line.from) * SAME_BLOCK_GAP;
  let first = heaviest;
  let last = heaviest;
  while (first > 0 && runs[first].from - runs[first - 1].to <= joins) first -= 1;
  while (last < runs.length - 1 && runs[last + 1].from - runs[last].to <= joins) last += 1;
  const top = runs[first].from;
  const bottom = runs[last].to;
  let left = width;
  let right = 0;
  for (let y = top; y < bottom; y++) {
    for (let x = 0; x < width; x++) {
      if (side[y * width + x] !== inkCluster) continue;
      left = Math.min(left, x);
      right = Math.max(right, x + 1);
    }
  }
  return {
    fill: hex(fill),
    ink: hex(ink),
    inkBox: [left, top, right, bottom],
    lineHeight: line.to - line.from,
  };
}

/** A measured box cut to the comp and to whole pixels. Boxes run off the frame; pixels do not. */
export function clampBox(
  box: readonly number[],
  comp: { width: number; height: number },
): PixelBox {
  const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = box;
  return [
    Math.max(0, Math.floor(x0)),
    Math.max(0, Math.floor(y0)),
    Math.min(comp.width, Math.ceil(x1)),
    Math.min(comp.height, Math.ceil(y1)),
  ];
}

/**
 * Each box's tones, read off the render at comp size. Rejects when the file will not load with
 * CORS or the canvas refuses its pixels (a tainted canvas throws on `getImageData`).
 */
export async function sampleTones(
  url: string,
  comp: { width: number; height: number },
  boxes: ReadonlyArray<{ key: string; box: readonly number[] }>,
): Promise<Record<string, Tone>> {
  const image = document.createElement('img');
  image.crossOrigin = 'anonymous';
  image.src = url;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = comp.width;
  canvas.height = comp.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('This browser has no 2D canvas to read the render with.');
  context.drawImage(image, 0, 0, comp.width, comp.height);
  const tones: Record<string, Tone> = {};
  for (const { key, box } of boxes) {
    const [x0, y0, x1, y1] = clampBox(box, comp);
    if (x1 <= x0 || y1 <= y0) continue;
    const tone = twoTone(context.getImageData(x0, y0, x1 - x0, y1 - y0).data, x1 - x0);
    tones[key] = {
      ...tone,
      inkBox: tone.inkBox && [
        tone.inkBox[0] + x0,
        tone.inkBox[1] + y0,
        tone.inkBox[2] + x0,
        tone.inkBox[3] + y0,
      ],
    };
  }
  return tones;
}
