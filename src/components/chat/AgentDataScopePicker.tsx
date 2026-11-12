'use client';

import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

export type AgentDataScopeOption = {
  id: string;
  label: string;
};

type AgentDataScopePickerProps = {
  label: string;
  options: AgentDataScopeOption[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  requiredIds?: string[];
  maxSelected?: number;
  disabled?: boolean;
};

export function AgentDataScopePicker({
  label,
  options,
  selectedIds,
  onChange,
  requiredIds = [],
  maxSelected = 10,
  disabled = false,
}: AgentDataScopePickerProps) {
  const tUi = useTranslations('common');

  const [open, setOpen] = useState(false);
  const panelId = useId();
  const required = useMemo(() => new Set(requiredIds), [requiredIds]);
  const selected = useMemo(
    () => new Set([...requiredIds, ...selectedIds]),
    [requiredIds, selectedIds],
  );
  const count = options.filter(({ id }) => selected.has(id)).length;
  const limit = Math.min(maxSelected, options.length);

  const commit = (next: Set<string>) => {
    onChange(options.filter(({ id }) => next.has(id)).map(({ id }) => id));
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={tUi('m_0bffdda11e', {
          v0: String(label),
          v1: String(count),
          v2: String(options.length),
        })}
        disabled={disabled || options.length === 0}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-xs text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span>{label}</span>
        <span className="text-muted-foreground">
          {count}/{options.length}
        </span>
        <ChevronDown aria-hidden="true" className="size-3" />
      </button>

      {open ? (
        <div
          id={panelId}
          className="absolute bottom-full left-0 z-50 mb-1 w-72 rounded-md border bg-popover p-2 text-popover-foreground shadow-md"
        >
          <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
            <span className="text-xs font-medium">
              {count}
              {tUi('of_a4282e4')}
              {options.length}
              {tUi('m_f44aea1d4e')}
            </span>
            <button
              type="button"
              disabled={disabled || count >= limit}
              onClick={() => commit(new Set(options.slice(0, limit).map(({ id }) => id)))}
              className="text-xs text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              {tUi('m_62678a43bb')}
              {limit}
            </button>
          </div>
          <fieldset className="max-h-56 space-y-0.5 overflow-y-auto">
            <legend className="sr-only">{label}</legend>
            {options.map((option) => {
              const checked = selected.has(option.id);
              const isRequired = required.has(option.id);
              return (
                <label
                  key={option.id}
                  className={cn(
                    'flex min-h-8 items-center gap-2 rounded px-2 text-xs hover:bg-muted',
                    (disabled || isRequired || (!checked && count >= maxSelected)) && 'opacity-60',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled || isRequired || (!checked && count >= maxSelected)}
                    onChange={() => {
                      const next = new Set(selected);
                      if (checked) next.delete(option.id);
                      else next.add(option.id);
                      commit(next);
                    }}
                    className="size-3.5 accent-primary"
                  />
                  <span className="min-w-0 truncate">{option.label}</span>
                  {isRequired ? (
                    <span className="ml-auto text-2xs text-muted-foreground">
                      {tUi('m_a9a96ec019')}
                    </span>
                  ) : null}
                </label>
              );
            })}
          </fieldset>
        </div>
      ) : null}
    </div>
  );
}
