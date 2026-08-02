'use client';

// The editor shown when a generation node's grounding chip is clicked. One place
// to toggle both halves of the grounding data piece — brand-book pieces and
// creative-direction skills — each with a description so the choice is legible.
// Reuses the same pure toggle helpers as the node payload builder, so the surfaces
// never drift. "Manage skills" deep-links to the settings browser.
//
// The scroller is a plain overflow div, NOT shadcn ScrollArea: ScrollArea's Radix
// viewport is `size-full`, so a `max-h` on its root resolves to `height: auto` and
// the content spills out of the popover instead of scrolling. Its viewport also
// wraps children in a `display: table` div, which breaks the sticky headers.

import type { BrandBookPieceKind } from '@continuum/contracts';
import { Check, Wand2 } from 'lucide-react';
import Link from 'next/link';
import React from 'react';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useBrandBook } from '@/lib/brands/useBrandBook.client';
import { useBrandSkills } from '@/lib/organic/skills';
import { cn } from '@/lib/utils';
import {
  BRAND_BOOK_PIECE_OPTIONS,
  brandBookAvailability,
  enforcedConcretePieces,
  isBrandEnforced,
  isPieceEnforced,
} from '../utils/brandEnforcement';

function SectionHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-10 mb-1 flex items-center justify-between gap-2 bg-popover px-0.5 py-1">
      <p className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

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
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="line-clamp-2 block text-xs leading-snug text-muted-foreground">
                {description}
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs">
              {description}
            </TooltipContent>
          </Tooltip>
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

  const brandEnforced = isBrandEnforced(brandBookPieces);
  const enforcedCount = enforcedConcretePieces(brandBookPieces).length;

  return (
    <TooltipProvider delayDuration={250}>
      <div className="max-h-[min(32rem,var(--radix-popover-content-available-height))] overflow-y-auto overscroll-contain p-2">
        <div className="flex flex-col gap-3">
          <section>
            <SectionHeader title="Brand book">
              {brandEnforced ? (
                <span className="text-[0.65rem] text-muted-foreground">{enforcedCount} on</span>
              ) : null}
            </SectionHeader>
            <ToggleRow
              checked={brandEnforced}
              // Never block turning enforcement OFF — only block turning it on when the
              // brand has no book to enforce.
              disabled={!availability.full && !brandEnforced}
              onToggle={() => onTogglePiece('full')}
              label="Enforce brand book"
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
                No brand book yet —{' '}
                <Link
                  href="/settings?section=brand"
                  className="underline underline-offset-2 transition-colors hover:text-foreground"
                >
                  finish it in Settings
                </Link>
                .
              </p>
            )}
          </section>

          <section>
            <SectionHeader title="Creative skills">
              <div className="flex items-center gap-2">
                {skillIds.length > 0 ? (
                  <span className="text-[0.65rem] text-muted-foreground">{skillIds.length} on</span>
                ) : null}
                <Link
                  href="/settings?section=skills"
                  className="inline-flex items-center gap-1 text-[0.65rem] text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Wand2 className="h-3 w-3" />
                  Manage
                </Link>
              </div>
            </SectionHeader>
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
      </div>
    </TooltipProvider>
  );
}
