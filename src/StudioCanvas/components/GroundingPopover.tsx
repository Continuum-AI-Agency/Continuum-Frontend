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

import type { BrandBookPieceKind, BrandDirectionPiece, DesignSection } from '@continuum/contracts';
import { Check, Wand2 } from 'lucide-react';
import Link from 'next/link';
import React from 'react';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useBrandBook } from '@/lib/brands/useBrandBook.client';
import { useBrandDesignSections } from '@/lib/brands/useBrandDesignSections.client';
import { useBrandDirectionPieces } from '@/lib/brands/useBrandDirectionPieces.client';
import { useBrandSkills } from '@/lib/organic/skills';
import { cn } from '@/lib/utils';
import {
  BRAND_BOOK_PIECE_OPTIONS,
  brandBookAvailability,
  enforcedConcretePieces,
  isBrandEnforced,
  isPieceEnforced,
} from '../utils/brandEnforcement';

/**
 * Human labels for the v2 pieces.
 *
 * Every member is spelled out rather than de-kebabed at render time: `colour-behaviour` reads
 * as "Colour behaviour" either way, but `brand-integration` is "Where the mark goes" to
 * somebody briefing a poster, and a mechanical transform cannot know that.
 */
const DIRECTION_PIECE_LABELS: Record<BrandDirectionPiece, string> = {
  'visual-thesis': 'Visual thesis',
  composition: 'Composition',
  'typography-behaviour': 'Typography behaviour',
  'colour-behaviour': 'Colour behaviour',
  photography: 'Photography',
  'illustration-graphic': 'Illustration and graphics',
  motion: 'Motion',
  'people-characters': 'People and characters',
  'product-world': 'The product in the world',
  'brand-integration': 'Where the mark goes',
  'brand-signature': 'Brand signature',
  prohibition: 'Refusals',
  'unclassified-direction': 'Unclassified direction',
};

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
            <TooltipTrigger
              render={
                <span className="line-clamp-2 block text-xs leading-snug text-muted-foreground">
                  {description}
                </span>
              }
            />
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
  brandDirectionPieces,
  onToggleSkill,
  onTogglePiece,
  onToggleDirectionPiece,
  designSystemSections,
  onToggleDesignSection,
}: {
  brandId?: string;
  skillIds: string[];
  brandBookPieces: BrandBookPieceKind[] | undefined;
  /** Tri-state: undefined = everything the plan admits, [] = none, a list narrows. */
  brandDirectionPieces?: BrandDirectionPiece[] | undefined;
  onToggleSkill: (skillId: string) => void;
  onTogglePiece: (kind: BrandBookPieceKind) => void;
  onToggleDirectionPiece?: (piece: BrandDirectionPiece) => void;
  /** `undefined` = no preference (the Backend resolves it from the rigor tier); `[]` = off. */
  designSystemSections?: DesignSection[] | undefined;
  onToggleDesignSection?: (section: DesignSection) => void;
}) {
  const direction = useBrandDirectionPieces(brandId);
  // Read here rather than passed down, matching `direction` above: the rows describe the
  // BRAND's system, not this node's selection, so every chip on the canvas would otherwise
  // thread the same list through props to render the same panel.
  const { sections: designSections } = useBrandDesignSections(brandId);
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
    <TooltipProvider delay={250}>
      <div className="max-h-[min(32rem,var(--radix-popover-content-available-height))] overflow-y-auto overscroll-contain p-2">
        <div className="flex flex-col gap-3">
          {/*
            One control, three sources. The brand book, the creative direction the brand
            authored, and the creative skills all shape how the output LOOKS; presenting
            them as sections of "Style" is what makes them read as one decision instead of
            three unrelated switches that happen to share a popover.
          */}
          <p className="px-1.5 pt-0.5 font-medium text-foreground text-xs">Style</p>
          <p className="-mt-2 px-1.5 text-[0.65rem] text-muted-foreground">
            What this generation is allowed to draw on. Switch on only what this piece needs.
          </p>
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

          {onToggleDirectionPiece && direction.pieces.length > 0 ? (
            <section>
              <SectionHeader title="Creative direction">
                <span className="text-[0.65rem] text-muted-foreground">
                  {brandDirectionPieces === undefined
                    ? 'all on'
                    : `${brandDirectionPieces.length} on`}
                </span>
              </SectionHeader>
              <p className="px-1.5 pb-1 text-[0.65rem] text-muted-foreground">
                What the compiler is allowed to say. Only pieces this brand has authored appear.
              </p>
              {direction.pieces.map((entry) => (
                <ToggleRow
                  key={entry.piece}
                  /* `undefined` is "no preference", which means every piece is in play. */
                  checked={
                    brandDirectionPieces === undefined || brandDirectionPieces.includes(entry.piece)
                  }
                  onToggle={() => onToggleDirectionPiece(entry.piece)}
                  label={DIRECTION_PIECE_LABELS[entry.piece]}
                  description={
                    entry.approvedCount === 0
                      ? 'Written but not approved — switching it on changes nothing yet.'
                      : entry.gates
                        ? 'Approved, and hard enough to reject a candidate.'
                        : 'Approved. Shapes the prompt; does not reject.'
                  }
                  hint={entry.approvedCount === 0 ? 'not approved' : undefined}
                />
              ))}
            </section>
          ) : null}

          {onToggleDesignSection && designSections.length > 0 ? (
            <section>
              <SectionHeader title="Design system">
                <span className="text-[0.65rem] text-muted-foreground">
                  {designSystemSections === undefined
                    ? 'all on'
                    : `${designSystemSections.length} on`}
                </span>
              </SectionHeader>
              <p className="px-1.5 pb-1 text-[0.65rem] text-muted-foreground">
                The brand&apos;s approved system. Outranks the brand book where they disagree.
              </p>
              {designSections.map((entry) => (
                <ToggleRow
                  key={entry.section}
                  /* Same reading as every other control here: `undefined` is "no
                     preference", which applies everything the brand left enabled. */
                  checked={
                    designSystemSections === undefined ||
                    designSystemSections.includes(entry.section)
                  }
                  onToggle={() => onToggleDesignSection(entry.section)}
                  label={entry.title}
                  description={
                    entry.ruleCount === 0
                      ? 'No rules recorded — switching it on changes nothing yet.'
                      : entry.gates
                        ? `${entry.ruleCount} rules, hard enough to reject a candidate.`
                        : `${entry.ruleCount} rules. Shapes the prompt; does not reject.`
                  }
                  hint={entry.ruleCount === 0 ? 'empty' : undefined}
                />
              ))}
            </section>
          ) : null}

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
