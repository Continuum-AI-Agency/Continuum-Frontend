import { afterEach, describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render } from '@testing-library/react';

import { Button, buttonVariants } from './button';
import { ButtonGroup } from './button-group';
import { Checkbox } from './checkbox';
import { RadioGroup, RadioGroupItem } from './radio-group';
import { Select, SelectTrigger, SelectValue } from './select';
import { Switch } from './switch';
import { Tabs, TabsList, TabsTrigger } from './tabs';
import { Toggle, toggleVariants } from './toggle';
import { ToggleGroup, ToggleGroupItem } from './toggle-group';

// WCAG 2.2 AA 2.5.8 at the root: every shared primitive that can paint under 24 CSS px carries
// the `hit-area` utility (globals.css), so each caller inherits an invisible 24px pointer
// target (44px under a coarse pointer) instead of patching it screen by screen. Four
// constraints the redesign review holds this to, each pinned here:
//   1. the DRAWN size is unchanged — the size classes stay, nothing adds min-size or margin;
//   2. the pad never shares a pseudo-element the primitive already paints with;
//   3. the floor is px, never rem — the root font drops to 13px on short viewports;
//   4. neighbouring pads never overlap: a row container (TabsList, ToggleGroup, ButtonGroup)
//      caps each child's growth along the row at the gap it shares — half per side, nothing
//      when the controls touch — and anchors the row's two ends so they grow outward only.

afterEach(cleanup);

const globals = readFileSync(join(import.meta.dir, '../../app/globals.css'), 'utf8');

function utilityBlock(name: string): string {
  const start = globals.indexOf(`@utility ${name} {`);
  expect(start, `globals.css declares @utility ${name}`).toBeGreaterThan(-1);
  return globals.slice(start, globals.indexOf('\n}\n', start));
}

function classesOf(el: Element | null): string[] {
  if (!el) throw new Error('element did not render');
  return (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
}

/** The pad lives on `::after`; any other `after:` utility on the same element would collide. */
function expectOwnsAfter(classes: string[]) {
  expect(classes).toContain('hit-area');
  expect(classes.filter((name) => name.includes('after:'))).toEqual([]);
}

describe('hit-area utilities', () => {
  it('floors the pad in px — 24px fine, 44px coarse — and never in rem', () => {
    for (const [name, pseudo] of [
      ['hit-area', '&::after'],
      ['hit-area-before', '&::before'],
    ] as const) {
      const block = utilityBlock(name);
      expect(block).toContain(pseudo);
      expect(block).toContain('opacity: 0');
      expect(block).toContain('--hit-area-floor: 24px');
      expect(block).toMatch(/pointer: coarse\)\s*\{\s*--hit-area-floor: var\(--hit-area-coarse, 44px\)/);
      expect(block).toContain('max(var(--hit-area-floor), var(--hit-area-min-w, 0px))');
      expect(block).toContain('min(var(--hit-area-floor), calc(100% + var(--hit-area-gap-y, 100vh)))');
      expect(block).not.toMatch(/\d(\.\d+)?rem/);
    }
  });

  it('only ever grows the drawn box, and along a row no further than the shared gap', () => {
    const block = utilityBlock('hit-area');
    expect(block).toMatch(/width: max\(\s*100%,/);
    expect(block).toMatch(/height: max\(\s*100%,/);
    expect(block).toContain('calc(100% + var(--hit-area-gap-x, 100vw))');
    expect(block).toContain('calc(100% + var(--hit-area-gap-y, 100vh))');
  });

  it('a row hands its children the gap; its two ends anchor inward and grow outward', () => {
    const row = utilityBlock('hit-area-row');
    expect(row).toContain('--hit-area-gap-x: var(--hit-area-gap, 0px)');
    // A segment keeps the 24px floor under a coarse pointer: 44px would reach its neighbours.
    expect(row).toContain('--hit-area-coarse: 24px');
    expect(utilityBlock('hit-area-column')).toContain('--hit-area-coarse: 24px');
    const first = row.slice(row.indexOf(':first-child:not(:last-child)'));
    expect(first).toMatch(/--hit-area-left: auto;\s*--hit-area-right: 0px;\s*--hit-area-tx: 0px/);
    const last = row.slice(row.indexOf(':last-child:not(:first-child)'));
    expect(last).toMatch(/--hit-area-left: 0px;\s*--hit-area-tx: 0px/);
    expect(utilityBlock('hit-area-column')).toContain('--hit-area-gap-y: var(--hit-area-gap, 0px)');
  });
});

describe('Button', () => {
  const small = ['xs', 'sm', 'icon-xs', 'icon-sm'] as const;
  const drawn: Record<(typeof small)[number], string> = {
    xs: 'h-6',
    sm: 'h-7',
    'icon-xs': 'size-6',
    'icon-sm': 'size-7',
  };

  it('gives every size that can paint under 24px the hit area, at its drawn size', () => {
    for (const size of small) {
      const classes = buttonVariants({ size }).split(' ');
      expectOwnsAfter(classes);
      expect(classes).toContain(drawn[size]);
      expect(classes.some((name) => /^(min-[hw]-|-?m[xytrbl]?-)/.test(name))).toBe(false);
    }
  });

  it('leaves sizes that are always at least 24px alone', () => {
    for (const size of ['default', 'lg', 'icon', 'icon-lg'] as const) {
      expect(buttonVariants({ size }).split(' ')).not.toContain('hit-area');
    }
  });

  it('renders the pad on the element a caller gets', () => {
    const { getByRole } = render(
      <Button aria-label="Close" size="icon-sm">
        x
      </Button>,
    );
    expectOwnsAfter(classesOf(getByRole('button')));
  });
});

describe('form controls', () => {
  it('Checkbox, Switch and Radio pad with the px floor instead of rem insets, 32px wide', () => {
    const { container } = render(
      <>
        <Checkbox aria-label="Pick" />
        <Switch aria-label="On" size="sm" />
        <RadioGroup aria-label="Mode" defaultValue="a">
          <RadioGroupItem value="a" aria-label="A" />
        </RadioGroup>
      </>,
    );
    const checkbox = classesOf(container.querySelector('[data-slot="checkbox"]'));
    const toggle = classesOf(container.querySelector('[data-slot="switch"]'));
    const radio = classesOf(container.querySelector('[data-slot="radio-group-item"]'));
    for (const classes of [checkbox, toggle, radio]) {
      expectOwnsAfter(classes);
      expect(classes).toContain('[--hit-area-min-w:32px]');
    }
    expect(checkbox).toContain('size-4');
    expect(radio).toContain('size-4');
    expect(toggle).toContain('data-[size=sm]:h-[14px]');
  });

  it('SelectTrigger carries the pad on ::after; ::before stays the btn-fill bloom', () => {
    const { container } = render(
      <Select value="a">
        <SelectTrigger size="sm">
          <SelectValue />
        </SelectTrigger>
      </Select>,
    );
    const classes = classesOf(container.querySelector('[data-slot="select-trigger"]'));
    expectOwnsAfter(classes);
    expect(classes).toContain('btn-fill');
    expect(classes).toContain('data-[size=sm]:h-7');
  });

  it('Toggle carries the pad at every size', () => {
    for (const size of ['default', 'sm', 'lg'] as const) {
      expect(toggleVariants({ size }).split(' ')).toContain('hit-area');
    }
    const { getByRole } = render(<Toggle aria-label="Bold" size="sm" />);
    expectOwnsAfter(classesOf(getByRole('button')));
  });
});

describe('neighbouring pads never overlap', () => {
  it('a ToggleGroup is a row (or column) whose gap is its own spacing', () => {
    const { getAllByRole, container } = render(
      <>
        <ToggleGroup aria-label="Granularity" size="sm" variant="outline">
          <ToggleGroupItem value="day">Day</ToggleGroupItem>
          <ToggleGroupItem value="week">Week</ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup aria-label="Stack" orientation="vertical">
          <ToggleGroupItem value="a">A</ToggleGroupItem>
        </ToggleGroup>
      </>,
    );
    const groups = container.querySelectorAll('[data-slot="toggle-group"]');
    for (const group of [groups[0], groups[1]]) {
      const classes = classesOf(group);
      expect(classes).toContain('data-horizontal:hit-area-row');
      expect(classes).toContain('data-vertical:hit-area-column');
      expect(classes).toContain('[--hit-area-gap:calc(var(--spacing)*var(--gap))]');
    }
    expect(groups[1]?.getAttribute('data-orientation')).toBe('vertical');
    for (const item of getAllByRole('button')) expectOwnsAfter(classesOf(item));
  });

  it('a ButtonGroup is a touching row (or column)', () => {
    const { container } = render(
      <>
        <ButtonGroup>
          <Button size="icon-xs" aria-label="Previous" />
          <Button size="icon-xs" aria-label="Next" />
        </ButtonGroup>
        <ButtonGroup orientation="vertical">
          <Button size="icon-xs" aria-label="Up" />
        </ButtonGroup>
      </>,
    );
    const groups = container.querySelectorAll('[data-slot="button-group"]');
    expect(classesOf(groups[0])).toContain('hit-area-row');
    expect(classesOf(groups[1])).toContain('hit-area-column');
  });

  it('TabsList is a row; the trigger pad stays on ::before (::after is the underline)', () => {
    const { container, getAllByRole } = render(
      <Tabs defaultValue="a">
        <TabsList variant="line">
          <TabsTrigger value="a">Overview</TabsTrigger>
          <TabsTrigger value="b">Activity</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const list = classesOf(container.querySelector('[data-slot="tabs-list"]'));
    // On the list's OWN orientation: a TabsList portalled out of its Tabs root (the Scale
    // header bar) has no `group/tabs` ancestor, and a group variant would silently not apply.
    expect(list).toContain('data-horizontal:hit-area-row');
    expect(list).toContain('data-vertical:hit-area-column');
    expect(container.querySelector('[data-slot="tabs-list"]')?.getAttribute('data-orientation')).toBe(
      'horizontal',
    );
    expect(list).toContain('data-[variant=line]:[--hit-area-gap:calc(var(--spacing)*1)]');
    for (const tab of getAllByRole('tab')) {
      const classes = classesOf(tab);
      expect(classes).toContain('hit-area-before');
      expect(classes).not.toContain('hit-area');
      expect(classes.filter((name) => name.startsWith('before:'))).toEqual([]);
    }
  });
});
