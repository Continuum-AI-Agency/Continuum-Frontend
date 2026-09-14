import { z } from 'zod';

/** First-class Home shelves. Template `ratios` stay a separate AE-comp facet. */
export const LIBRARY_ASPECT_RATIO_BINS = ['9:16', '1:1', '4:5', '16:9', 'other'] as const;
export const libraryAspectRatioBinSchema = z.enum(LIBRARY_ASPECT_RATIO_BINS);
export type LibraryAspectRatioBin = z.infer<typeof libraryAspectRatioBinSchema>;

/**
 * How the grid *shows* a creative — not where it ran as an ad (`placements`).
 * `native` is the asset's own pixels. The named frames are cover-crops so you
 * can see a 16:9 as a story, a 9:16 on a TV, etc.
 */
export const LIBRARY_PREVIEW_FRAMES = ['native', 'story', 'feed', 'square', 'landscape'] as const;
export const libraryPreviewFrameSchema = z.enum(LIBRARY_PREVIEW_FRAMES);
export type LibraryPreviewFrame = z.infer<typeof libraryPreviewFrameSchema>;

export type LibraryPreviewFrameSpec = {
  id: Exclude<LibraryPreviewFrame, 'native'>;
  bin: Exclude<LibraryAspectRatioBin, 'other'>;
  /** Short name on the As bar. */
  label: string;
  /** Device / surface the frame stands in for. */
  surface: string;
  cssAspect: string;
  ratio: number;
};

export const LIBRARY_PREVIEW_FRAME_SPECS: readonly LibraryPreviewFrameSpec[] = [
  { id: 'story', bin: '9:16', label: 'Story', surface: 'phone', cssAspect: '9/16', ratio: 9 / 16 },
  { id: 'feed', bin: '4:5', label: 'Feed', surface: '4:5', cssAspect: '4/5', ratio: 4 / 5 },
  { id: 'square', bin: '1:1', label: 'Square', surface: '1:1', cssAspect: '1/1', ratio: 1 },
  {
    id: 'landscape',
    bin: '16:9',
    label: 'Landscape',
    surface: 'TV',
    cssAspect: '16/9',
    ratio: 16 / 9,
  },
] as const;

export const LIBRARY_ASPECT_RATIO_LABEL: Record<LibraryAspectRatioBin, string> = {
  '9:16': 'Story · phone',
  '4:5': 'Feed · 4:5',
  '1:1': 'Square',
  '16:9': 'Landscape · TV',
  other: 'Other',
};

const SHELVES: ReadonlyArray<{ bin: Exclude<LibraryAspectRatioBin, 'other'>; ratio: number }> = [
  { bin: '9:16', ratio: 9 / 16 },
  { bin: '4:5', ratio: 4 / 5 },
  { bin: '1:1', ratio: 1 },
  { bin: '16:9', ratio: 16 / 9 },
];

/** Relative error allowed when mapping pixel size onto a named shelf. */
const SHELF_EPSILON = 0.04;

/**
 * Which Home shelf a creative sits on. Unknown / missing pixels → null (not
 * "other"): other is a real shelf for known-but-unmatched sizes, and a missing
 * dimension must not dump unscored cards into it.
 */
export function libraryAspectRatioBin(
  width: number | null | undefined,
  height: number | null | undefined,
): LibraryAspectRatioBin | null {
  if (
    width == null ||
    height == null ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  const actual = width / height;
  for (const shelf of SHELVES) {
    if (Math.abs(actual - shelf.ratio) / shelf.ratio <= SHELF_EPSILON) return shelf.bin;
  }
  return 'other';
}

export function previewFrameSpec(frame: LibraryPreviewFrame): LibraryPreviewFrameSpec | null {
  if (frame === 'native') return null;
  return LIBRARY_PREVIEW_FRAME_SPECS.find((spec) => spec.id === frame) ?? null;
}

export function previewFrameForBin(bin: LibraryAspectRatioBin): LibraryPreviewFrame {
  const spec = LIBRARY_PREVIEW_FRAME_SPECS.find((candidate) => candidate.bin === bin);
  return spec?.id ?? 'native';
}

/**
 * Whether a cover-crop into `frame` would discard pixels. Square into square
 * is not a crop. Missing pixels cannot be scored.
 */
export function placementPreviewCrops(
  width: number | null | undefined,
  height: number | null | undefined,
  frame: LibraryPreviewFrame,
): boolean {
  const spec = previewFrameSpec(frame);
  if (!spec || width == null || height == null || width <= 0 || height <= 0) return false;
  const native = width / height;
  return Math.abs(native - spec.ratio) / spec.ratio > SHELF_EPSILON;
}
