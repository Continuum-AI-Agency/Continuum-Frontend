// A person Element's reference: a character continuity sheet. A product or object Element's
// reference: the product continuity sheet (PRODUCT_SHEET_GRIDS, two grids), built the same way.
//
// One page per actor — profile, turnaround, face details, expressions, poses, costume and
// palette — the way a production hands every department the same person. The model draws
// the pictures and code draws the words: every name, caption and hex on the sheet is
// composed afterwards, so nothing a model garbles can reach it.
//
// The panels come from three grid images, each generated at the ONE supported aspect ratio
// its cells imply (columns × cell width : rows × cell height) — the law `contact-sheet-grid.ts`
// holds for the reel sheets. The model does not always draw the rows equal, so the Backend
// slicer snaps each cut to the nearest real seam rather than trusting the arithmetic alone.

import type { SheetLayout } from '../creative/contact-sheet-grid';

export interface ContinuityCell {
  role: string;
  caption: string;
  /** What the cell shows, as the generation prompt states it. */
  view: string;
}

/** The composite ratios the three grids are generated at. */
export type ContinuityAspect = '3:2' | '1:1' | '4:3';

export interface ContinuityGrid {
  layout: SheetLayout & { compositeAspect: ContinuityAspect };
  /** Cell width : height. `columns × w : rows × h` is exactly `layout.compositeAspect`. */
  cellAspect: readonly [number, number];
  imageSize: '2K' | '4K';
  /** The framing every cell in the grid shares. */
  shot: string;
  cells: readonly ContinuityCell[];
}

const layoutOf = (
  columns: number,
  rows: number,
  compositeAspect: ContinuityAspect,
): ContinuityGrid['layout'] => ({
  columns,
  rows,
  compositeAspect,
  cellCount: columns * rows,
  cellWidthKeep: 1,
});

export const CONTINUITY_SHEET_GRIDS = {
  fullBody: {
    layout: layoutOf(5, 2, '3:2'),
    cellAspect: [3, 5],
    imageSize: '4K',
    shot: 'full-body photograph, head to feet uncropped with backdrop above the head and below the feet, both hands visible',
    cells: [
      {
        role: 'front',
        caption: 'FRONT',
        view: 'standing straight, facing the camera, arms relaxed',
      },
      {
        role: 'three_quarter',
        caption: 'THREE-QUARTER',
        view: 'standing turned 45 degrees from the camera',
      },
      { role: 'side', caption: 'SIDE', view: 'standing in strict side profile' },
      { role: 'back', caption: 'BACK', view: 'standing facing directly away from the camera' },
      {
        role: 'neutral_standing',
        caption: 'NEUTRAL STANDING',
        view: 'a natural relaxed standing pose facing the camera',
      },
      { role: 'walking', caption: 'WALKING', view: 'mid-stride, walking toward the camera' },
      {
        role: 'sitting',
        caption: 'SITTING',
        view: 'seated on a plain low white block, facing the camera',
      },
      { role: 'relaxed', caption: 'RELAXED', view: 'a casual stance with the weight on one leg' },
      { role: 'tense', caption: 'TENSE', view: 'arms crossed, a guarded tense posture' },
      {
        role: 'action_ready',
        caption: 'ACTION-READY',
        view: 'feet apart, a confident ready stance',
      },
    ],
  },
  headshots: {
    layout: layoutOf(4, 3, '1:1'),
    cellAspect: [3, 4],
    imageSize: '4K',
    // Framed wider than a passport photo: the model fills a tight portrait to the top edge, and a
    // high ponytail at the border reads as a cropped head (Easy Fit, 2026-10-06).
    shot: 'portrait framed a little wider than a passport photo — head, neck, shoulders and upper chest — with a clear band of plain backdrop above the top of the hair, ponytail and hair accessories (about a fifth of the rectangle height) and at both sides of the head',
    cells: [
      {
        role: 'portrait',
        caption: 'PORTRAIT',
        view: 'facing the camera with a soft natural half-smile',
      },
      { role: 'face_front', caption: 'FRONT', view: 'neutral expression, facing the camera' },
      {
        role: 'face_three_quarter',
        caption: 'THREE-QUARTER',
        view: 'neutral expression, head turned 45 degrees',
      },
      { role: 'face_profile', caption: 'PROFILE', view: 'neutral expression, strict side profile' },
      { role: 'neutral', caption: 'NEUTRAL', view: 'a calm neutral expression, facing the camera' },
      { role: 'happy', caption: 'HAPPY', view: 'a genuine happy smile, facing the camera' },
      { role: 'angry', caption: 'ANGRY', view: 'an angry frown, facing the camera' },
      { role: 'sad', caption: 'SAD', view: 'a sad expression, facing the camera' },
      {
        role: 'surprised',
        caption: 'SURPRISED',
        view: 'surprised, eyebrows raised and mouth slightly open',
      },
      { role: 'worried', caption: 'WORRIED', view: 'a worried expression, facing the camera' },
      {
        role: 'confident',
        caption: 'CONFIDENT',
        view: 'a confident subtle smile, facing the camera',
      },
      {
        role: 'determined',
        caption: 'DETERMINED',
        view: 'a determined, focused expression, facing the camera',
      },
    ],
  },
  details: {
    layout: layoutOf(4, 3, '4:3'),
    cellAspect: [1, 1],
    imageSize: '2K',
    shot: 'macro close-up filling the rectangle',
    cells: [
      { role: 'eyes', caption: 'EYES', view: 'both eyes, straight on' },
      { role: 'eyebrow', caption: 'EYEBROW', view: 'one eyebrow and the eye below it' },
      { role: 'nose', caption: 'NOSE', view: 'the nose, straight on' },
      { role: 'lips', caption: 'LIPS', view: 'the lips, relaxed and closed' },
      { role: 'hair', caption: 'HAIR', view: 'the hair texture and colour' },
      { role: 'skin', caption: 'SKIN', view: 'the skin texture of the cheek' },
      {
        role: 'top_fabric',
        caption: 'TOP FABRIC',
        view: "the top garment's fabric, weave or knit",
      },
      {
        role: 'bottom_detail',
        caption: 'BOTTOM DETAIL',
        view: "the lower garment's construction detail",
      },
      {
        role: 'sleeve_cuff',
        caption: 'SLEEVE / CUFF',
        view: 'the sleeve end or cuff on the wrist',
      },
      { role: 'footwear_detail', caption: 'FOOTWEAR', view: 'the footwear, three-quarter view' },
      { role: 'footwear_side', caption: 'FOOTWEAR SIDE', view: 'the footwear in side view' },
      { role: 'footwear_front', caption: 'FOOTWEAR FRONT', view: 'the footwear, front view' },
    ],
  },
} as const satisfies Record<string, ContinuityGrid>;

export type ContinuityGridName = keyof typeof CONTINUITY_SHEET_GRIDS;
export type ContinuitySheetRole =
  (typeof CONTINUITY_SHEET_GRIDS)[ContinuityGridName]['cells'][number]['role'];

/** The swatches the palette section samples, and the words under them. */
export const CONTINUITY_PALETTE = [
  { role: 'hair', label: 'Hair' },
  { role: 'skin', label: 'Skin' },
  { role: 'lips', label: 'Lips' },
  { role: 'top_fabric', label: 'Top' },
  { role: 'bottom_detail', label: 'Bottom' },
  { role: 'footwear_detail', label: 'Footwear' },
] as const satisfies readonly { role: ContinuitySheetRole; label: string }[];

/**
 * A product or object Element's sheet: a turnaround and a macro detail grid. The in-hand cell is
 * also the scale reference. Square cells, so both grids are 3 × 2 at 3:2.
 */
export const PRODUCT_SHEET_GRIDS = {
  turnaround: {
    layout: layoutOf(3, 2, '3:2'),
    cellAspect: [1, 1],
    imageSize: '4K',
    shot: 'product photograph with the whole product in frame and a clear band of plain backdrop on every side',
    cells: [
      {
        role: 'front',
        caption: 'FRONT',
        view: 'the product from the front, label facing the camera',
      },
      { role: 'back', caption: 'BACK', view: 'the product from directly behind' },
      { role: 'side', caption: 'SIDE', view: 'the product in strict side view' },
      {
        role: 'three_quarter',
        caption: 'THREE-QUARTER',
        view: 'the product turned 45 degrees from the camera',
      },
      { role: 'top', caption: 'TOP', view: 'the product from directly above' },
      {
        role: 'in_hand',
        caption: 'IN HAND',
        view: 'the product held in one adult hand at its true size, the hand cropped at the wrist',
      },
    ],
  },
  details: {
    layout: layoutOf(3, 2, '3:2'),
    cellAspect: [1, 1],
    imageSize: '2K',
    shot: 'macro close-up filling the rectangle',
    cells: [
      { role: 'label_front', caption: 'LABEL FRONT', view: 'the front label, straight on' },
      { role: 'label_back', caption: 'LABEL BACK', view: 'the back label, straight on' },
      { role: 'closure', caption: 'CLOSURE', view: 'the cap, lid, clasp or closure' },
      { role: 'material', caption: 'MATERIAL', view: 'the surface material and its finish' },
      { role: 'logo_mark', caption: 'LOGO', view: 'the logo mark as printed on the product' },
      { role: 'packaging', caption: 'PACKAGING', view: 'the outer packaging or box' },
    ],
  },
} as const satisfies Record<string, ContinuityGrid>;

export type ProductSheetGridName = keyof typeof PRODUCT_SHEET_GRIDS;
export type ProductSheetRole =
  (typeof PRODUCT_SHEET_GRIDS)[ProductSheetGridName]['cells'][number]['role'];

/** The swatches a product sheet samples, and the words under them. */
export const PRODUCT_SHEET_PALETTE = [
  { role: 'side', label: 'Body' },
  { role: 'closure', label: 'Closure' },
  { role: 'label_front', label: 'Label' },
  { role: 'material', label: 'Material' },
  { role: 'packaging', label: 'Packaging' },
] as const satisfies readonly { role: ProductSheetRole; label: string }[];

/** Who the grid photographs, what must hold across the cells, and the rule for text. */
export interface ContinuitySubject {
  noun: string;
  continuity: string;
  textRule: string;
}

export const PERSON_SHEET_SUBJECT: ContinuitySubject = {
  noun: 'the SAME one adult person, for a character continuity sheet',
  continuity:
    'The same one person: identical face, hair, skin tone, body proportions, marks, wardrobe, footwear and accessories.',
  textRule:
    'Do not render any text, labels, numbers, letters, logos or watermarks anywhere in the image.',
};

/**
 * A product's own printing is part of its identity, so it is copied, never invented — and
 * nothing else may be written, because the sheet's words are composed afterwards by code.
 */
export const PRODUCT_SHEET_SUBJECT: ContinuitySubject = {
  noun: 'the SAME one product, for a product continuity sheet',
  continuity:
    'The same one product: identical shape, proportions, colours, materials, finish, closure, label artwork and logo.',
  textRule:
    'Reproduce printed artwork, label text and logos exactly as the reference images show them, and add no other text, labels, numbers, captions or watermarks.',
};

/**
 * The prompt for one grid.
 *
 * `references` is one line per attached image, in attachment order — the provider sends
 * image parts unlabelled and positional, so the manifest is the only thing telling the model
 * that several pictures are one person. Layout rules come before the creative content and are
 * repeated as prohibitions, because a subject that crosses a dividing line ruins its slice.
 */
export function buildContinuityGridPrompt(
  grid: ContinuityGrid,
  input: {
    references: readonly string[];
    guidelines?: string | null;
    /** Defaults to the person, whose prompt is pinned byte for byte. */
    subject?: ContinuitySubject;
  },
): string {
  const subject = input.subject ?? PERSON_SHEET_SUBJECT;
  const { columns, rows, cellCount } = grid.layout;
  const [cellWidth, cellHeight] = grid.cellAspect;
  const orientation =
    cellWidth < cellHeight ? 'vertical' : cellWidth === cellHeight ? 'square' : 'horizontal';
  const manifest = input.references.map((line, index) => `- Image ${index + 1}: ${line}`);
  const cells = grid.cells.map(
    (cell, index) =>
      `Row ${Math.floor(index / columns) + 1}, column ${(index % columns) + 1}: ${cell.view}.`,
  );
  const guidelines = input.guidelines?.trim();

  return [
    ...(manifest.length ? [...manifest, ''] : []),
    `Produce a single image laid out as a strict ${columns}x${rows} grid of ${cellCount} separate ${orientation} studio photographs of ${subject.noun}.`,
    'LAYOUT RULES (these override everything below):',
    `- Divide the frame into ${columns} equal columns and ${rows} equal rows with straight lines; every rectangle is exactly the same size.`,
    '- The photographs meet edge to edge. No gutters, borders, margins, frames, drop shadows, rounded corners or captions.',
    `- Each rectangle holds one complete ${grid.shot}.`,
    '- No subject, limb, hair, prop or shadow may cross a dividing line.',
    `- ${subject.textRule}`,
    '',
    'CONTINUITY ACROSS EVERY RECTANGLE (this is the point of the sheet):',
    `- ${subject.continuity}`,
    '- The same seamless light-grey studio backdrop and the same soft, even studio light in every rectangle.',
    '',
    ...cells,
    ...(guidelines ? ['', `Operator guidance (highest priority): ${guidelines}`] : []),
  ].join('\n');
}
