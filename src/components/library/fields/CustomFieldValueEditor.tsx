'use client';

// The value editors — one per custom-field type — behind a single
// dispatcher. Each one emits a CustomFieldValue and nothing else: validating it,
// persisting it, and reporting the failure are the panel's job, so an editor
// stays a control and never a data layer.
//
// Selects emit the option ID, never the label. That is the whole point of the
// option id existing: renaming "Licensed" must not orphan the assets that hold
// it.

import {
  type CustomField,
  type CustomFieldValue,
  customFieldChoiceOptions,
} from '@continuum/contracts';
import { CalendarIcon, ExternalLink, Star, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ratingMax } from '@/lib/library/customFields';
import {
  formatDateValue,
  literalValue,
  multiSelectOptionIds,
  singleSelectOptionId,
} from '@/lib/library/customFieldValue';
import { cn } from '@/lib/utils';
import { useMentionTargets } from '../detail/useMentionTargets';

// Radix Select cannot hold an empty string as an item value, so "cleared" needs
// a sentinel that no option id can collide with.
const CLEAR_VALUE = '__clear__';

// Base UI's Select shows the raw value unless it is told each value's label.
function choiceLabels(field: CustomField): Record<string, string> {
  return {
    [CLEAR_VALUE]: 'Not set',
    ...Object.fromEntries(
      customFieldChoiceOptions(field).map((option) => [option.id, option.label]),
    ),
  };
}

export type CustomFieldValueEditorProps = {
  field: CustomField;
  value: CustomFieldValue;
  disabled?: boolean;
  onChange: (value: CustomFieldValue) => void;
};

function SingleSelectEditor({ field, value, disabled, onChange }: CustomFieldValueEditorProps) {
  const selected = singleSelectOptionId(value);
  return (
    <Select
      value={selected ?? CLEAR_VALUE}
      disabled={disabled}
      onValueChange={(next) => onChange(next === CLEAR_VALUE ? null : next)}
    >
      <SelectTrigger size="sm" className="h-8 w-full text-xs" aria-label={field.name}>
        <SelectValue placeholder="Not set" items={choiceLabels(field)} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={CLEAR_VALUE} className="text-xs text-muted-foreground">
          Not set
        </SelectItem>
        {customFieldChoiceOptions(field).map((option) => (
          <SelectItem key={option.id} value={option.id} className="text-xs">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MultiSelectEditor({ field, value, disabled, onChange }: CustomFieldValueEditorProps) {
  const selected = multiSelectOptionIds(value);
  const toggle = (optionId: string) => {
    const next = selected.includes(optionId)
      ? selected.filter((id) => id !== optionId)
      : [...selected, optionId];
    onChange(next.length > 0 ? next : null);
  };

  return (
    <fieldset
      aria-label={field.name}
      disabled={disabled}
      className="flex flex-wrap items-center gap-1"
    >
      {customFieldChoiceOptions(field).map((option) => {
        const isActive = selected.includes(option.id);
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => toggle(option.id)}
            aria-pressed={isActive}
            className={cn(
              'min-h-7 rounded-full border px-2.5 text-xs font-medium transition-colors active:scale-[0.96]',
              isActive
                ? 'border-transparent bg-secondary text-foreground'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}

function TextEditor({ field, value, disabled, onChange }: CustomFieldValueEditorProps) {
  const stored = literalValue(value);
  const [draft, setDraft] = useState(stored);

  // The stored value is the source of truth; re-sync when it changes underneath
  // (a save landing, or the panel switching asset).
  useEffect(() => setDraft(stored), [stored]);

  // Committing on blur/Enter rather than on every keystroke: one PUT per edit,
  // not one per character.
  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === stored.trim()) return;
    onChange(trimmed.length > 0 ? trimmed : null);
  };

  return (
    <Input
      value={draft}
      disabled={disabled}
      aria-label={field.name}
      placeholder="Not set"
      className="h-8 text-xs"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}

// A calendar day has no time zone, so it is read and written in LOCAL parts:
// toISOString() would hand back yesterday for anyone west of Greenwich.
function toIsoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function fromIsoDay(iso: string): Date | undefined {
  const parts = iso.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return undefined;
  const [year, month, day] = parts as [number, number, number];
  return new Date(year, month - 1, day);
}

function DateEditor({ field, value, disabled, onChange }: CustomFieldValueEditorProps) {
  const [open, setOpen] = useState(false);
  const iso = literalValue(value).trim();
  const selected = iso ? fromIsoDay(iso) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-1">
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              aria-label={field.name}
              className={cn(
                'h-8 flex-1 justify-start gap-1.5 text-xs font-normal',
                !iso && 'text-muted-foreground',
              )}
            >
              <CalendarIcon className="size-3.5 shrink-0" />
              {iso ? formatDateValue(iso) : 'Not set'}
            </Button>
          }
        />
        {iso ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            className="size-7 shrink-0 text-muted-foreground"
            aria-label={`Clear ${field.name}`}
            onClick={() => onChange(null)}
          >
            <X className="size-3.5" />
          </Button>
        ) : null}
      </div>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            onChange(date ? toIsoDay(date) : null);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function StatusEditor({ field, value, disabled, onChange }: CustomFieldValueEditorProps) {
  const selected = singleSelectOptionId(value);
  return (
    <Select
      value={selected ?? CLEAR_VALUE}
      disabled={disabled}
      onValueChange={(next) => onChange(next === CLEAR_VALUE ? null : next)}
    >
      <SelectTrigger size="sm" className="h-8 w-full text-xs" aria-label={field.name}>
        <SelectValue placeholder="Not set" items={choiceLabels(field)} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={CLEAR_VALUE} className="text-xs text-muted-foreground">
          Not set
        </SelectItem>
        {customFieldChoiceOptions(field).map((option) => (
          <SelectItem key={option.id} value={option.id} className="text-xs">
            <StatusDot color={option.color} />
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function StatusDot({ color }: { color: string | null | undefined }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2 shrink-0 rounded-full bg-muted-foreground/40"
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}

// Same commit-on-blur shape as TextEditor, parsed as a number: a half-typed "1." is
// a draft, not a value.
function NumberEditor({ field, value, disabled, onChange }: CustomFieldValueEditorProps) {
  const stored = typeof value === 'number' ? String(value) : '';
  const [draft, setDraft] = useState(stored);
  useEffect(() => setDraft(stored), [stored]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === stored) return;
    if (trimmed.length === 0) return onChange(null);
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) onChange(parsed);
    else setDraft(stored);
  };

  return (
    <Input
      type="number"
      inputMode="decimal"
      value={draft}
      disabled={disabled}
      aria-label={field.name}
      placeholder="Not set"
      className="h-8 text-xs"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}

function CheckboxEditor({ field, value, disabled, onChange }: CustomFieldValueEditorProps) {
  return (
    <label className="flex min-h-8 items-center gap-2 text-xs">
      <input
        type="checkbox"
        className="size-4 accent-primary"
        checked={value === true}
        disabled={disabled}
        aria-label={field.name}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="text-muted-foreground">{value === true ? 'Yes' : 'No'}</span>
    </label>
  );
}

// Clicking the current rating clears it: the one way back to "not rated".
function RatingEditor({ field, value, disabled, onChange }: CustomFieldValueEditorProps) {
  const current = typeof value === 'number' ? value : 0;
  const max = ratingMax(field);
  return (
    <fieldset aria-label={field.name} disabled={disabled} className="flex items-center gap-0.5">
      {Array.from({ length: max }, (_, index) => index + 1).map((star) => (
        <button
          key={star}
          type="button"
          aria-label={`${star} of ${max}`}
          aria-pressed={star <= current}
          onClick={() => onChange(star === current ? null : star)}
          className="rounded p-0.5 text-muted-foreground transition-colors hover:text-amber-500 active:scale-[0.92]"
        >
          <Star className={cn('size-4', star <= current && 'fill-amber-400 text-amber-500')} />
        </button>
      ))}
    </fieldset>
  );
}

function UserEditor({ field, value, disabled, onChange }: CustomFieldValueEditorProps) {
  const members = useMentionTargets(field.brandId);
  const selected = literalValue(value) || null;
  const knownSelected = selected && members?.some((member) => member.userId === selected);
  return (
    <Select
      value={selected ?? CLEAR_VALUE}
      disabled={disabled || members === null}
      onValueChange={(next) => onChange(next === CLEAR_VALUE ? null : next)}
    >
      <SelectTrigger size="sm" className="h-8 w-full text-xs" aria-label={field.name}>
        <SelectValue
          placeholder={members === null ? 'Loading members…' : 'Unassigned'}
          items={{
            [CLEAR_VALUE]: 'Unassigned',
            ...(selected && !knownSelected ? { [selected]: 'Former member' } : {}),
            ...Object.fromEntries((members ?? []).map((member) => [member.userId, member.label])),
          }}
        />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={CLEAR_VALUE} className="text-xs text-muted-foreground">
          Unassigned
        </SelectItem>
        {selected && !knownSelected ? (
          <SelectItem value={selected} className="text-xs text-muted-foreground">
            Former member
          </SelectItem>
        ) : null}
        {(members ?? []).map((member) => (
          <SelectItem key={member.userId} value={member.userId} className="text-xs">
            {member.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function UrlEditor(props: CustomFieldValueEditorProps) {
  const href = literalValue(props.value).trim();
  return (
    <div className="flex items-center gap-1">
      <div className="flex-1">
        <TextEditor {...props} />
      </div>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={`Open ${props.field.name}`}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="size-3.5" />
        </a>
      ) : null}
    </div>
  );
}

export function CustomFieldValueEditor(props: CustomFieldValueEditorProps) {
  switch (props.field.type) {
    case 'single_select':
      return <SingleSelectEditor {...props} />;
    case 'multi_select':
      return <MultiSelectEditor {...props} />;
    case 'date':
      return <DateEditor {...props} />;
    case 'status':
      return <StatusEditor {...props} />;
    case 'number':
      return <NumberEditor {...props} />;
    case 'checkbox':
      return <CheckboxEditor {...props} />;
    case 'rating':
      return <RatingEditor {...props} />;
    case 'user':
      return <UserEditor {...props} />;
    case 'url':
      return <UrlEditor {...props} />;
    default:
      return <TextEditor {...props} />;
  }
}
