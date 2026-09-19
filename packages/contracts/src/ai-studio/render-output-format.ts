import { encodeContainerOf } from './api-renders';

/**
 * Which contract format a rendered file is — read from its name, never from its position.
 *
 * The fleet names each file for the comp it rendered: non-alphanumeric runs become `_` and a
 * random suffix is appended, so comp `Producto individual con descuento 9:16` comes back as
 * `Producto_individual_con_descuento_9_16_ooqxxwb.jpg`. It returns the files in a different
 * order on every job, which is why `outputs[0]` shows an arbitrary ratio.
 *
 * The rule is inferred from real template-133 renders, so it refuses rather than guesses: a name
 * two formats could answer is `null`, and a caller shows the estimate instead of the wrong frame.
 */

export interface RenderOutputFormatCandidate {
  id: string;
  ratio: string | null;
  comp?: { name: string; width: number; height: number } | null;
  mediaType?: string | null;
}

// A GIF counts as video: it is one of the files a video output delivers (`encode.files.gif`).
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'mxf', 'webm', 'gif']);

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

/** The one candidate left, after splitting a tie by still ↔ video. Null when none or several. */
function unique<T extends RenderOutputFormatCandidate>(
  candidates: T[],
  isVideo: boolean,
): T | null {
  if (candidates.length === 1) return candidates[0] ?? null;
  const sameKind = candidates.filter(
    (format) => (encodeContainerOf(format.mediaType) !== null) === isVideo,
  );
  return sameKind.length === 1 ? (sameKind[0] ?? null) : null;
}

export function matchOutputFormat<T extends RenderOutputFormatCandidate>(
  fileName: string,
  formats: readonly T[],
): T | null {
  const dot = fileName.lastIndexOf('.');
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  const isVideo = dot > 0 && VIDEO_EXTENSIONS.has(fileName.slice(dot + 1).toLowerCase());
  const underscore = stem.lastIndexOf('_');
  if (underscore <= 0) return null;
  const named = slug(stem.slice(0, underscore));

  const byComp = formats.filter((format) => format.comp && slug(format.comp.name) === named);
  if (byComp.length > 0) return unique(byComp, isVideo);

  const token = /(?:^|_)(\d+)_(\d+)$/.exec(named);
  if (!token) return null;
  const ratio = `${token[1]}:${token[2]}`;
  return unique(
    formats.filter((format) => format.ratio === ratio),
    isVideo,
  );
}

const isSize = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) > 0;

/**
 * The formats a parsed template delivers — one per delivery comp, in the designer's order.
 *
 * For a template whose contract publishes no outputs: template 133's forge surface answers
 * `outputs: []`, so its parse is the only place its formats are written down. Unvalidated JSON
 * from the forge, so a size the contract schema would refuse is dropped rather than published.
 */
export function outputFormatsOfParse(
  parse:
    | {
        comps?: ReadonlyArray<{ name: string; width: number; height: number }>;
        ratios?: ReadonlyArray<{
          ratio: string;
          width: number;
          height: number;
          comps?: readonly string[];
        }>;
      }
    | null
    | undefined,
): RenderOutputFormatCandidate[] {
  return (parse?.ratios ?? []).flatMap((entry) =>
    (entry.comps ?? []).flatMap((name) => {
      const measured = parse?.comps?.find((candidate) => candidate.name === name) ?? entry;
      const { width, height } = measured;
      return isSize(width) && isSize(height)
        ? [{ id: name, ratio: entry.ratio, comp: { name, width, height } }]
        : [];
    }),
  );
}
