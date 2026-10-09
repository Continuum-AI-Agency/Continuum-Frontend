'use client';

// The wizard's one choice control: a radio row separated from its neighbours by a hairline,
// never a bordered card. It stays a pressed-state button (not a native radio) so the steps keep
// their click-to-choose behaviour and every existing accessible name.

import { cn } from '@/lib/utils';

/** The heading a step asks its question with. */
export const questionHeading = 'font-semibold text-lg tracking-tight';

type OptionRowProps = {
  active: boolean;
  onSelect: () => void;
  title: string;
  body?: string;
  disabled?: boolean;
  className?: string;
};

export function OptionRow({ active, onSelect, title, body, disabled, className }: OptionRowProps) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        'flex w-full items-start gap-3 border-border/60 border-b py-2.5 text-left transition-colors hover:text-foreground disabled:opacity-60',
        className,
      )}
      disabled={disabled}
      onClick={onSelect}
      type="button"
    >
      <span
        aria-hidden
        className={cn(
          'mt-0.5 size-4 shrink-0 rounded-full',
          active ? 'border-[5px] border-primary' : 'border-[1.5px] border-muted-foreground/50',
        )}
      />
      <span className="min-w-0">
        <span className={cn('block text-sm', active ? 'font-semibold' : 'font-medium')}>
          {title}
        </span>
        {body ? <span className="mt-0.5 block text-xs text-muted-foreground">{body}</span> : null}
      </span>
    </button>
  );
}
