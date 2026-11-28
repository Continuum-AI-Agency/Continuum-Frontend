// TUFFUI (https://tuffui.com) · MIT License · Copyright (c) 2026 TUFFUI contributors
// Free to use. If it helps you, you can support it: https://ko-fi.com/yurigokoryan
'use client';

import { ArrowClockwise, ArrowUpRight, type Icon } from '@phosphor-icons/react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { IconButton } from '@/components/ui/action-button';
import { IconTile } from '@/components/ui/surface';
import { EASE_OUT, exit } from '@/lib/motion-tokens';
import { cn } from '@/lib/utils';

export type PromptSuggestion = {
  id: string;
  title: string;
  /** Second line on cards; ignored by chips. */
  hint?: string;
  icon?: Icon;
  /** Text to send; defaults to the title. */
  prompt?: string;
};

export type PromptSuggestionsProps = {
  data: PromptSuggestion[];
  /** `cards` for an empty chat, `chips` for follow-ups under an answer. */
  variant?: 'cards' | 'chips';
  onSelect: (suggestion: PromptSuggestion, prompt: string) => void;
  /** Shows a refresh button (chips) that asks for new suggestions. */
  onRefresh?: () => void;
  refreshing?: boolean;
  heading?: string;
  className?: string;
};

const STAGGER = 0.04;

export function PromptSuggestions({
  data,
  variant = 'cards',
  onSelect,
  onRefresh,
  refreshing = false,
  heading,
  className,
}: PromptSuggestionsProps) {
  const send = (s: PromptSuggestion) => onSelect(s, s.prompt ?? s.title);
  const appear = (i: number) => ({
    initial: { opacity: 0, y: 6 },
    animate: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.22, ease: EASE_OUT, delay: i * STAGGER },
    },
    exit: { opacity: 0, transition: exit },
  });

  if (variant === 'chips') {
    return (
      <MotionConfig reducedMotion="user">
        <div className={cn('flex w-full flex-col gap-2', className)}>
          {heading && <p className="px-1 text-xs font-medium text-muted-foreground">{heading}</p>}
          <ul
            aria-label={heading ?? 'Suggested follow-ups'}
            aria-busy={refreshing || undefined}
            className="flex flex-wrap items-center gap-1.5"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {data.map((s, i) => (
                <motion.li key={s.id} layout="position" {...appear(i)}>
                  <button
                    type="button"
                    onClick={() => send(s)}
                    disabled={refreshing}
                    className="flex h-8 max-w-80 items-center gap-1.5 rounded-full bg-foreground/[0.06] pr-2.5 pl-3.5 text-[0.8125rem] transition-[background-color,scale,opacity] duration-150 ease-out hover:bg-foreground/[0.1] active:scale-[0.97] disabled:opacity-50"
                  >
                    <span className="truncate">{s.title}</span>
                    <ArrowUpRight
                      weight="bold"
                      className="size-3 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
            {onRefresh && (
              <li>
                <IconButton
                  icon={ArrowClockwise}
                  iconWeight="bold"
                  label="More suggestions"
                  onClick={onRefresh}
                  disabled={refreshing}
                  className={cn(
                    '[&_svg]:transition-transform',
                    refreshing && '[&_svg]:animate-spin motion-reduce:[&_svg]:animate-none',
                  )}
                />
              </li>
            )}
          </ul>
          <p role="status" aria-live="polite" className="sr-only">
            {refreshing ? 'Loading new suggestions' : ''}
          </p>
        </div>
      </MotionConfig>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className={cn('@container flex w-full max-w-xl flex-col gap-3', className)}>
        {heading && <p className="px-1 text-[0.9375rem] font-medium">{heading}</p>}
        <ul
          aria-label={heading ?? 'Suggested prompts'}
          className="grid grid-cols-1 gap-1.5 @md:grid-cols-2"
        >
          {data.map((s, i) => (
            <motion.li key={s.id} {...appear(i)}>
              <button
                type="button"
                onClick={() => send(s)}
                className="group flex h-full w-full items-center gap-2.5 rounded-[0.875rem] bg-surface p-1 pr-3 text-left transition-[background-color,scale] duration-150 ease-out hover:bg-surface-raised active:scale-[0.98]"
              >
                {s.icon && <IconTile icon={s.icon} className="size-7 rounded-[0.625rem]" />}
                <span className={cn('min-w-0 flex-1 py-0.5', !s.icon && 'pl-2')}>
                  <span className="block truncate text-xs font-medium">{s.title}</span>
                  {s.hint && (
                    <span className="block truncate text-[0.6875rem] text-muted-foreground">
                      {s.hint}
                    </span>
                  )}
                </span>
                <ArrowUpRight
                  weight="bold"
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-[opacity,translate] duration-150 ease-out group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-visible:opacity-100"
                />
              </button>
            </motion.li>
          ))}
        </ul>
      </div>
    </MotionConfig>
  );
}
