import { afterEach, describe, expect, it, mock } from 'bun:test';

// The popover reads the BRAND's system, its book, its direction and its skills. Only the
// first shapes what this file asserts; the rest are stubbed so the panel renders.
mock.module('@/lib/brands/useBrandDesignSections.client', () => ({
  useBrandDesignSections: () => ({
    sections: [
      { section: 'palette', title: 'Palette', ruleCount: 4, gates: true },
      { section: 'imagery', title: 'Imagery', ruleCount: 2, gates: false },
      { section: 'logo', title: 'Logo', ruleCount: 1, gates: false },
      { section: 'motion', title: 'Motion', ruleCount: 3, gates: false },
    ],
    snapshot: null,
    designSystemId: 'ds-1',
    isLoading: false,
    error: null,
  }),
}));
mock.module('@/lib/brands/useBrandBook.client', () => ({
  useBrandBook: () => ({ brandTokens: null }),
}));
mock.module('@/lib/brands/useBrandDirectionPieces.client', () => ({
  useBrandDirectionPieces: () => ({ pieces: [] }),
}));
mock.module('@/lib/organic/skills', () => ({
  useBrandSkills: () => ({ all: [], isLoading: false }),
}));

import type { DesignSection } from '@continuum/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { effectiveDesignSections, GroundingPopover } from './GroundingPopover';

const IMAGE_ROW: DesignSection[] = ['palette', 'imagery', 'logo'];

describe('effectiveDesignSections', () => {
  it('is null with neither a selection nor a node-type row — the old "all on" reading', () => {
    expect(effectiveDesignSections(undefined, undefined)).toBeNull();
  });

  it('falls back to the node type row when nobody picked', () => {
    expect(effectiveDesignSections(undefined, { autoApplied: IMAGE_ROW, wired: [] })).toEqual(
      IMAGE_ROW,
    );
  });

  it('subtracts a wired section from the ambient row', () => {
    expect(
      effectiveDesignSections(undefined, { autoApplied: IMAGE_ROW, wired: ['palette'] }),
    ).toEqual(['imagery', 'logo']);
  });

  it('subtracts a wired section from an explicit selection too', () => {
    expect(
      effectiveDesignSections(['palette', 'motion'], { autoApplied: IMAGE_ROW, wired: ['motion'] }),
    ).toEqual(['palette']);
  });

  it('keeps an empty selection empty rather than reverting to "all"', () => {
    expect(effectiveDesignSections([], { autoApplied: IMAGE_ROW, wired: [] })).toEqual([]);
    expect(effectiveDesignSections([], undefined)).toEqual([]);
  });
});

describe('GroundingPopover — design-system provenance', () => {
  afterEach(cleanup);

  const renderPopover = (props: Partial<React.ComponentProps<typeof GroundingPopover>> = {}) =>
    render(
      <GroundingPopover
        brandId="brand-1"
        skillIds={[]}
        brandBookPieces={undefined}
        onToggleSkill={() => {}}
        onTogglePiece={() => {}}
        onToggleDesignSection={() => {}}
        {...props}
      />,
    );

  const rowFor = (label: string) =>
    screen.getAllByRole('button').find((button) => button.textContent?.startsWith(label));

  it('says "all on" and checks everything when there is no contextual default', () => {
    // The pre-contextual reading, kept for any surface that has no node type.
    renderPopover({ designSystemSections: undefined });

    expect(screen.getByText('all on')).toBeDefined();
    expect(rowFor('Motion')?.querySelector('svg')).not.toBeNull();
  });

  it('reports the count as AUTO and checks only the node type row', () => {
    // The lie this replaces: with a per-type default, an unselected node used to render
    // every row checked and "all on" while the payload sent three sections.
    renderPopover({
      designSystemSections: undefined,
      contextual: { autoApplied: IMAGE_ROW, wired: [] },
    });

    expect(screen.getByText('3 auto')).toBeDefined();
    expect(screen.getByText(/Switched on by default for this kind of node/)).toBeDefined();
    expect(rowFor('Palette')?.querySelector('svg')).not.toBeNull();
    // Motion is not on an image generator's row, so it must not read as applied.
    expect(rowFor('Motion')?.querySelector('svg')).toBeNull();
  });

  it('marks a wired section as supplied elsewhere, and disables its toggle', () => {
    renderPopover({
      designSystemSections: undefined,
      contextual: { autoApplied: IMAGE_ROW, wired: ['palette'] },
    });

    expect(screen.getByText('2 auto')).toBeDefined();
    const palette = rowFor('Palette');
    expect(palette?.textContent).toContain('wired');
    expect(palette?.textContent).toContain('Supplied by a connected Design Reference');
    // Toggling would be subtracted straight back out, so the control says so.
    expect((palette as HTMLButtonElement).disabled).toBe(true);
    expect((rowFor('Imagery') as HTMLButtonElement).disabled).toBe(false);
  });

  it('reports an explicit selection as "on", not "auto"', () => {
    renderPopover({
      designSystemSections: ['motion'],
      contextual: { autoApplied: IMAGE_ROW, wired: [] },
    });

    expect(screen.getByText('1 on')).toBeDefined();
    expect(rowFor('Motion')?.querySelector('svg')).not.toBeNull();
    expect(rowFor('Palette')?.querySelector('svg')).toBeNull();
  });
});
