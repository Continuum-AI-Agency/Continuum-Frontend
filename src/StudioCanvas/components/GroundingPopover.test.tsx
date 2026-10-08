import { afterEach, describe, expect, it, mock } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { brandMdTokensSchema, type DesignSection, type Skill } from '@continuum/contracts';

let brandTokens: ReturnType<typeof brandMdTokensSchema.parse> | null = null;
let brandSkills: Skill[] = [];

// The menu reads the BRAND's system, its book, its direction and its skills. Only the
// first two shape what this file asserts; the rest are stubbed so the sections render.
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
  useBrandBook: () => ({ brandTokens }),
}));
mock.module('@/lib/brands/useBrandDirectionPieces.client', () => ({
  useBrandDirectionPieces: () => ({ pieces: [] }),
}));
mock.module('@/lib/organic/skills', () => ({
  useBrandSkills: () => ({ all: brandSkills, isLoading: false }),
}));

const skillRow = (id: string, overrides: Partial<Skill> = {}): Skill => ({
  id,
  brandId: 'brand-1',
  isTemplate: false,
  name: `Skill ${id}`,
  slug: id,
  description: null,
  kind: 'creative_direction',
  surface: 'visual',
  directives: 'Do the thing.',
  tags: [],
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});
const shortcutRow = (id: string): Skill =>
  skillRow(id, { isTemplate: true, brandId: null, tags: ['shortcut', 'shortcut:light'] });

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GroundingChip } from './GroundingChip';
import {
  effectiveDesignSections,
  GroundingMenuSections,
  GroundingPopover,
} from './GroundingPopover';

const IMAGE_ROW: DesignSection[] = ['palette', 'imagery', 'logo'];

// Base UI mounts a portalled positioner per render; on a machine running several
// benches at once the first one in a file can take longer than bun's 5s default.
const RENDER_TIMEOUT_MS = 30_000;

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

// The sections live inside menu submenus, so the harness gives them the Menu.Root
// context they need. Happy-dom cannot exercise the hover-open path (the real-browser
// bench covers it); clicking a section trigger uses the same open machinery.
function renderSections(props: Partial<React.ComponentProps<typeof GroundingMenuSections>> = {}) {
  return render(
    <DropdownMenu open>
      <DropdownMenuTrigger>chip</DropdownMenuTrigger>
      <DropdownMenuContent>
        <GroundingMenuSections
          brandId="brand-1"
          skillIds={[]}
          brandBookPieces={undefined}
          onToggleSkill={() => {}}
          onTogglePiece={() => {}}
          onToggleDesignSection={() => {}}
          {...props}
        />
      </DropdownMenuContent>
    </DropdownMenu>,
  );
}

async function openSection(name: string) {
  fireEvent.click(screen.getByText(name));
  await waitFor(() => expect(screen.getAllByRole('menuitemcheckbox').length).toBeGreaterThan(0));
}

const rowFor = (label: string) =>
  screen.getAllByRole('menuitemcheckbox').find((item) => item.textContent?.startsWith(label));

describe('GroundingMenuSections — structure', () => {
  afterEach(() => {
    brandTokens = null;
    cleanup();
  });

  it('renders the exact Brand Book token values in the generation controls', () => {
    brandTokens = brandMdTokensSchema.parse({
      brand_name: 'Bench Brand',
      colors: [{ name: 'Signal red', role: 'primary', value: '#d7263d' }],
    });
    render(
      <GroundingPopover
        brandId="brand-1"
        skillIds={[]}
        brandBookPieces={['colors']}
        onToggleSkill={() => {}}
        onTogglePiece={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Brand book/ }));
    expect(screen.getByText('Signal red (primary) #d7263d')).toBeDefined();
    expect(screen.getByLabelText('Brand colors: #d7263d')).toBeDefined();
  });

  it(
    'renders one hover submenu trigger per section when the menu is open',
    () => {
      renderSections();

      expect(screen.getByText('Style')).toBeDefined();
      expect(screen.getByText('Brand book')).toBeDefined();
      expect(screen.getByText('Design system')).toBeDefined();
      expect(screen.getByText('Creative skills')).toBeDefined();
      // No direction pieces are stubbed, so that section must not render.
      expect(screen.queryByText('Creative direction')).toBeNull();
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    'opening a section expands its checkbox rows',
    async () => {
      renderSections();

      await openSection('Design system');

      expect(rowFor('Palette')).toBeDefined();
      expect(rowFor('Imagery')).toBeDefined();
      expect(rowFor('Logo')).toBeDefined();
      expect(rowFor('Motion')).toBeDefined();
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    'fires the toggle callback when a row is clicked',
    async () => {
      const onToggleDesignSection = mock(() => {});
      renderSections({ onToggleDesignSection });

      await openSection('Design system');
      fireEvent.click(rowFor('Imagery') as HTMLElement);

      expect(onToggleDesignSection).toHaveBeenCalledWith('imagery');
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    'nudges toward Settings instead of piece rows when there is no brand book',
    async () => {
      // useBrandBook is stubbed to no tokens, so availability.full is false; pieces []
      // means enforcement is explicitly OFF (undefined would default it on).
      renderSections({ brandBookPieces: [] });

      fireEvent.click(screen.getByText('Brand book'));
      await waitFor(() =>
        expect(screen.getByText(/No brand book yet — finish it in Settings/)).toBeDefined(),
      );
      // Enforcement can still be toggled ON only when a book exists; the row is disabled.
      const enforce = rowFor('Enforce brand book');
      expect(enforce?.hasAttribute('data-disabled')).toBe(true);
    },
    RENDER_TIMEOUT_MS,
  );
});

describe('GroundingMenuSections — design-system provenance', () => {
  afterEach(cleanup);

  const checkedState = (label: string) => rowFor(label)?.getAttribute('aria-checked');

  it(
    'says "all on" and checks everything when there is no contextual default',
    async () => {
      // The pre-contextual reading, kept for any surface that has no node type.
      renderSections({ designSystemSections: undefined });

      expect(screen.getByText('all on')).toBeDefined();
      await openSection('Design system');
      expect(checkedState('Motion')).toBe('true');
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    'reports the count as AUTO and checks only the node type row',
    async () => {
      // The lie this replaces: with a per-type default, an unselected node used to render
      // every row checked and "all on" while the payload sent three sections.
      renderSections({
        designSystemSections: undefined,
        contextual: { autoApplied: IMAGE_ROW, wired: [] },
      });

      expect(screen.getByText('3 auto')).toBeDefined();
      await openSection('Design system');
      expect(screen.getByText(/Switched on by default for this kind of node/)).toBeDefined();
      expect(checkedState('Palette')).toBe('true');
      // Motion is not on an image generator's row, so it must not read as applied.
      expect(checkedState('Motion')).toBe('false');
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    'marks a wired section as supplied elsewhere, and disables its toggle',
    async () => {
      renderSections({
        designSystemSections: undefined,
        contextual: { autoApplied: IMAGE_ROW, wired: ['palette'] },
      });

      expect(screen.getByText('2 auto')).toBeDefined();
      await openSection('Design system');
      const palette = rowFor('Palette');
      expect(palette?.textContent).toContain('wired');
      // Toggling would be subtracted straight back out, so the control says so.
      expect(palette?.hasAttribute('data-disabled')).toBe(true);
      expect(rowFor('Imagery')?.hasAttribute('data-disabled')).toBe(false);
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    'reports an explicit selection as "on", not "auto"',
    async () => {
      renderSections({
        designSystemSections: ['motion'],
        contextual: { autoApplied: IMAGE_ROW, wired: [] },
      });

      expect(screen.getByText('1 on')).toBeDefined();
      await openSection('Design system');
      expect(checkedState('Motion')).toBe('true');
      expect(checkedState('Palette')).toBe('false');
    },
    RENDER_TIMEOUT_MS,
  );
});

describe('GroundingChip — hover menu wiring', () => {
  afterEach(cleanup);

  it(
    'the editable chip opens the Style menu with section triggers',
    async () => {
      // Happy-dom cannot drive Base UI's hover machinery; the same trigger opens on
      // click, and the real-browser bench proves the hover path.
      render(
        <GroundingChip
          brandId="brand-1"
          brandBookPieces={undefined}
          editable
          onToggleSkill={() => {}}
          onTogglePiece={() => {}}
          onToggleDesignSection={() => {}}
        />,
      );

      // The menu's sections are the open signal.
      fireEvent.click(screen.getByRole('button'));
      await waitFor(() => expect(screen.getByText('Brand book')).toBeDefined());
      expect(screen.getByText('Creative skills')).toBeDefined();
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    'the read-only chip gets a plain tooltip, never the menu',
    () => {
      render(<GroundingChip brandId="brand-1" brandBookPieces={undefined} inherited />);

      // No menu trigger button, and none of the menu's section triggers.
      expect(screen.queryByRole('button')).toBeNull();
      expect(screen.queryByText('Brand book')).toBeNull();
      expect(screen.queryByText('Creative skills')).toBeNull();
    },
    RENDER_TIMEOUT_MS,
  );
});

function renderInspector(props: Partial<React.ComponentProps<typeof GroundingPopover>> = {}) {
  return render(
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
}

describe('GroundingPopover — inspector sections', () => {
  afterEach(() => {
    brandSkills = [];
    cleanup();
  });

  it('starts collapsed, with a one-line summary on every header', () => {
    renderInspector({ skillIds: ['a', 'b'] });

    expect(screen.getByRole('button', { name: /Brand book/ }).textContent).toContain(
      'Light · colors, type, logo',
    );
    expect(screen.getByRole('button', { name: /Design system/ }).textContent).toContain('all on');
    expect(screen.getByRole('button', { name: /Skills/ }).textContent).toContain('2 on');
    // Collapsed: no row of any section is in the document yet.
    expect(screen.queryByText('Enforce brand book')).toBeNull();
    expect(screen.queryByText('Palette')).toBeNull();
  });

  it('says Full and Off plainly', () => {
    renderInspector({ brandBookPieces: ['full'] });
    expect(screen.getByRole('button', { name: /Brand book/ }).textContent).toContain('Full');
    cleanup();
    renderInspector({ brandBookPieces: [] });
    expect(screen.getByRole('button', { name: /Brand book/ }).textContent).toContain('Off');
  });

  it('expands a section on click', () => {
    renderInspector();
    fireEvent.click(screen.getByRole('button', { name: /Design system/ }));
    expect(screen.getByText('Palette')).toBeDefined();
  });

  it('keeps shortcut skills out of the list and points at the slash menu instead', () => {
    brandSkills = [skillRow('bold-light'), shortcutRow('goldenhour'), shortcutRow('noir')];
    renderInspector();
    fireEvent.click(screen.getByRole('button', { name: /Skills/ }));

    expect(screen.getByText('Skill bold-light')).toBeDefined();
    expect(screen.queryByText('Skill goldenhour')).toBeNull();
    expect(screen.getByText('Type / in the prompt for 2 style shortcuts')).toBeDefined();
  });

  it('still lists a shortcut that is switched on, so it can be switched off', () => {
    brandSkills = [shortcutRow('goldenhour')];
    renderInspector({ skillIds: ['goldenhour'] });
    fireEvent.click(screen.getByRole('button', { name: /Skills/ }));

    expect(screen.getByText(/Skill goldenhour/)).toBeDefined();
  });

  it('caps the skill list at eight rows behind a search box and "Show all"', () => {
    brandSkills = Array.from({ length: 11 }, (_, index) => skillRow(`s${index}`));
    renderInspector();
    fireEvent.click(screen.getByRole('button', { name: /Skills/ }));

    expect(screen.getAllByText(/^Skill s\d+$/)).toHaveLength(8);
    fireEvent.click(screen.getByRole('button', { name: 'Show all (11)' }));
    expect(screen.getAllByText(/^Skill s\d+$/)).toHaveLength(11);
  });

  it('filters the skill list from the search box', () => {
    brandSkills = Array.from({ length: 11 }, (_, index) => skillRow(`s${index}`));
    renderInspector();
    fireEvent.click(screen.getByRole('button', { name: /Skills/ }));

    fireEvent.change(screen.getByLabelText('Search skills'), { target: { value: 's10' } });
    expect(screen.getAllByText(/^Skill s\d+$/).map((node) => node.textContent)).toEqual([
      'Skill s10',
    ]);
  });
});

describe('GroundingMenuSections — shortcuts', () => {
  afterEach(() => {
    brandSkills = [];
    cleanup();
  });

  it(
    'leaves shortcut skills out of the chip submenu too',
    async () => {
      brandSkills = [skillRow('bold-light'), shortcutRow('goldenhour')];
      renderSections();

      await openSection('Creative skills');
      expect(rowFor('Skill bold-light')).toBeDefined();
      expect(rowFor('Skill goldenhour')).toBeUndefined();
      expect(screen.getByText('Type / in the prompt for 1 style shortcuts')).toBeDefined();
    },
    RENDER_TIMEOUT_MS,
  );
});

/** Source with comments stripped — a guard must read the classes, not the prose about them. */
function codeOf(file: string): string {
  return readFileSync(join(import.meta.dir, file), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('grounding chip + menu styling', () => {
  // Base UI's Positioner sets --available-height; the Radix variable no longer exists, so a
  // max-h built on it was dropped wholesale and the popup ran past the viewport. Submenu
  // surfaces float over the canvas, so they must not drag/pan/zoom the graph (nodrag nopan
  // nowheel) and must scroll themselves.
  it('bounds the submenu surfaces with the Base UI available-height variable', () => {
    const source = readFileSync(join(import.meta.dir, 'GroundingPopover.tsx'), 'utf8');
    expect(source).not.toContain('--radix-');
    expect(source).toContain('var(--available-height)');
    expect(source).toContain('nowheel');
  });

  // Airtable #281. The flat panel is mounted inside the inspector's bounded pane, where
  // `--available-height` is undefined — a Base UI Positioner sets it, and there is none
  // in that tree. `max-h-[min(32rem,var(--available-height))]` is therefore invalid at
  // computed-value time and resolves to `max-height: none` (measured in Chromium), so
  // the `overflow-y-auto` beside it made a scrollport that could never scroll. It still
  // CLAIMED the scrollport, which is what `position: sticky` resolves against, so every
  // section header slid out of the list instead of holding its top. The frame owns the
  // one scroller; this surface must not declare a second.
  it('declares no scroller of its own for the inspector surface', () => {
    const flatPanel = codeOf('GroundingPopover.tsx');
    const surface = flatPanel.slice(flatPanel.indexOf('export function GroundingPopover'));
    expect(surface).not.toContain('overflow-y-auto');
    expect(surface).not.toContain('var(--available-height)');
  });

  // The owner's "bounded, not crazy long" ask: the inspector body is collapsed sections,
  // not one long column of every row the brand has.
  it('lays the inspector surface out as accordion sections', () => {
    const surface = codeOf('GroundingPopover.tsx');
    const panel = surface.slice(surface.indexOf('export function GroundingPopover'));
    expect(panel).toContain('<Accordion type="multiple"');
    expect(panel).not.toContain('defaultValue');
  });

  // The frame, not the caller, bounds the panel and owns the pane — docs/styleguide.md §4.
  // A viewport-based bound is what let it run into the canvas's bottom-right chat
  // launcher, which covered the list and swallowed the wheel.
  it('bounds the floating panel against its container, never the viewport', () => {
    const frame = codeOf('CanvasFloatingPanel.tsx');
    expect(frame).toContain('max-h-[calc(100%-8.5rem)]');
    expect(frame).toContain(
      "cn('min-h-0 flex-1 overflow-y-auto overscroll-contain', bodyClassName)",
    );
    expect(frame).not.toContain('100vh');
    expect(codeOf('NodeInspectorPanel.tsx')).not.toContain('100vh');
  });

  it('uses the themed popover surface for brand hover details', () => {
    const source = readFileSync(join(import.meta.dir, 'GroundingChip.tsx'), 'utf8');
    const tooltip = codeOf('../../components/ui/tooltip.tsx');

    expect(source).toContain('nowheel');
    expect(source).toContain('openOnHover');
    expect(source).toContain('var(--available-height)');
    expect(source).not.toContain('text-muted-foreground');
    expect(source).not.toContain('text-foreground');
    expect(tooltip).toContain('border bg-popover');
    expect(tooltip).toContain('text-popover-foreground');
    expect(tooltip).toContain('bg-popover fill-popover');
    expect(tooltip).not.toContain('bg-foreground');
    expect(tooltip).not.toContain('text-background');
  });
});
