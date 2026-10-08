'use client';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';

export type PaletteAction = {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  run: () => void;
};

/** ⌘K: every workspace action by name — timeline edits, quick ops, formats, export. */
export function CommandPalette({
  open,
  onOpenChange,
  groups,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: ReadonlyArray<{ heading: string; actions: readonly PaletteAction[] }>;
}) {
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Video Studio actions">
      <CommandInput placeholder="Search actions…" />
      <CommandList>
        <CommandEmpty>No matching action.</CommandEmpty>
        {groups.map((group) => (
          <CommandGroup key={group.heading} heading={group.heading}>
            {group.actions.map((action) => (
              <CommandItem
                key={action.id}
                value={`${group.heading} ${action.label}`}
                disabled={action.disabled}
                onSelect={() => {
                  onOpenChange(false);
                  action.run();
                }}
              >
                {action.label}
                {action.shortcut ? <CommandShortcut>{action.shortcut}</CommandShortcut> : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
