import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import {
  BLANK_SURFACE,
  buildContinuityGridPrompt,
  CONTINUITY_SHEET_GRIDS,
  PRODUCT_SHEET_GRIDS,
  PRODUCT_SHEET_SUBJECT,
  printedFacesShown,
} from './continuity-sheet';

describe('continuity sheet grids', () => {
  it('generates every grid at exactly the ratio its cells imply, so slicing is arithmetic', () => {
    for (const grid of [
      ...Object.values(CONTINUITY_SHEET_GRIDS),
      ...Object.values(PRODUCT_SHEET_GRIDS),
    ]) {
      const { columns, rows, compositeAspect, cellCount } = grid.layout;
      const [cellWidth, cellHeight] = grid.cellAspect;
      const [aspectWidth, aspectHeight] = compositeAspect.split(':').map(Number);
      expect(columns * cellWidth * aspectHeight!).toBe(rows * cellHeight * aspectWidth!);
      expect(grid.cells).toHaveLength(cellCount);
    }
  });

  it('never repeats a role across the sheet', () => {
    const roles = Object.values(CONTINUITY_SHEET_GRIDS).flatMap((grid) =>
      grid.cells.map((cell) => cell.role),
    );
    expect(new Set(roles).size).toBe(roles.length);
  });

  it('places every cell by row and column, manifest first and guidance last', () => {
    const prompt = buildContinuityGridPrompt(CONTINUITY_SHEET_GRIDS.fullBody, {
      references: ['source photograph of the person.'],
      guidelines: 'Keep the freckles.',
    });
    const lines = prompt.split('\n');
    expect(lines[0]).toBe('- Image 1: source photograph of the person.');
    expect(prompt).toContain('strict 5x2 grid of 10 separate vertical studio photographs');
    expect(prompt).toContain('Row 1, column 4: standing facing directly away from the camera.');
    expect(prompt).toContain('Row 2, column 5: feet apart, a confident ready stance.');
    expect(lines.at(-1)).toBe('Operator guidance (highest priority): Keep the freckles.');
  });

  it('never repeats a role across the product sheet', () => {
    const roles = Object.values(PRODUCT_SHEET_GRIDS).flatMap((grid) =>
      grid.cells.map((cell) => cell.role),
    );
    expect(new Set(roles).size).toBe(roles.length);
  });

  // Pinned before the subject parameter existed: the person sheet's prompts must not move.
  it('builds the person prompt byte for byte as it was before subjects existed', () => {
    expect(
      buildContinuityGridPrompt(CONTINUITY_SHEET_GRIDS.fullBody, {
        references: ['source photograph of the person.'],
      }),
    ).toBe(
      '- Image 1: source photograph of the person.\n\nProduce a single image laid out as a strict 5x2 grid of 10 separate vertical studio photographs of the SAME one adult person, for a character continuity sheet.\nLAYOUT RULES (these override everything below):\n- Divide the frame into 5 equal columns and 2 equal rows with straight lines; every rectangle is exactly the same size.\n- The photographs meet edge to edge. No gutters, borders, margins, frames, drop shadows, rounded corners or captions.\n- Each rectangle holds one complete full-body photograph, head to feet uncropped with backdrop above the head and below the feet, both hands visible.\n- No subject, limb, hair, prop or shadow may cross a dividing line.\n- Do not render any text, labels, numbers, letters, logos or watermarks anywhere in the image.\n\nCONTINUITY ACROSS EVERY RECTANGLE (this is the point of the sheet):\n- The same one person: identical face, hair, skin tone, body proportions, marks, wardrobe, footwear and accessories.\n- The same seamless light-grey studio backdrop and the same soft, even studio light in every rectangle.\n\nRow 1, column 1: standing straight, facing the camera, arms relaxed.\nRow 1, column 2: standing turned 45 degrees from the camera.\nRow 1, column 3: standing in strict side profile.\nRow 1, column 4: standing facing directly away from the camera.\nRow 1, column 5: a natural relaxed standing pose facing the camera.\nRow 2, column 1: mid-stride, walking toward the camera.\nRow 2, column 2: seated on a plain low white block, facing the camera.\nRow 2, column 3: a casual stance with the weight on one leg.\nRow 2, column 4: arms crossed, a guarded tense posture.\nRow 2, column 5: feet apart, a confident ready stance.',
    );
    const anchored = [
      'the full-body front view already made for this sheet; match its face, hair, skin, build, wardrobe and footwear exactly.',
      'source photograph of the person.',
    ];
    const digest = (name: keyof typeof CONTINUITY_SHEET_GRIDS, references: string[]) =>
      createHash('sha256')
        .update(
          buildContinuityGridPrompt(CONTINUITY_SHEET_GRIDS[name], {
            references,
            guidelines: 'Keep the freckles.',
          }),
        )
        .digest('hex');
    expect(
      digest('fullBody', ['source photograph of the person.', 'source photograph of the person.']),
    ).toBe('f19d20cd5337c8e34a993a1568a91562794d217bc268338a68970b3ebdd44bb3');
    expect(digest('headshots', anchored)).toBe(
      'c2357c042535917eb8b1326e2af55fab80a702dd4c5e3ef94461e0786c04ddc2',
    );
    expect(digest('details', anchored)).toBe(
      '3ff1514be7476ac58e1763af3d318113959bb9fb41e13b3c8fe1fb22ddb93c85',
    );
  });

  it('asks a product grid to copy printed artwork only where a reference shows it', () => {
    const subject = PRODUCT_SHEET_SUBJECT;
    const prompt = buildContinuityGridPrompt(PRODUCT_SHEET_GRIDS.turnaround, {
      references: ['source photograph of the product, front view.'],
      subject,
      printedFaces: ['front'],
    });
    expect(prompt).toContain(
      'strict 3x2 grid of 6 separate square studio photographs of the SAME one product',
    );
    expect(prompt).toContain(`- ${subject.textRule}`);
    expect(prompt).not.toContain('Do not render any text');
    // The front is shown, so it keeps its artwork; nobody photographed the back.
    expect(prompt).toContain(
      'Row 1, column 1: the product from the front, label and wordmark centred and squarely facing the camera.',
    );
    expect(prompt).toContain(
      `Row 1, column 2: the product from directly behind, ${BLANK_SURFACE}.`,
    );
    expect(prompt).toContain('Row 2, column 3: the product held in one adult hand');
    expect(prompt).not.toContain(`hand cropped at the wrist, ${BLANK_SURFACE}`);
    expect(prompt).toContain(
      "identical silhouette in every rectangle: the reference's height-to-width proportions, shoulder, neck and closure geometry",
    );
  });

  it('requests no printed text for a text view no reference shows', () => {
    const prompt = buildContinuityGridPrompt(PRODUCT_SHEET_GRIDS.details, {
      references: ['the front view already made for this sheet.'],
      subject: PRODUCT_SHEET_SUBJECT,
      printedFaces: [],
    });
    const lines = prompt.split('\n').filter((line) => line.startsWith('Row '));
    expect(lines).toEqual([
      `Row 1, column 1: the front of the product, straight on, ${BLANK_SURFACE}.`,
      `Row 1, column 2: the back of the product, straight on, ${BLANK_SURFACE}.`,
      'Row 1, column 3: the cap, lid, clasp or closure.',
      'Row 2, column 1: the surface material and its finish.',
      `Row 2, column 2: the product surface where its logo would sit, ${BLANK_SURFACE}.`,
      `Row 2, column 3: plain outer packaging in the product's own colours, every edge inside the rectangle, ${BLANK_SURFACE}.`,
    ]);
    // A back member brings the back label back, and only it.
    const withBack = buildContinuityGridPrompt(PRODUCT_SHEET_GRIDS.details, {
      references: [],
      subject: PRODUCT_SHEET_SUBJECT,
      printedFaces: printedFacesShown(['back']),
    });
    expect(withBack).toContain(
      'Row 1, column 2: the whole back label, straight on, all four edges inside the rectangle.',
    );
    expect(withBack).toContain(
      `Row 1, column 1: the front of the product, straight on, ${BLANK_SURFACE}.`,
    );
  });

  it('reads a member with no role as the front, and only the named roles as back or packaging', () => {
    expect(printedFacesShown([null])).toEqual(['front']);
    expect(printedFacesShown([undefined, 'in_hand'])).toEqual(['front']);
    expect(printedFacesShown(['back', 'side'])).toEqual(['back']);
    expect(printedFacesShown(['label', 'packaging'])).toEqual(['front', 'packaging']);
    expect(printedFacesShown(['detail', 'top', 'side'])).toEqual([]);
  });

  it('keeps every person cell free of the printed rule', () => {
    for (const grid of Object.values(CONTINUITY_SHEET_GRIDS))
      for (const cell of grid.cells) expect('printed' in cell).toBe(false);
  });
});
