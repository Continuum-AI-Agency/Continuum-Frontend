import { describe, expect, it } from 'bun:test';
import { buildContinuityGridPrompt, CONTINUITY_SHEET_GRIDS } from './continuity-sheet';

describe('continuity sheet grids', () => {
  it('generates every grid at exactly the ratio its cells imply, so slicing is arithmetic', () => {
    for (const grid of Object.values(CONTINUITY_SHEET_GRIDS)) {
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
});
