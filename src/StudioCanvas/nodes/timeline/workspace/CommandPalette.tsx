'use client';

import { useTranslations as useUiTranslations } from 'next-intl';
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
  const translateUi = useUiTranslations('studio');

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={translateUi('video_studio_actions_1e8103fa')}
    >
      <CommandInput placeholder={translateUi('search_actions_d16d1db0')} />
      <CommandList>
        <CommandEmpty>{translateUi('no_matching_action_fbde80dd')}</CommandEmpty>
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
