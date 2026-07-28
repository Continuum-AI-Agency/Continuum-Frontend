'use client';

import * as React from 'react';

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { OrganicPlatformKey } from '@/lib/organic/platforms';
import { normalizeTimeLabel } from '@/lib/organic/scheduling';
import { cn } from '@/lib/utils';

const PLATFORM_OPTIONS: { value: OrganicPlatformKey; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'linkedin', label: 'LinkedIn' },
];

// HyperFrame is a video-production method, not a selectable post format.
const FORMAT_OPTIONS = ['Post', 'Carousel', 'Reel'] as const;
const QUICK_TIME_OPTIONS = ['9:00 AM', '1:00 PM', '5:00 PM'] as const;

const PLATFORM_DOT: Record<string, string> = {
  instagram: '#E1306C',
  facebook: '#1877F2',
  linkedin: '#0A66C2',
};

const chipClass =
  'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-foreground/90 transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50';

function Sep() {
  return <span className="select-none text-muted-foreground/40">·</span>;
}

function platformLabel(platform: OrganicPlatformKey): string {
  return PLATFORM_OPTIONS.find((p) => p.value === platform)?.label ?? 'Instagram';
}

/**
 * The selection, in the menu's own order and never empty.
 *
 * Zero platforms is not representable downstream — every persist path stamps a scalar
 * `platform` column from `platforms[0]` — so an empty selection collapses to Instagram
 * rather than writing a row nothing can publish.
 */
function normalizeSelection(platforms: readonly OrganicPlatformKey[]): OrganicPlatformKey[] {
  const ordered = PLATFORM_OPTIONS.map((option) => option.value).filter((value) =>
    platforms.includes(value),
  );
  return ordered.length > 0 ? ordered : ['instagram'];
}

/**
 * Chip copy that stays glanceable as the selection grows: the platform's own name at
 * one, both names at two, a count at three. At N=1 this is byte-identical to the
 * single-platform chip it replaced.
 */
function selectionChipLabel(platforms: OrganicPlatformKey[]): string {
  if (platforms.length === 1) return platformLabel(platforms[0]);
  if (platforms.length === 2)
    return `${platformLabel(platforms[0])} + ${platformLabel(platforms[1])}`;
  return `${platforms.length} platforms`;
}

/** Always names every selected platform — the chip label stops doing so at N=3. */
function selectionAriaLabel(platforms: OrganicPlatformKey[]): string {
  return `Change platforms — ${platforms.map(platformLabel).join(', ')} selected`;
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
      <PopoverTrigger asChild>
        <button type="button" className={chipClass} aria-label="Edit posting time">
          {value}
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-56 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Posting time
        </p>
        <div className="mb-2 flex flex-wrap gap-1">
          {QUICK_TIME_OPTIONS.map((time) => (
            <button
              key={time}
              type="button"
              onClick={() => commit(time)}
              className={cn(
                'rounded-md border px-2 py-1 text-xs transition-colors duration-150',
                time === value
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground',
              )}
            >
              {time}
            </button>
          ))}
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
 * The slim, glanceable metadata strip atop the previewer: platform · format ·
 * time as compact chips that open their picker on click, with a trailing slot
 * for the ⋯ command menu. Replaces the always-on select header.
 */
export function PostMetaChips({
  platforms,
  format,
  timeLabel,
  onPlatformsChange,
  onFormatChange,
  onTimeChange,
  actions,
}: {
  platforms: OrganicPlatformKey[];
  format: string;
  timeLabel: string;
  onPlatformsChange: (next: OrganicPlatformKey[]) => void;
  onFormatChange: (next: string) => void;
  onTimeChange: (next: string) => void;
  actions?: React.ReactNode;
}) {
  const selected = normalizeSelection(platforms);

  const togglePlatform = (value: OrganicPlatformKey) => {
    const next = selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value];
    // Deselecting the last platform is refused rather than silently corrected, so the
    // menu never reports a state the caller did not ask for.
    if (next.length === 0) return;
    onPlatformsChange(normalizeSelection(next));
  };

  return (
    <div className="flex items-center gap-1 border-b border-border/60 bg-muted/40 px-2 py-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={chipClass} aria-label={selectionAriaLabel(selected)}>
            <span className="flex items-center">
              {selected.map((value, index) => (
                <span
                  key={value}
                  className={cn(
                    'h-1.5 w-1.5 rounded-full ring-1 ring-muted/40',
                    index > 0 && '-ml-0.5',
                  )}
                  style={{ backgroundColor: PLATFORM_DOT[value] ?? '#7C6FFF' }}
                />
              ))}
            </span>
            {selectionChipLabel(selected)}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          {PLATFORM_OPTIONS.map((option) => {
            const checked = selected.includes(option.value);
            return (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={checked}
                // The last remaining platform cannot be unchecked: zero platforms is
                // not representable downstream.
                disabled={checked && selected.length === 1}
                // Radix closes the menu on select by default, which would end the
                // multi-select after the very first toggle.
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={() => togglePlatform(option.value)}
              >
                <span
                  className="mr-2 h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: PLATFORM_DOT[option.value] ?? '#7C6FFF' }}
                />
                {option.label}
              </DropdownMenuCheckboxItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <Sep />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={chipClass} aria-label="Change format">
            {format}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-36">
          {FORMAT_OPTIONS.map((option) => (
            <DropdownMenuItem key={option} onSelect={() => onFormatChange(option)}>
              {option}
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
