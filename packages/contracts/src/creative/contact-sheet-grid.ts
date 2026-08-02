// The contact sheet as ONE image, sliced — instead of N images that have to agree.
//
// N panels generated independently are N forward passes, each re-interpreting the
// creator from the same reference. That is the structural reason identity drifts
// between panels, and the reason a separate "casting anchor" call had to exist at all.
// Generate the whole sheet in one pass and the panels share a face, a wardrobe, a key
// light and a product geometry by construction.
//
// This is only safe because the geometry is EXACT. A panel is 9:16. A 2x2 grid of 9:16
// panels is (2*9):(2*16) = 18:32 = 9:16 — the composite is the same ratio as its cells,
// so slicing is arithmetic rather than a crop that guesses. Every other small layout is
// a ratio the image models do not offer:
//
//   2 panels side by side -> 18:16  (9:8)   — unsupported
//   3 panels in a row     -> 27:16          — unsupported, and 16:9 is 5% off
//   2x3                   -> 18:48  (3:8)   — unsupported
//
// So 2x2 is the layout, and `sceneCount` defaults to 4 (reel-video.ts), which means the
// default reel is exactly one sheet. A 3-scene reel uses the fourth cell for the casting
// reference; a 5-scene reel is one sheet plus one single panel.

export interface SheetLayout {
  columns: number;
  rows: number;
  /** The aspect ratio the composite must be generated at for cells to come out square-true. */
  compositeAspect: '9:16' | '21:9';
  cellCount: number;
  /**
   * Fraction of each sliced cell's width to keep when correcting it back to 9:16.
   * 1 means the cell is already 9:16 and no correction is needed.
   */
  cellWidthKeep: number;
}

const TWO_BY_TWO: SheetLayout = {
  columns: 2,
  rows: 2,
  compositeAspect: '9:16',
  cellCount: 4,
  cellWidthKeep: 1,
};

/**
 * Four panels in a row at 21:9.
 *
 * Not an exact fit — four 9:16 cells want 9:4 (2.25) and 21:9 is 2.333 — so each cell
 * lands 3.7% wide and is centre-cropped back to 9:16, costing 3.7% of the width. That
 * is a real but small price, and it buys a composition shape (a wide strip) that image
 * models see far more often in training than a 2x2 quadrant grid.
 */
const STRIP_OF_FOUR: SheetLayout = {
  columns: 4,
  rows: 1,
  compositeAspect: '21:9',
  cellCount: 4,
  // (9/16) / (21/9/4) = 0.964
  cellWidthKeep: 9 / 16 / (21 / 9 / 4),
};

export const SHEET_LAYOUTS = { grid: TWO_BY_TWO, strip: STRIP_OF_FOUR } as const;
export type SheetLayoutName = keyof typeof SHEET_LAYOUTS;

/**
 * The grid a sheet of `panelCount` panels is generated in.
 *
 * Only 3 and 4 are sheet-able in one pass. Three panels still use the 2x2 grid — the
 * spare cell is the casting reference, which is useful rather than wasted. Anything
 * else must not silently fall back to a wrong ratio: a 5% aspect error on the
 * composite is a 5% stretch on every face in it.
 */
export function planSheetGrid(panelCount: number, name: SheetLayoutName = 'grid'): SheetLayout {
  if (panelCount === 3 || panelCount === 4) return SHEET_LAYOUTS[name];
  throw new Error(
    `Only 3 or 4 panels fit one 2x2 sheet at an exact 9:16 composite; received ${panelCount}. ` +
      'Generate a 2x2 sheet plus single panels for the remainder rather than distorting the grid.',
  );
}

export interface CellRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The pixel rectangle of one cell.
 *
 * Boundaries are computed and then differenced, never rounded independently — rounding
 * each cell's width separately leaves a seam column at the right edge on odd dimensions,
 * which shows up as a black stripe down the side of a panel.
 */
export function sheetCellRect(
  index: number,
  composite: { width: number; height: number },
  layout: SheetLayout = TWO_BY_TWO,
): CellRect {
  if (!Number.isInteger(index) || index < 0 || index >= layout.cellCount) {
    throw new Error(`Cell ${index} is outside a ${layout.columns}x${layout.rows} sheet.`);
  }
  const column = index % layout.columns;
  const row = Math.floor(index / layout.columns);

  const left = Math.round((composite.width * column) / layout.columns);
  const right = Math.round((composite.width * (column + 1)) / layout.columns);
  const top = Math.round((composite.height * row) / layout.rows);
  const bottom = Math.round((composite.height * (row + 1)) / layout.rows);

  return { left, top, width: right - left, height: bottom - top };
}

/**
 * The instruction that makes the composite sliceable.
 *
 * Everything here is in service of one thing: hard, straight, edge-to-edge quadrant
 * boundaries. A subject that bleeds across the gutter makes its slice unusable, so the
 * layout rules are stated before the creative content and repeated as prohibitions.
 *
 * Note this is the ONE place the single-frame rule is deliberately inverted. The sheet
 * is an intermediate that is sliced before anything is delivered or animated — no
 * collage ever reaches a user or a Veo call.
 */
export function renderContactSheetPrompt(
  panels: readonly { label: string; body: string }[],
  layout: SheetLayout = TWO_BY_TWO,
): string {
  const ordinal = ['FIRST', 'SECOND', 'THIRD', 'FOURTH'];
  const cells = panels
    .slice(0, layout.cellCount)
    .map((panel, index) => {
      const position =
        layout.rows === 1
          ? `${ordinal[index]} PANEL FROM THE LEFT`
          : `${Math.floor(index / layout.columns) === 0 ? 'TOP' : 'BOTTOM'}-${index % layout.columns === 0 ? 'LEFT' : 'RIGHT'} QUADRANT`;
      return `${position} — ${panel.label}\n${panel.body}`;
    })
    .join('\n\n');

  const divisions =
    layout.rows === 1
      ? `- Divide the frame into ${layout.cellCount} equal vertical panels of identical width by ${layout.cellCount - 1} straight vertical lines, like a strip of film frames.`
      : '- Divide the frame into 4 equal rectangles by one straight vertical line at the exact horizontal centre and one straight horizontal line at the exact vertical centre.';

  return [
    layout.rows === 1
      ? `Produce a single wide image laid out as a strip of ${layout.cellCount} separate vertical photographs side by side.`
      : `Produce a single image laid out as a strict ${layout.columns}x${layout.rows} grid of ${layout.cellCount} separate vertical photographs.`,
    'LAYOUT RULES (these override everything below):',
    divisions,
    '- Every photograph bleeds to the outer edge of the frame. There is no white space, no background canvas, and no empty margin anywhere in the image.',
    '- Each rectangle contains one complete, self-contained photograph. Treat each as its own shot.',
    '- No subject, limb, product, prop, shadow or background element may cross a dividing line.',
    '- No gutters, borders, margins, frames, drop shadows, rounded corners, or captions between or around the rectangles. The photographs meet edge to edge.',
    '- Do not render any text, labels, numbers, letters, logos or watermarks anywhere in the image.',
    '',
    'CONTINUITY ACROSS ALL FOUR PHOTOGRAPHS (this is the point of the sheet):',
    '- The same one person, with identical facial structure, hair, skin tone, body proportions, wardrobe and accessories in every rectangle.',
    '- The same physical product, with identical packaging geometry, label placement, colours and materials in every rectangle.',
    '- Consistent lighting direction, colour temperature and grade across all four.',
    '',
    cells,
  ].join('\n');
}
