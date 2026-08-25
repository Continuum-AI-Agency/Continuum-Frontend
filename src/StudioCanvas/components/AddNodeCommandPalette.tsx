'use client';

// Add Node, as a searchable palette instead of a hover tree. The old menu was three
// nested ContextMenuSub levels — group, provider, row — which meant four hover-throughs
// to reach a generator and no way at all to find a node you could only half-name.
//
// cmdk (not Base UI Combobox) on purpose: its command-score MATCHES subsequences, so
// "vidgen" and "hyp" land on the right row. See Continuum-Frontend/AGENTS.md §4 and
// command.filter.test.tsx — the <Command> root must stay, or cmdk's children have no store.
//
// What cmdk does NOT do here is ORDER: command-score scores a subsequence across the row's
// whole searchable text (label + blurb + provider), so typing a node's exact name `Export`
// scored below `Text Block` — and cmdk highlights the first item in DOM order, which is
// catalog order. Typing an exact name and pressing Enter added the wrong node (D-07).
// The fix is therefore a RENDER-order pin, not a scoring tweak: an exact, case-insensitive
// label match is rendered first, in its own group, and left out of its normal one. Fuzzy
// matching is untouched — the settled cmdk decision stands, the defect was ordering.

import type { ActionId, VideoGeneratorModel } from '@continuum/contracts';
import { useMemo, useState } from 'react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';

import {
  ACTION_FAMILY_LABELS,
  ADD_NODE_GROUPS,
  type AddNodeGroupSection,
  type AddNodeRow,
  addNodeRowKey,
  addNodeSearchValue,
  type StudioCanvasNodeType,
} from './addNodeCatalog';

/** Every row with the section it belongs to, so a pinned row keeps its real search value. */
const ALL_ENTRIES: readonly { section: AddNodeGroupSection; row: AddNodeRow }[] =
  ADD_NODE_GROUPS.flatMap((section) => section.rows.map((row) => ({ section, row })));

/**
 * The rows whose label IS the query. Plural on purpose: five action ops share a label
 * across families, and putting both `Blur` rows on top is the honest answer to an
 * ambiguous exact match — better than picking one of them by score.
 */
const exactLabelMatches = (
  query: string,
): readonly { section: AddNodeGroupSection; row: AddNodeRow }[] => {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return ALL_ENTRIES.filter((entry) => entry.row.label.toLowerCase() === needle);
};

/** What rides at the end of the row: who runs it, and for an op, what it runs on. */
const rowTag = (row: AddNodeRow): string =>
  row.family ? `${ACTION_FAMILY_LABELS[row.family]} · ${row.tag}` : row.tag;

/** What a row pre-configures on the node it creates — a video model, or an action's op. */
const addOptionsFor = (
  row: AddNodeRow,
): { model?: VideoGeneratorModel; actionId?: ActionId } | undefined =>
  row.model ? { model: row.model } : row.actionId ? { actionId: row.actionId } : undefined;

export function AddNodeCommandPalette({
  screenPosition,
  onAdd,
  onDismiss,
}: {
  /** Where the right-click happened, in SCREEN coordinates — the palette opens there. */
  screenPosition: { x: number; y: number };
  onAdd: (
    type: StudioCanvasNodeType,
    options?: { model?: VideoGeneratorModel; actionId?: ActionId },
  ) => void;
  onDismiss: () => void;
}) {
  const [query, setQuery] = useState('');
  const pinned = useMemo(() => exactLabelMatches(query), [query]);
  const pinnedKeys = useMemo(
    () => new Set(pinned.map((entry) => addNodeRowKey(entry.row))),
    [pinned],
  );

  const renderRow = (section: AddNodeGroupSection, row: AddNodeRow) => (
    <CommandItem
      key={addNodeRowKey(row)}
      value={addNodeSearchValue(section, row)}
      // The op id and family on the DOM row are what studio-node-palette-bench reads to
      // prove every implemented op is offered exactly once and told apart, in the real
      // bundle. A pinned row keeps the value of the section it really belongs to.
      data-action-id={row.actionId}
      data-action-family={row.family}
      onSelect={() => onAdd(row.type, addOptionsFor(row))}
    >
      <div className="flex min-w-0 flex-col">
        <span>{row.label}</span>
        {row.desc ? <span className="text-xs text-muted-foreground">{row.desc}</span> : null}
      </div>
      <CommandShortcut>{rowTag(row)}</CommandShortcut>
    </CommandItem>
  );

  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
    >
      {/* Anchored to a zero-size fixed marker at the drop point, so the palette tracks the
          cursor and not the canvas pan/zoom. An ANCHOR rather than a Trigger: there is no
          control to press — the context menu already opened this — and Base UI's Trigger
          would insist on real button semantics for a marker that must never be focusable. */}
      <PopoverAnchor
        render={
          <div
            className="pointer-events-none fixed h-0 w-0"
            style={{ left: screenPosition.x, top: screenPosition.y }}
          />
        }
      />
      <PopoverContent
        align="start"
        side="bottom"
        className="w-80 p-0"
        data-testid="add-node-palette"
      >
        <Command>
          <CommandInput
            placeholder="Search nodes…"
            autoFocus
            data-testid="add-node-palette-input"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>No node matches that search.</CommandEmpty>
            {pinned.length > 0 ? (
              <CommandGroup heading="Best match" data-testid="add-node-palette-pinned">
                {pinned.map((entry) => renderRow(entry.section, entry.row))}
              </CommandGroup>
            ) : null}
            {ADD_NODE_GROUPS.map((section) => {
              // A pinned row is rendered ONCE — cmdk keys an item by its value, so leaving
              // the original in place would collapse the pair back into one row.
              const rows = section.rows.filter((row) => !pinnedKeys.has(addNodeRowKey(row)));
              if (rows.length === 0) return null;
              return (
                <CommandGroup key={section.group} heading={section.label}>
                  {rows.map((row) => renderRow(section, row))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
