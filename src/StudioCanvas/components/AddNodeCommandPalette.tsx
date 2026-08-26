'use client';

// Add Node, as ONE submenu with two modes. Hover "Add Node" and the palette opens beside
// it with a search box on top and the category submenus (Text / Image / Video / …) below,
// each opening on hover the way the old nested tree did. Type, and the categories give way
// to cmdk's flat ranked list. Empty the box and the categories come back.
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
import { Plus } from 'lucide-react';
import { type KeyboardEvent, useMemo, useState } from 'react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import {
  ContextMenuItem,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';

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

const RowBody = ({ row }: { row: AddNodeRow }) => (
  <div className="flex min-w-0 flex-col">
    <span>{row.label}</span>
    {row.desc ? <span className="text-xs text-muted-foreground">{row.desc}</span> : null}
  </div>
);

/** The keys Base UI's menu may act on (arrow navigation, Home/End) once the box is empty. */
const isMenuNavigationKey = (key: string): boolean =>
  key.startsWith('Arrow') || key === 'Home' || key === 'End';

export type AddNodeHandler = (
  type: StudioCanvasNodeType,
  options?: { model?: VideoGeneratorModel; actionId?: ActionId },
) => void;

export function AddNodeCommandPalette({
  onAdd,
  onOpenChange,
}: {
  onAdd: AddNodeHandler;
  /** Fires when the Add Node submenu opens or closes — the canvas pins the drop point on open. */
  onOpenChange?: (open: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const pinned = useMemo(() => exactLabelMatches(query), [query]);
  const pinnedKeys = useMemo(
    () => new Set(pinned.map((entry) => addNodeRowKey(entry.row))),
    [pinned],
  );

  // The search box lives inside a Base UI menu popup, whose keydown handlers run typeahead
  // (any printable key jumps focus to a matching item and swallows the character) and
  // roving focus (arrows). With a query, cmdk owns every key: the list is the thing being
  // navigated. With none, arrows and Home/End are handed to the menu so they walk the
  // category submenus. Escape and Tab always pass — they are how the menu closes.
  const fenceMenuKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' || event.key === 'Tab') return;
    if (query === '' && isMenuNavigationKey(event.key)) return;
    event.stopPropagation();
  };

  const renderSearchRow = (section: AddNodeGroupSection, row: AddNodeRow) => (
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
      <RowBody row={row} />
      <CommandShortcut>{rowTag(row)}</CommandShortcut>
    </CommandItem>
  );

  return (
    <ContextMenuSub
      onOpenChange={(open) => {
        if (!open) setQuery('');
        onOpenChange?.(open);
      }}
    >
      <ContextMenuSubTrigger inset>
        <Plus className="mr-2 h-4 w-4" />
        Add Node
      </ContextMenuSubTrigger>
      {/* `nowheel` keeps a scroll inside the popup from zooming the React Flow pane; the
          height cap is Base UI's positioner var, so the Action category scrolls instead of
          running off the viewport. */}
      <ContextMenuSubContent className="nowheel w-80 p-0" data-testid="add-node-palette">
        <Command onKeyDown={fenceMenuKeys}>
          <CommandInput
            placeholder="Search nodes…"
            autoFocus
            data-testid="add-node-palette-input"
            value={query}
            onValueChange={setQuery}
          />
          {query ? (
            <CommandList>
              <CommandEmpty>No node matches that search.</CommandEmpty>
              {pinned.length > 0 ? (
                <CommandGroup heading="Best match" data-testid="add-node-palette-pinned">
                  {pinned.map((entry) => renderSearchRow(entry.section, entry.row))}
                </CommandGroup>
              ) : null}
              {ADD_NODE_GROUPS.map((section) => {
                // A pinned row is rendered ONCE — cmdk keys an item by its value, so leaving
                // the original in place would collapse the pair back into one row.
                const rows = section.rows.filter((row) => !pinnedKeys.has(addNodeRowKey(row)));
                if (rows.length === 0) return null;
                return (
                  <CommandGroup key={section.group} heading={section.label}>
                    {rows.map((row) => renderSearchRow(section, row))}
                  </CommandGroup>
                );
              })}
            </CommandList>
          ) : null}
        </Command>
        {/* Siblings of the cmdk root, not children: a keydown inside a category submenu
            bubbles through its React ancestors, and cmdk's root would otherwise claim
            Enter and the arrows before Base UI's own item handling saw them. */}
        {query
          ? null
          : ADD_NODE_GROUPS.map((section) => (
              <ContextMenuSub key={section.group}>
                <ContextMenuSubTrigger inset>{section.label}</ContextMenuSubTrigger>
                <ContextMenuSubContent
                  className="nowheel w-72"
                  data-testid="add-node-category"
                  data-category={section.group}
                >
                  {section.rows.map((row) => (
                    <ContextMenuItem
                      key={addNodeRowKey(row)}
                      data-action-id={row.actionId}
                      data-action-family={row.family}
                      onClick={() => onAdd(row.type, addOptionsFor(row))}
                    >
                      <RowBody row={row} />
                      <ContextMenuShortcut>{rowTag(row)}</ContextMenuShortcut>
                    </ContextMenuItem>
                  ))}
                </ContextMenuSubContent>
              </ContextMenuSub>
            ))}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
