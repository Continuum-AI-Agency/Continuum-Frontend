import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import { OptimizerSurfaceSkeleton } from './OptimizerSurfaceSkeleton';

afterEach(cleanup);

// happy-dom lays nothing out, so the 390px fit is pinned as the class contract that produces
// it; the optimizer e2e type-scale test measures the real layout at 390 while it loads.
const classesOf = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/);
const TAILWIND_SPACING_PX = 4;
// A phone panel is 390px less the page gutters; a fixed block wider than half of it cannot sit
// beside a label without pushing the row past the edge.
const WIDEST_FIXED_BLOCK_PX = 160;

describe('OptimizerSurfaceSkeleton — fits a 390px panel', () => {
  it('sizes its one grid column to the panel instead of to its widest child', () => {
    const { container } = render(<OptimizerSurfaceSkeleton />);
    const frame = container.firstElementChild;
    if (!frame) throw new Error('no skeleton frame');
    expect(classesOf(frame)).toContain('grid');
    // An implicit `auto` column grows to the header's min-content; this one cannot.
    expect(classesOf(frame)).toContain('grid-cols-[minmax(0,1fr)]');
  });

  it('carries no fixed-width block wide enough to push a row past a phone panel', () => {
    const { container } = render(<OptimizerSurfaceSkeleton />);
    const wide = [...container.querySelectorAll('*')].flatMap((el) =>
      classesOf(el)
        .map((name) => /^w-(\d+(?:\.\d+)?)$/.exec(name)?.[1])
        .filter((step): step is string => step !== undefined)
        .filter((step) => Number(step) * TAILWIND_SPACING_PX > WIDEST_FIXED_BLOCK_PX),
    );
    expect(wide).toEqual([]);
  });
});
