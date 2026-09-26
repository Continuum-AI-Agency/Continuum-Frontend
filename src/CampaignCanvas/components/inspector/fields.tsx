'use client';

/*
 * The inspector's control vocabulary.
 *
 * Text commits on blur or Enter, never per keystroke: every commit is one
 * `updateNodeData`, which is one undo step, so typing a headline and pressing ⌘Z takes
 * back the headline rather than its last letter. Escape abandons the draft.
 *
 * Every control carries `data-testid="inspector-field-<dataKey>"` (or the id it is
 * given), which is the contract the canvas e2e bench is written against.
 */

import type { ComponentProps, KeyboardEvent, ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

export type InspectorOption<T extends string = string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

export function InspectorSection({
  title,
  children,
  aside,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 border-t border-border/70 px-4 py-4 first:border-t-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-foreground">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Label above, control, then one line of help or the reason the value will be refused. */
export function InspectorField({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {htmlFor ? (
        <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
          {label}
        </Label>
      ) : (
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      )}
      {children}
      {error ? (
        <p className="text-2xs leading-snug text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-2xs leading-snug text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * `onCommit` answers `false` to refuse a draft (an empty name, a negative budget): the
 * field then shows the committed value again instead of a value the node does not hold.
 */
export type CommitHandler = (next: string) => boolean | undefined | void;

/** A draft that becomes a value on blur / Enter, and reverts on Escape. */
function useCommittedDraft(value: string, onCommit: CommitHandler) {
  const [draft, setDraft] = useState(value);
  const abandon = useRef(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    if (abandon.current) {
      abandon.current = false;
      return;
    }
    if (draft === value) return;
    if (onCommit(draft) === false) setDraft(value);
  };

  const revert = (element: HTMLElement) => {
    abandon.current = true;
    setDraft(value);
    element.blur();
  };

  return { draft, setDraft, commit, revert };
}

type CommitInputProps = Omit<
  ComponentProps<typeof Input>,
  'value' | 'defaultValue' | 'onChange' | 'onBlur' | 'onKeyDown'
> & {
  value: string;
  onCommit: CommitHandler;
  testId: string;
  invalid?: boolean;
};

export function CommitInput({
  value,
  onCommit,
  testId,
  invalid,
  className,
  ...rest
}: CommitInputProps) {
  const { draft, setDraft, commit, revert } = useCommittedDraft(value, onCommit);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur();
    if (event.key === 'Escape') revert(event.currentTarget);
  };

  return (
    <Input
      {...rest}
      data-testid={testId}
      aria-invalid={invalid || undefined}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      className={cn('h-8 text-sm', className)}
    />
  );
}

export function CommitTextarea({
  value,
  onCommit,
  testId,
  invalid,
  className,
  ...rest
}: Omit<
  ComponentProps<typeof Textarea>,
  'value' | 'defaultValue' | 'onChange' | 'onBlur' | 'onKeyDown'
> & {
  value: string;
  onCommit: CommitHandler;
  testId: string;
  invalid?: boolean;
}) {
  const { draft, setDraft, commit, revert } = useCommittedDraft(value, onCommit);

  return (
    <Textarea
      {...rest}
      data-testid={testId}
      aria-invalid={invalid || undefined}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        // Enter is a line break in body copy; ⌘/Ctrl+Enter commits.
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) event.currentTarget.blur();
        if (event.key === 'Escape') revert(event.currentTarget);
      }}
      className={cn('min-h-20 text-sm', className)}
    />
  );
}

/**
 * A single-choice select. A value outside the option list (a goal Jaina chose that the
 * canvas does not name) is shown as itself rather than as a blank trigger.
 */
export function SelectField<T extends string>({
  id,
  testId,
  value,
  options,
  onChange,
  placeholder,
}: {
  id: string;
  testId: string;
  value: T | undefined;
  options: readonly InspectorOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
}) {
  const known = options.some((option) => option.value === value);
  const all: readonly InspectorOption<string>[] =
    value && !known ? [...options, { value, label: humanizeEnum(value) }] : options;
  const labels = Object.fromEntries(all.map((option) => [option.value, option.label]));

  return (
    <Select<T> value={value ?? null} onValueChange={onChange}>
      <SelectTrigger id={id} data-testid={testId} className="h-8 w-full">
        <SelectValue items={labels} placeholder={placeholder ?? 'Choose…'} />
      </SelectTrigger>
      <SelectContent>
        {all.map((option) => (
          <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Chips for a short list: the current choice is visible without opening anything. */
export function ChipGroup<T extends string>({
  testId,
  label,
  value,
  options,
  onChange,
  multiple,
}: {
  testId: string;
  label: string;
  value: readonly T[];
  options: readonly InspectorOption<T>[];
  onChange: (next: T[]) => void;
  multiple?: boolean;
}) {
  return (
    <ToggleGroup
      type={multiple ? 'multiple' : 'single'}
      variant="outline"
      size="sm"
      spacing={1}
      aria-label={label}
      data-testid={testId}
      value={multiple ? value : (value[0] ?? '')}
      onValueChange={(next: string | string[]) => {
        const values = (Array.isArray(next) ? next : next ? [next] : []) as T[];
        onChange(values);
      }}
      className="w-full flex-wrap"
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          aria-label={option.label}
          className="h-7 px-2.5 text-xs aria-pressed:border-primary/50 aria-pressed:bg-primary/10 aria-pressed:text-foreground"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** A read-only value that still looks like part of the form, so its absence is not a gap. */
export function ReadOnlyValue({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <div
      data-testid={testId}
      className="flex min-h-8 items-center rounded-md border border-dashed border-border px-3 text-sm text-muted-foreground"
    >
      {children}
    </div>
  );
}

export function useFieldId(key: string): string {
  return `${useId()}-${key}`;
}

export function humanizeEnum(value: string): string {
  const spaced = value.replace(/_/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The save's own link rule, so a link the inspector accepts is one the save keeps. */
export { isHttpUrl } from '@/lib/campaign-canvas/saveVersion';
