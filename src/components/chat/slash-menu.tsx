'use client';

// The `/` typeahead, shared by every prompt surface: canvas text boxes, the Omni prompt,
// the canvas composer and the Organic agent chat. Focus never leaves the host input, so
// the host forwards its keystrokes (`onKeyDown`) and caret (`track`); this file owns the
// state and the list. `useSlashTextarea` is the whole wiring for a plain <textarea>;
// a contenteditable host (PromptInput) drives `useSlashMenu` itself.

import type { Skill } from '@continuum/contracts';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import {
  applySlashOption,
  buildSlashOptions,
  filterSlashOptions,
  findSlashQuery,
  type SlashOption,
  type SlashQuery,
} from './slashShortcuts';

export type SlashMenuProps = {
  options: SlashOption[];
  query: string;
  highlight: number;
  onHighlight: (index: number) => void;
  onSelect: (option: SlashOption) => void;
  className?: string;
};

/**
 * `skills` undefined switches the menu off (a surface with no brand has nothing to
 * offer). `onApply` replaces the fragment `query` spans with `/<slug> `.
 */
export function useSlashMenu(
  skills: readonly Skill[] | undefined,
  onApply: (option: SlashOption, query: SlashQuery) => void,
) {
  const options = useMemo(() => (skills ? buildSlashOptions(skills) : null), [skills]);
  const [active, setActiveState] = useState<SlashQuery | null>(null);
  const activeRef = useRef<SlashQuery | null>(null);
  const [highlight, setHighlight] = useState(0);
  // Esc dismisses the fragment at this offset until the caret leaves it.
  const dismissedAt = useRef<number | null>(null);

  const matches = useMemo(
    () => (active && options ? filterSlashOptions(options, active.query) : []),
    [active, options],
  );

  // Unchanged fragment (an arrow key's keyup, a click inside it) keeps the highlight.
  const setActive = useCallback((next: SlashQuery | null) => {
    const previous = activeRef.current;
    if (
      previous?.start === next?.start &&
      previous?.end === next?.end &&
      previous?.query === next?.query
    ) {
      return;
    }
    if (previous?.query !== next?.query) setHighlight(0);
    activeRef.current = next;
    setActiveState(next);
  }, []);

  const track = useCallback(
    (text: string, caret: number | null) => {
      const next = options && caret !== null ? findSlashQuery(text, caret) : null;
      if (next?.start !== dismissedAt.current) dismissedAt.current = null;
      setActive(next && next.start !== dismissedAt.current ? next : null);
    },
    [options, setActive],
  );

  const close = useCallback(() => setActive(null), [setActive]);

  const select = (option: SlashOption) => {
    if (!active) return;
    onApply(option, active);
    setActive(null);
  };

  /** Returns true when the keystroke drove the menu, so the host skips its own handling. */
  const onKeyDown = (event: React.KeyboardEvent): boolean => {
    if (!active || matches.length === 0 || event.nativeEvent.isComposing) return false;
    if (event.key === 'ArrowDown') {
      setHighlight((current) => (current + 1) % matches.length);
    } else if (event.key === 'ArrowUp') {
      setHighlight((current) => (current === 0 ? matches.length - 1 : current - 1));
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      select(matches[highlight] ?? matches[0]);
    } else if (event.key === 'Escape') {
      dismissedAt.current = active.start;
      setActive(null);
    } else {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    return true;
  };

  const menuProps: SlashMenuProps | null =
    active && matches.length > 0
      ? {
          options: matches,
          query: active.query,
          highlight: Math.min(highlight, matches.length - 1),
          onHighlight: setHighlight,
          onSelect: select,
        }
      : null;

  return { menuProps, track, close, onKeyDown };
}

/** The whole `/` wiring for a controlled <textarea>: spread the handlers, render the menu. */
export function useSlashTextarea(
  skills: readonly Skill[] | undefined,
  setValue: (next: string) => void,
) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const slash = useSlashMenu(skills, (option, query) => {
    const textarea = ref.current;
    if (!textarea) return;
    const next = applySlashOption(textarea.value, query, option.slug);
    setValue(next.text);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(next.caret, next.caret);
    });
  });
  return {
    ref,
    menuProps: slash.menuProps,
    onKeyDown: slash.onKeyDown,
    close: slash.close,
    // `select` fires on every caret move and every keystroke that changes the text.
    onSelect: (event: React.SyntheticEvent<HTMLTextAreaElement>) =>
      slash.track(event.currentTarget.value, event.currentTarget.selectionStart),
  };
}

export function SlashMenu({
  options,
  query,
  highlight,
  onHighlight,
  onSelect,
  className,
}: SlashMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  // cmdk only scrolls on its own key handling; the keys arrive at the host input here.
  useEffect(() => {
    rootRef.current
      ?.querySelector(`[data-slash-index="${highlight}"]`)
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [highlight]);

  const groups: { label: string; items: { option: SlashOption; index: number }[] }[] = [];
  options.forEach((option, index) => {
    const last = groups[groups.length - 1];
    if (last?.label === option.group) last.items.push({ option, index });
    else groups.push({ label: option.group, items: [{ option, index }] });
  });

  return (
    <div
      ref={rootRef}
      className={cn(
        'absolute bottom-[calc(100%+0.5rem)] left-0 z-50 w-72 max-w-full',
        'overflow-hidden rounded-xl border border-border/70 bg-popover text-popover-foreground',
        'shadow-[0_18px_50px_-24px_rgba(0,0,0,0.45)] ring-1 ring-black/5 dark:ring-white/10',
        className,
      )}
    >
      <Command
        shouldFilter={false}
        value={options[highlight]?.slug ?? ''}
        onValueChange={(value) => {
          const index = options.findIndex((option) => option.slug === value);
          if (index >= 0) onHighlight(index);
        }}
        className="bg-transparent"
        label="Shortcuts"
        // Keep focus (and the caret) in the host input while the pointer picks a row.
        onMouseDown={(event) => event.preventDefault()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-2.5 py-1.5 text-2xs text-muted-foreground">
          <span className="font-medium text-foreground">Shortcuts</span>
          <span className="truncate font-mono">/{query}</span>
        </div>
        <CommandList className="max-h-64">
          {groups.map((group) => (
            <CommandGroup key={group.label} heading={group.label}>
              {group.items.map(({ option, index }) => (
                <CommandItem
                  key={option.slug}
                  value={option.slug}
                  data-slash-index={index}
                  onSelect={() => onSelect(option)}
                  className="gap-2 py-1"
                >
                  <span className="shrink-0 font-mono text-xs font-medium">/{option.slug}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {option.label}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
        <div className="border-t border-border/60 px-2.5 py-1 text-2xs text-muted-foreground">
          ↑↓ navigate · ↵ or tab insert · esc close
        </div>
      </Command>
    </div>
  );
}
