'use client';

// Add Node, as a searchable palette instead of a hover tree. The old menu was three
// nested ContextMenuSub levels — group, provider, row — which meant four hover-throughs
// to reach a generator and no way at all to find a node you could only half-name.
//
// cmdk (not Base UI Combobox) on purpose: its command-score ranks SUBSEQUENCE matches, so
// "vidgen" and "hyp" land on the right row. See Continuum-Frontend/AGENTS.md §4 and
// command.filter.test.tsx — the <Command> root must stay, or cmdk's children have no store.

import type { VideoGeneratorModel } from '@continuum/contracts';

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
  ADD_NODE_GROUPS,
  addNodeRowKey,
  addNodeSearchValue,
  type StudioCanvasNodeType,
} from './addNodeCatalog';

export function AddNodeCommandPalette({
  screenPosition,
  onAdd,
  onDismiss,
}: {
  /** Where the right-click happened, in SCREEN coordinates — the palette opens there. */
  screenPosition: { x: number; y: number };
  onAdd: (type: StudioCanvasNodeType, options?: { model?: VideoGeneratorModel }) => void;
  onDismiss: () => void;
}) {
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
          />
          <CommandList>
            <CommandEmpty>No node matches that search.</CommandEmpty>
            {ADD_NODE_GROUPS.map((section) => (
              <CommandGroup key={section.group} heading={section.label}>
                {section.rows.map((row) => (
                  <CommandItem
                    key={addNodeRowKey(row)}
                    value={addNodeSearchValue(section, row)}
                    onSelect={() => onAdd(row.type, row.model ? { model: row.model } : undefined)}
                  >
                    <div className="flex min-w-0 flex-col">
                      <span>{row.label}</span>
                      {row.desc ? (
                        <span className="text-xs text-muted-foreground">{row.desc}</span>
                      ) : null}
                    </div>
                    <CommandShortcut>{row.tag}</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
