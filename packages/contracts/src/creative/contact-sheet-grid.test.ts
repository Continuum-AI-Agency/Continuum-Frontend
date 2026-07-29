import { describe, expect, it } from 'bun:test';
import { planSheetGrid, renderContactSheetPrompt, sheetCellRect } from './contact-sheet-grid';

describe('planSheetGrid', () => {
  it('uses the one layout whose composite ratio equals its cell ratio', () => {
    const layout = planSheetGrid(4);
    expect(layout.columns).toBe(2);
    expect(layout.rows).toBe(2);
    expect(layout.compositeAspect).toBe('9:16');
    expect(layout.cellWidthKeep).toBe(1);
    // (2*9):(2*16) = 18:32 = 9:16 — the whole reason slicing is exact.
    expect((2 * 9) / (2 * 16)).toBeCloseTo(9 / 16, 10);
  });

  it('sheets three panels too — the spare cell is the casting reference', () => {
    expect(planSheetGrid(3).cellCount).toBe(4);
  });

  it('refuses counts that would need a distorted composite', () => {
    for (const count of [1, 2, 5, 6]) {
      expect(() => planSheetGrid(count)).toThrow(/2x2 sheet at an exact 9:16/);
    }
  });
});

describe('sheetCellRect', () => {
  const composite = { width: 2304, height: 4096 }; // 4K at 9:16

  it('cuts a 4K sheet into four Veo-ready panels', () => {
    const cells = [0, 1, 2, 3].map((index) => sheetCellRect(index, composite));

    for (const cell of cells) {
      expect(cell.width).toBe(1152);
      expect(cell.height).toBe(2048);
      // Comfortably above the 720x1280 a Veo first_frame needs.
      expect(cell.width).toBeGreaterThanOrEqual(720);
      expect(cell.height).toBeGreaterThanOrEqual(1280);
    }
    expect(cells[0]).toEqual({ left: 0, top: 0, width: 1152, height: 2048 });
    expect(cells[1]).toEqual({ left: 1152, top: 0, width: 1152, height: 2048 });
    expect(cells[2]).toEqual({ left: 0, top: 2048, width: 1152, height: 2048 });
    expect(cells[3]).toEqual({ left: 1152, top: 2048, width: 1152, height: 2048 });
  });

  it('each cell keeps the 9:16 ratio of the panel it becomes', () => {
    const cell = sheetCellRect(0, composite);
    expect(cell.width / cell.height).toBeCloseTo(9 / 16, 6);
  });

  it('tiles odd dimensions with no seam and no overlap', () => {
    const odd = { width: 2305, height: 4097 };
    const cells = [0, 1, 2, 3].map((index) => sheetCellRect(index, odd));

    // Row 0 and row 1 each span the full width exactly.
    expect(cells[0].width + cells[1].width).toBe(odd.width);
    expect(cells[2].width + cells[3].width).toBe(odd.width);
    // Column 0 and column 1 each span the full height exactly.
    expect(cells[0].height + cells[2].height).toBe(odd.height);
    expect(cells[1].height + cells[3].height).toBe(odd.height);
    // Neighbours meet exactly: no gap, no overlap.
    expect(cells[0].left + cells[0].width).toBe(cells[1].left);
    expect(cells[0].top + cells[0].height).toBe(cells[2].top);
  });

  it('rejects a cell outside the grid', () => {
    expect(() => sheetCellRect(4, composite)).toThrow(/outside a 2x2 sheet/);
    expect(() => sheetCellRect(-1, composite)).toThrow(/outside a 2x2 sheet/);
  });
});

describe('renderContactSheetPrompt', () => {
  const panels = [
    { label: 'HOOK', body: 'the founder lifts the bottle' },
    { label: 'DETAIL', body: 'close on the label' },
    { label: 'PROOF', body: 'pouring into a glass' },
    { label: 'CTA', body: 'holding it toward camera' },
  ];

  it('states the layout rules before any creative content', () => {
    const prompt = renderContactSheetPrompt(panels);
    expect(prompt.indexOf('LAYOUT RULES')).toBeLessThan(prompt.indexOf('HOOK'));
  });

  it('names each quadrant so a slice lands on the shot it claims to be', () => {
    const prompt = renderContactSheetPrompt(panels);
    expect(prompt).toContain('TOP-LEFT QUADRANT — HOOK');
    expect(prompt).toContain('TOP-RIGHT QUADRANT — DETAIL');
    expect(prompt).toContain('BOTTOM-LEFT QUADRANT — PROOF');
    expect(prompt).toContain('BOTTOM-RIGHT QUADRANT — CTA');
  });

  it('forbids the things that would make a slice unusable', () => {
    const prompt = renderContactSheetPrompt(panels);
    expect(prompt).toContain('may cross a dividing line');
    expect(prompt).toContain('No gutters, borders, margins');
    expect(prompt).toContain('Do not render any text');
  });

  it('demands cross-panel identity, which is the whole reason for one pass', () => {
    const prompt = renderContactSheetPrompt(panels);
    expect(prompt).toContain('The same one person');
    expect(prompt).toContain('identical facial structure');
    expect(prompt).toContain('Consistent lighting direction');
  });

  it('never emits more cells than the grid holds', () => {
    const prompt = renderContactSheetPrompt([...panels, { label: 'EXTRA', body: 'overflow' }]);
    expect(prompt).not.toContain('EXTRA');
  });
});

describe('the 21:9 strip layout', () => {
  it('needs a small width correction because four 9:16 cells want 9:4, not 21:9', () => {
    const strip = planSheetGrid(4, 'strip');
    expect(strip.columns).toBe(4);
    expect(strip.rows).toBe(1);
    expect(strip.compositeAspect).toBe('21:9');
    // 3.7% of the width is cropped away to get each cell back to 9:16.
    expect(strip.cellWidthKeep).toBeCloseTo(0.964, 3);
  });

  it('slices a wide composite into four full-height cells', () => {
    const strip = planSheetGrid(4, 'strip');
    const cells = [0, 1, 2, 3].map((i) => sheetCellRect(i, { width: 4096, height: 1755 }, strip));
    for (const cell of cells) expect(cell.height).toBe(1755);
    expect(cells[0].width + cells[1].width + cells[2].width + cells[3].width).toBe(4096);
    expect(cells[0].left).toBe(0);
    expect(cells[3].left + cells[3].width).toBe(4096);
  });

  it('names panels left-to-right rather than by quadrant', () => {
    const prompt = renderContactSheetPrompt(
      [
        { label: 'HOOK', body: 'a' },
        { label: 'DETAIL', body: 'b' },
        { label: 'PROOF', body: 'c' },
        { label: 'CTA', body: 'd' },
      ],
      planSheetGrid(4, 'strip'),
    );
    expect(prompt).toContain('FIRST PANEL FROM THE LEFT — HOOK');
    expect(prompt).toContain('FOURTH PANEL FROM THE LEFT — CTA');
    expect(prompt).toContain('strip of film frames');
    expect(prompt).toContain('no empty margin anywhere');
  });
});
