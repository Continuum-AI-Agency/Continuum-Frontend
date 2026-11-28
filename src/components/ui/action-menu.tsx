'use client';

// TuffUI's ActionMenu API (https://tuffui.com/components/action-menu) on our Base UI dropdown.
// Upstream is built on radix-ui, which this app removed; only plain items are ported because
// that is all ConversationList uses. Add checkbox/radio/submenu items when a caller needs them.

import type { Icon } from '@phosphor-icons/react';
import { Fragment } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type MenuItem = {
  id: string;
  label: React.ReactNode;
  icon?: Icon;
  disabled?: boolean;
  /** Shortcut text shown on the right, e.g. "⌘C". */
  shortcut?: string;
  destructive?: boolean;
  onSelect?: () => void;
};

/** Items separated by a divider, optionally under a small label. */
export type MenuGroup = { id?: string; label?: string; items: MenuItem[] };

export type MenuProps = {
  /** A single button-like element that opens the menu. */
  trigger: React.ReactElement;
  groups: MenuGroup[];
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
};

/** Dropdown menu opened from a trigger button. */
export function Menu({
  trigger,
  groups,
  side = 'bottom',
  align = 'start',
  open,
  onOpenChange,
  className,
}: MenuProps) {
  return (
    <DropdownMenu open={open} onOpenChange={(next) => onOpenChange?.(next)}>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent
        side={side}
        align={align}
        sideOffset={6}
        className={className ?? 'w-auto min-w-44'}
      >
        {groups.map((group, index) => (
          <Fragment key={group.id ?? index}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuGroup>
              {group.label && <DropdownMenuLabel>{group.label}</DropdownMenuLabel>}
              {group.items.map(
                ({ id, label, icon: ItemIcon, disabled, shortcut, destructive, onSelect }) => (
                  <DropdownMenuItem
                    key={id}
                    disabled={disabled}
                    variant={destructive ? 'destructive' : 'default'}
                    onClick={onSelect}
                  >
                    {ItemIcon && <ItemIcon aria-hidden="true" />}
                    {label}
                    {shortcut && <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>}
                  </DropdownMenuItem>
                ),
              )}
            </DropdownMenuGroup>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
