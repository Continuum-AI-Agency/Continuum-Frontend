'use client';

// The editor shown when a generation node's grounding chip is clicked. One place
// to toggle both halves of the grounding data piece — brand-book pieces and
// creative-direction skills — each with a description so the choice is legible.
// Reuses the same pure toggle helpers as the right-click context menus, so the
// two surfaces never drift. "Manage skills" deep-links to the settings browser.

import type { BrandBookPieceKind } from '@continuum/contracts';
import { Check, Wand2 } from 'lucide-react';
import Link from 'next/link';
import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useBrandBook } from '@/lib/brands/useBrandBook.client';
import { useBrandSkills } from '@/lib/organic/skills';
import { cn } from '@/lib/utils';
import {
  BRAND_BOOK_PIECE_OPTIONS,
  brandBookAvailability,
  isEntireBookEnforced,
  isPieceEnforced,
} from '../utils/brandEnforcement';

function ToggleRow({
  checked,
  disabled,
  onToggle,
  label,
  description,
  hint,
}: {
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  label: string;
  description?: string | null;
  hint?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className="flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/60 disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <span
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
          checked ? 'border-brand-primary bg-brand-primary text-white' : 'border-border',
        )}
      >
        {checked && <Check className="h-3 w-3" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {label}
          {hint ? <span className="font-normal text-muted-foreground"> · {hint}</span> : null}
        </span>
        {description ? (
          <span className="block text-xs leading-snug text-muted-foreground">{description}</span>
        ) : null}
      </span>
    </button>
  );
}

export function GroundingPopover({
  brandId,
  skillIds,
  brandBookPieces,
  onToggleSkill,
  onTogglePiece,
}: {
  brandId?: string;
  skillIds: string[];
  brandBookPieces: BrandBookPieceKind[] | undefined;
  onToggleSkill: (skillId: string) => void;
  onTogglePiece: (kind: BrandBookPieceKind) => void;
}) {
  const { brandTokens } = useBrandBook(brandId);
  const availability = React.useMemo(() => brandBookAvailability(brandTokens), [brandTokens]);
  const { all, isLoading } = useBrandSkills(brandId);
  // Canvas nodes drive visual generation, so only visual/both skills belong here —
  // copy skills steer the organic agent's text.
  const creativeSkills = React.useMemo(
    () => all.filter((skill) => skill.surface !== 'copy' && skill.status === 'active'),
    [all],
  );

  return (
    <ScrollArea className="max-h-[min(28rem,var(--radix-popover-content-available-height))]">
      <div className="flex flex-col gap-3 pr-3">
        <section>
          <p className="mb-1 px-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
            Brand book
          </p>
          <ToggleRow
            checked={isEntireBookEnforced(brandBookPieces)}
            disabled={!availability.full}
            onToggle={() => onTogglePiece('full')}
            label="Entire brand book"
            description="Force every piece of the brand book into the generation."
          />
          <Separator className="my-1" />
          {availability.full ? (
            BRAND_BOOK_PIECE_OPTIONS.map(({ kind, label, description }) => (
              <ToggleRow
                key={kind}
                checked={isPieceEnforced(brandBookPieces, kind)}
                disabled={!availability[kind]}
                onToggle={() => onTogglePiece(kind)}
                label={label}
                description={description}
                hint={!availability[kind] ? 'not in brand book' : undefined}
              />
            ))
          ) : (
            <p className="px-1.5 py-1 text-xs text-muted-foreground">
              No brand book yet — finish it in Settings.
            </p>
          )}
        </section>

        <section>
          <div className="mb-1 flex items-center justify-between px-0.5">
            <p className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
              Creative skills
            </p>
            <Link
              href="/settings?section=skills"
              className="inline-flex items-center gap-1 text-[0.65rem] text-muted-foreground transition-colors hover:text-foreground"
            >
              <Wand2 className="h-3 w-3" />
              Manage
            </Link>
          </div>
          {isLoading ? (
            <p className="px-1.5 py-1 text-xs text-muted-foreground">Loading…</p>
          ) : creativeSkills.length === 0 ? (
            <p className="px-1.5 py-1 text-xs text-muted-foreground">
              No creative skills yet — create one from Manage.
            </p>
          ) : (
            creativeSkills.map((skill) => (
              <ToggleRow
                key={skill.id}
                checked={skillIds.includes(skill.id)}
                onToggle={() => onToggleSkill(skill.id)}
                label={`${skill.name}${skill.isTemplate ? ' · Library' : ''}`}
                description={skill.description}
              />
            ))
          )}
        </section>
      </div>
    </ScrollArea>
  );
}
