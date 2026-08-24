'use client';

// The inspector's control vocabulary. Deliberately plain buttons rather than the
// shadcn Select: every list here is short and the whole point of moving config off
// the node was to end the "four hover-throughs to reach a generator" nested-submenu
// trip. A visible chip row is one click, and it says what the current value IS
// without being opened.

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <p className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {children}
    </section>
  );
}

export function InspectorNote({ children }: { children: ReactNode }) {
  return <p className="text-[0.65rem] leading-snug text-muted-foreground">{children}</p>;
}

export type InspectorOption<T extends string> = {
  value: T;
  label: string;
  /** One short clause under the chip: the ceiling to expect, or why it is unreachable. */
  note?: string;
  disabled?: boolean;
};

export function OptionRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | undefined;
  options: readonly InspectorOption<T>[];
  onChange: (value: T) => void;
}) {
  if (options.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={option.disabled}
              aria-pressed={active}
              title={option.note}
              onClick={() => onChange(option.value)}
              className={cn(
                'rounded-md border px-2 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                active
                  ? 'border-brand-primary bg-brand-primary/10 font-medium text-brand-primary'
                  : 'border-border text-foreground hover:bg-muted/60',
              )}
            >
              {option.label}
              {option.note ? (
                <span className="ml-1 text-[0.6rem] font-normal text-muted-foreground">
                  {option.note}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function InspectorTextarea({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <textarea
        className="nodrag nowheel min-h-16 resize-y rounded-md border border-input bg-transparent px-2 py-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
