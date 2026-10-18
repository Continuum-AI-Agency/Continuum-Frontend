'use client';

import { formatPlannerTimeOfDay, parsePlannerTimeOfDay } from '@continuum/contracts';
import { Check } from 'lucide-react';
import * as React from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { OrganicPlatformKey } from '@/lib/organic/platforms';
import { ORGANIC_POST_PLATFORM_KEYS, postFormatOptions } from '@/lib/organic/postPlatforms';
import { normalizeTimeLabel } from '@/lib/organic/scheduling';
import { cn } from '@/lib/utils';

const QUICK_TIME_OPTIONS = ['9:00 AM', '1:00 PM', '5:00 PM'] as const;

const chipClass =
  'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-foreground/90 transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50';

function Sep() {
  return <span className="select-none text-muted-foreground/40">·</span>;
}

/**
 * Whether two time labels name the same clock time.
 *
 * A raw `===` against `draft.timeLabel` marked nothing active for any label the presets
 * do not spell identically — `09:00 AM`, `9:00 am`, the canonical `09:00`, or the
 * persistence layer's `12:00 AM` fallback. Both sides normalize through the contracts
 * parser, which is the same one the backend uses.
 */
function isSameClockTime(a: string, b: string): boolean {
  const left = parsePlannerTimeOfDay(a);
  const right = parsePlannerTimeOfDay(b);
  if (!left || !right) return false;
  return formatPlannerTimeOfDay(left) === formatPlannerTimeOfDay(right);
}

/** Case- and whitespace-insensitive, so a stored `reel` still marks the Reel option. */
function isSameFormat(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** The selection in the menu's own order, never empty: format options need a platform. */
function normalizeSelection(platforms: readonly OrganicPlatformKey[]): OrganicPlatformKey[] {
  const ordered = ORGANIC_POST_PLATFORM_KEYS.filter((value) => platforms.includes(value));
  return ordered.length > 0 ? ordered : ['instagram'];
}

function TimeChip({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(value);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setPending(value);
      setError(null);
    }
  }, [open, value]);

  const commit = (raw: string) => {
    const normalized = normalizeTimeLabel(raw.trim());
    if (!normalized) {
      setError('Use 9:00 AM or 14:00');
      return;
    }
    onChange(normalized);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button type="button" className={chipClass} aria-label="Edit posting time">
            {value}
          </button>
        }
      />
      <PopoverContent side="bottom" align="start" className="w-56 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Posting time
        </p>
        <div className="mb-2 flex flex-wrap gap-1">
          {QUICK_TIME_OPTIONS.map((time) => {
            const isActive = isSameClockTime(time, value);
            return (
              <button
                key={time}
                type="button"
                aria-pressed={isActive}
                onClick={() => commit(time)}
                className={cn(
                  'rounded-md border px-2 py-1 text-xs transition-colors duration-150',
                  isActive
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground',
                )}
              >
                {time}
              </button>
            );
          })}
        </div>
        <Input
          value={pending}
          onChange={(event) => setPending(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit(pending);
            }
            if (event.key === 'Escape') setOpen(false);
          }}
          placeholder="Custom — 9:00 AM"
          className="h-8 text-xs"
          autoFocus
        />
        {error && <p className="mt-1 text-2xs text-destructive">{error}</p>}
      </PopoverContent>
    </Popover>
  );
}

/**
 * The slim, glanceable metadata strip atop the previewer: [platforms] · format · time as
 * compact chips that open their picker on click, with a trailing slot for the ⋯ command menu.
 * The platform control is the caller's (`platformControl`): ticking a platform writes a row.
 */
export function PostMetaChips({
  platforms,
  platformControl,
  format,
  formatLabel,
  timeLabel,
  onFormatChange,
  onTimeChange,
  actions,
  className,
}: {
  /** The post's platforms: the format menu offers only what every one of them takes. */
  platforms: OrganicPlatformKey[];
  platformControl?: React.ReactNode;
  format: string;
  /** What the previewed platform calls this format ("Short", "Video"); defaults to it. */
  formatLabel?: string;
  timeLabel: string;
  onFormatChange: (next: string) => void;
  onTimeChange: (next: string) => void;
  actions?: React.ReactNode;
  className?: string;
}) {
  const selected = normalizeSelection(platforms);

  return (
    <div
      className={cn(
        'flex items-center gap-1 border-b border-border/60 bg-muted/40 px-2 py-1.5',
        className,
      )}
    >
      {platformControl ? (
        <>
          {platformControl}
          <Sep />
        </>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button type="button" className={chipClass} aria-label="Change format">
              {formatLabel ?? format}
            </button>
          }
        />
        <DropdownMenuContent align="start" className="w-36">
          {/* The format menu marked no current value at all, so it read as "pick one"
              rather than "this is the one". */}
          {/* HyperFrame is a video-production method, not a selectable post format; and a
              post goes out on every selected platform, so only formats they all take. */}
          {postFormatOptions(selected).map((option) => (
            <DropdownMenuItem
              key={option}
              onSelect={() => onFormatChange(option)}
              className="justify-between"
            >
              {option}
              {isSameFormat(option, format) ? (
                <Check className="size-3.5 text-primary" aria-label="Current format" />
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Sep />

      <TimeChip value={timeLabel} onChange={onTimeChange} />

      {actions ? <div className="ml-auto">{actions}</div> : null}
    </div>
  );
}
