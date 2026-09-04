'use client';

// The grounding editor's single source of truth, rendered two ways. The chip
// (GroundingChip) opens a hover menu whose four sections — brand book, creative
// direction, design system, creative skills — are hover submenus of checkbox rows,
// mirroring the pre-grounding-UX BrandBookMenu / CreativeSkillMenu context
// submenus; row descriptions live in side="right" tooltips and pieces the brand
// has not built yet are disabled with a "not in brand book" nudge. The inspector
// (GroundingSection) mounts the same editor inline as a flat panel. Both surfaces
// render the row model `useGroundingModel` builds, so the checked/disabled/hint
// semantics can never drift between them; the pure toggle helpers stay in
// `utils/brandEnforcement`, shared with the node payload builder.
//
// The flat panel owns NO scroller: the inspector's bounded pane
// (CanvasFloatingPanel) is the one scrollport, and the section headers stick to it.
// It must not be given one back — not a plain overflow div (a second scrollport
// steals sticky from the pane above it) and not shadcn ScrollArea, whose viewport is
// `size-full` (a `max-h` on its root resolves to `height: auto`, so content spills
// instead of scrolling) and wraps children in a `display: table` div that breaks
// sticky outright.

import type { BrandBookPieceKind, BrandDirectionPiece, DesignSection } from '@continuum/contracts';
import { Check, Wand2 } from 'lucide-react';
import Link from 'next/link';
import React from 'react';
import {
  BrandBookPiecePreview,
  SkillConfigPreview,
} from '@/components/brand/GenerationConfigPreview';
import {
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  BRAND_BOOK_PIECE_LABELS,
  describeSkillForGeneration,
  presentBrandBookPiece,
} from '@/lib/brands/generationConfigPresentation';
import { useBrandBook } from '@/lib/brands/useBrandBook.client';
import { useBrandDesignSections } from '@/lib/brands/useBrandDesignSections.client';
import { useBrandDirectionPieces } from '@/lib/brands/useBrandDirectionPieces.client';
import { useBrandSkills } from '@/lib/organic/skills';
import { cn } from '@/lib/utils';
import {
  brandBookAvailability,
  CONCRETE_BRAND_BOOK_PIECES,
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

const STYLE_CAPTION =
  'What this generation is allowed to draw on. Switch on only what this piece needs.';
const DIRECTION_CAPTION =
  'What the compiler is allowed to say. Only pieces this brand has authored appear.';

/**
 * Where a canvas node's design-system grounding comes from.
 *
 * Shared with `GroundingChip`, which derives it from the graph and passes it down.
 */
export interface DesignGroundingContext {
  /** The node type's ambient row from SECTION_AUTO_APPLY. */
  readonly autoApplied: readonly DesignSection[];
  /** Sections a connected designRef supplies, and the payload therefore suppresses. */
  readonly wired: readonly DesignSection[];
}

/**
 * The sections this node will actually ground on.
 *
 * `null` means the pre-contextual reading — no per-type row and no hand-picked list, so
 * the Backend applies everything the brand enabled.
 */
export function effectiveDesignSections(
  selected: readonly DesignSection[] | undefined,
  contextual: DesignGroundingContext | undefined,
): DesignSection[] | null {
  if (selected === undefined && !contextual) return null;
  const base = selected ?? contextual?.autoApplied ?? [];
  const wired = new Set(contextual?.wired ?? []);
  return base.filter((section) => !wired.has(section));
}

type GroundingEditorProps = {
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
  /**
   * Where this node's design-system sections come from when nobody picked by hand.
   *
   * `autoApplied` is the node type's own row — an image generator grounds on palette,
   * imagery and logo, not on the brand's motion easing. `wired` are sections a connected
   * Design Reference supplies explicitly, which the payload removes from the ambient set.
   *
   * Absent means the old reading: `undefined` is "everything the brand enabled".
   */
  contextual?: DesignGroundingContext;
};

type GroundingRow = {
  key: string;
  checked: boolean;
  disabled?: boolean;
  label: string;
  description?: string | null;
  preview?: React.ReactNode;
  hint?: string;
  onToggle: () => void;
};

/**
 * Builds the row model both surfaces render. `bookRows`, `directionRows` and
 * `designRows` are null when their section has nothing to show (no book yet, no
 * authored direction, no approved system) — the renderers decide what an absent
 * section looks like on their surface.
 */
function useGroundingModel({
  brandId,
  skillIds,
  brandBookPieces,
  brandDirectionPieces,
  onToggleSkill,
  onTogglePiece,
  onToggleDirectionPiece,
  designSystemSections,
  onToggleDesignSection,
  contextual,
}: GroundingEditorProps) {
  const direction = useBrandDirectionPieces(brandId);
  // Read here rather than passed down: the rows describe the BRAND's system, not this
  // node's selection, so every chip on the canvas would otherwise thread the same list
  // through props to render the same sections.
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

  const effectiveSections = React.useMemo(
    () => effectiveDesignSections(designSystemSections, contextual),
    [designSystemSections, contextual],
  );
  const wiredSections = React.useMemo(() => new Set(contextual?.wired ?? []), [contextual]);
  const fullBook = presentBrandBookPiece(brandTokens, 'full');

  const enforceRow: GroundingRow = {
    key: 'full',
    checked: brandEnforced,
    // Never block turning enforcement OFF — only block turning it on when the brand
    // has no book to enforce.
    disabled: !availability.full && !brandEnforced,
    onToggle: () => onTogglePiece('full'),
    label: 'Enforce brand book',
    description: fullBook?.description,
    ...(fullBook ? { preview: <BrandBookPiecePreview presentation={fullBook} /> } : {}),
  };

  const bookRows: GroundingRow[] | null = availability.full
    ? CONCRETE_BRAND_BOOK_PIECES.map((kind) => {
        const presentation = presentBrandBookPiece(brandTokens, kind);
        return {
          key: kind,
          checked: isPieceEnforced(brandBookPieces, kind),
          disabled: !presentation,
          onToggle: () => onTogglePiece(kind),
          label: presentation?.label ?? BRAND_BOOK_PIECE_LABELS[kind],
          description: presentation?.description,
          ...(presentation
            ? { preview: <BrandBookPiecePreview presentation={presentation} /> }
            : { hint: 'not in brand book' }),
        };
      })
    : null;

  const directionRows: GroundingRow[] | null =
    onToggleDirectionPiece && direction.pieces.length > 0
      ? direction.pieces.map((entry) => ({
          key: entry.piece,
          /* `undefined` is "no preference", which means every piece is in play. */
          checked: brandDirectionPieces === undefined || brandDirectionPieces.includes(entry.piece),
          onToggle: () => onToggleDirectionPiece(entry.piece),
          label: DIRECTION_PIECE_LABELS[entry.piece],
          description:
            entry.approvedCount === 0
              ? 'Written but not approved — switching it on changes nothing yet.'
              : entry.gates
                ? 'Approved, and hard enough to reject a candidate.'
                : 'Approved. Shapes the prompt; does not reject.',
          ...(entry.approvedCount === 0 ? { hint: 'not approved' } : {}),
        }))
      : null;
  const directionCount =
    brandDirectionPieces === undefined ? 'all on' : `${brandDirectionPieces.length} on`;

  const designRows: GroundingRow[] | null =
    onToggleDesignSection && designSections.length > 0
      ? designSections.map((entry) => {
          const wired = wiredSections.has(entry.section);
          return {
            key: entry.section,
            /* `null` is the pre-contextual reading — no per-type row, so everything the
               brand enabled applies. Otherwise the row shows what this node will ACTUALLY
               ground on, which is the only honest thing to show once the default is
               narrower than "all". */
            checked: effectiveSections === null || effectiveSections.includes(entry.section),
            /* A wired Design Reference owns its section: toggling here would be subtracted
               straight back out, so the control says so instead of pretending to work. */
            disabled: wired,
            onToggle: () => onToggleDesignSection(entry.section),
            label: entry.title,
            description: wired
              ? 'Supplied by a connected Design Reference, which outranks this list.'
              : entry.ruleCount === 0
                ? 'No rules recorded — switching it on changes nothing yet.'
                : entry.gates
                  ? `${entry.ruleCount} rules, hard enough to reject a candidate.`
                  : `${entry.ruleCount} rules. Shapes the prompt; does not reject.`,
            ...(wired ? { hint: 'wired' } : entry.ruleCount === 0 ? { hint: 'empty' } : {}),
          };
        })
      : null;
  const designCount =
    effectiveSections === null
      ? 'all on'
      : designSystemSections === undefined
        ? `${effectiveSections.length} auto`
        : `${effectiveSections.length} on`;
  const designCaption = `The brand's approved system. Outranks the brand book where they disagree.${
    designSystemSections === undefined && effectiveSections !== null
      ? ' Switched on by default for this kind of node.'
      : ''
  }`;

  const skillRows: GroundingRow[] = creativeSkills.map((skill) => ({
    key: skill.id,
    checked: skillIds.includes(skill.id),
    onToggle: () => onToggleSkill(skill.id),
    label: `${skill.name}${skill.isTemplate ? ' · Library' : ''}`,
    description: describeSkillForGeneration(skill),
    preview: <SkillConfigPreview skill={skill} />,
  }));

  return {
    enforceRow,
    bookRows,
    brandEnforced,
    enforcedCount,
    directionRows,
    directionCount,
    designRows,
    designCount,
    designCaption,
    skillRows,
    skillsLoading: isLoading,
    skillCount: skillIds.length,
  };
}

// ————— The chip's hover-menu surface —————

// Every sub-surface floats over the canvas: it must not drag/pan/zoom the graph
// and must scroll itself. Base UI's Positioner sets --available-height (the Radix
// variable no longer exists), and 20rem mirrors the old context submenus' max-h-80.
const SUB_CONTENT_CLASS =
  'nodrag nopan nowheel z-[1100] w-64 max-h-[min(20rem,var(--available-height))]';

function GroundingCheckboxRow({ row }: { row: GroundingRow }) {
  const rowLabel = (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      {row.preview}
      <span className="min-w-0 flex-1 truncate">
        {row.label}
        {row.hint ? <span className="text-muted-foreground"> · {row.hint}</span> : null}
      </span>
    </span>
  );
  return (
    <DropdownMenuCheckboxItem
      checked={row.checked}
      disabled={row.disabled}
      onClick={() => row.onToggle()}
    >
      {row.description ? (
        <Tooltip>
          <TooltipTrigger render={rowLabel} />
          <TooltipContent side="right" className="max-w-xs">
            {row.description}
          </TooltipContent>
        </Tooltip>
      ) : (
        rowLabel
      )}
    </DropdownMenuCheckboxItem>
  );
}

function SubCaption({ children }: { children: React.ReactNode }) {
  return <p className="px-1.5 pb-1 text-[0.65rem] text-muted-foreground">{children}</p>;
}

function SectionSubTrigger({ title, count }: { title: string; count?: string | null }) {
  return (
    <DropdownMenuSubTrigger>
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {count ? <span className="text-[0.65rem] text-muted-foreground">{count}</span> : null}
    </DropdownMenuSubTrigger>
  );
}

/**
 * The Style menu's body: one hover submenu per grounding section, rendered inside
 * the chip's DropdownMenuContent (GroundingChip owns the Root and the trigger).
 */
export function GroundingMenuSections(props: GroundingEditorProps) {
  const model = useGroundingModel(props);

  return (
    <TooltipProvider delay={250}>
      {/*
        One control, three sources. The brand book, the creative direction the brand
        authored, and the creative skills all shape how the output LOOKS; presenting
        them as sections of "Style" is what makes them read as one decision instead of
        three unrelated switches that happen to share a menu.
      */}
      <DropdownMenuGroup>
        <DropdownMenuLabel className="text-foreground">Style</DropdownMenuLabel>
        <SubCaption>{STYLE_CAPTION}</SubCaption>
        <DropdownMenuSub>
          <SectionSubTrigger
            title="Brand book"
            count={model.brandEnforced ? `${model.enforcedCount} on` : null}
          />
          <DropdownMenuSubContent className={SUB_CONTENT_CLASS}>
            <DropdownMenuGroup>
              <GroundingCheckboxRow row={model.enforceRow} />
              <DropdownMenuSeparator />
              {model.bookRows ? (
                model.bookRows.map((row) => <GroundingCheckboxRow key={row.key} row={row} />)
              ) : (
                <DropdownMenuItem render={<Link href="/settings?section=brand" />}>
                  No brand book yet — finish it in Settings
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {model.directionRows ? (
          <DropdownMenuSub>
            <SectionSubTrigger title="Creative direction" count={model.directionCount} />
            <DropdownMenuSubContent className={SUB_CONTENT_CLASS}>
              <SubCaption>{DIRECTION_CAPTION}</SubCaption>
              <DropdownMenuGroup>
                {model.directionRows.map((row) => (
                  <GroundingCheckboxRow key={row.key} row={row} />
                ))}
              </DropdownMenuGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}

        {model.designRows ? (
          <DropdownMenuSub>
            <SectionSubTrigger title="Design system" count={model.designCount} />
            <DropdownMenuSubContent className={SUB_CONTENT_CLASS}>
              <SubCaption>{model.designCaption}</SubCaption>
              <DropdownMenuGroup>
                {model.designRows.map((row) => (
                  <GroundingCheckboxRow key={row.key} row={row} />
                ))}
              </DropdownMenuGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}

        <DropdownMenuSub>
          <SectionSubTrigger
            title="Creative skills"
            count={model.skillCount > 0 ? `${model.skillCount} on` : null}
          />
          <DropdownMenuSubContent className={SUB_CONTENT_CLASS}>
            <DropdownMenuGroup>
              <DropdownMenuItem render={<Link href="/settings?section=skills" />}>
                <Wand2 />
                Manage skills
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {model.skillsLoading ? (
                <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
              ) : model.skillRows.length === 0 ? (
                <DropdownMenuItem disabled>
                  No creative skills yet — create one from Manage.
                </DropdownMenuItem>
              ) : (
                model.skillRows.map((row) => <GroundingCheckboxRow key={row.key} row={row} />)
              )}
            </DropdownMenuGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuGroup>
    </TooltipProvider>
  );
}

// ————— The inspector's flat inline panel —————

// `mt-3` is the group spacing the flat column no longer gets from a `gap`, and `min-h-6`
// keeps every header the same height: they all pin to `top-0` in one containing block, so
// the one arriving covers the one already there — a taller header underneath would peek.
function SectionHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-10 mb-1 mt-3 flex min-h-6 items-center justify-between gap-2 bg-background px-0.5 py-1">
      <p className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

function ToggleRow({ row }: { row: GroundingRow }) {
  return (
    <button
      type="button"
      disabled={row.disabled}
      onClick={row.onToggle}
      className="flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/60 disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <span
        className={cn(
          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border',
          row.checked ? 'border-brand-primary bg-brand-primary text-white' : 'border-border',
        )}
      >
        {row.checked && <Check className="h-3 w-3" />}
      </span>
      {row.preview}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {row.label}
          {row.hint ? (
            <span className="font-normal text-muted-foreground"> · {row.hint}</span>
          ) : null}
        </span>
        {row.description ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="line-clamp-2 block text-xs leading-snug text-muted-foreground">
                  {row.description}
                </span>
              }
            />
            <TooltipContent side="right" className="max-w-xs">
              {row.description}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </span>
    </button>
  );
}

/**
 * The same editor as the chip's hover menu, laid flat: the inspector mounts it
 * inline, where a menu-in-a-panel would be a popover on a popover.
 */
export function GroundingPopover(props: GroundingEditorProps) {
  const model = useGroundingModel(props);

  return (
    <TooltipProvider delay={250}>
      {/* No scroll container of its own. This surface is only ever mounted INSIDE the
          inspector's bounded pane, and `--available-height` is set by a Base UI
          Positioner — which is not in this tree, so the max-h was invalid at
          computed-value time and resolved to `none` (verified in Chromium). What the
          dead `overflow-y-auto` still did was claim the scrollport, so every
          `sticky top-0` header below stuck to a box that never scrolls and slid out of
          view instead of holding the top of the list (Airtable #281). */}
      <div className="p-2">
        {/* One flat column, not a <section> per group. A sticky header resolves against
            its nearest block ancestor, so a wrapper that ends where its group ends
            carries its own header out of the scrollport the moment the group does —
            measured at full scroll as -1445 for the first group's header against 0 for
            the last one's. Sharing one containing block that runs the length of the
            list makes every header hold the top until the next one covers it. The
            spacing the column's `gap-3` used to give now rides on the headers' `mt-3`,
            so the groups still read apart. */}
        <div className="flex flex-col">
          <p className="px-1.5 pt-0.5 font-medium text-foreground text-xs">Style</p>
          <p className="mt-1 px-1.5 text-[0.65rem] text-muted-foreground">{STYLE_CAPTION}</p>

          <SectionHeader title="Brand book">
            {model.brandEnforced ? (
              <span className="text-[0.65rem] text-muted-foreground">{model.enforcedCount} on</span>
            ) : null}
          </SectionHeader>
          <ToggleRow row={model.enforceRow} />
          <Separator className="my-1" />
          {model.bookRows ? (
            model.bookRows.map((row) => <ToggleRow key={row.key} row={row} />)
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

          {model.directionRows ? (
            <>
              <SectionHeader title="Creative direction">
                <span className="text-[0.65rem] text-muted-foreground">{model.directionCount}</span>
              </SectionHeader>
              <p className="px-1.5 pb-1 text-[0.65rem] text-muted-foreground">
                {DIRECTION_CAPTION}
              </p>
              {model.directionRows.map((row) => (
                <ToggleRow key={row.key} row={row} />
              ))}
            </>
          ) : null}

          {model.designRows ? (
            <>
              <SectionHeader title="Design system">
                <span className="text-[0.65rem] text-muted-foreground">{model.designCount}</span>
              </SectionHeader>
              <p className="px-1.5 pb-1 text-[0.65rem] text-muted-foreground">
                {model.designCaption}
              </p>
              {model.designRows.map((row) => (
                <ToggleRow key={row.key} row={row} />
              ))}
            </>
          ) : null}

          <SectionHeader title="Creative skills">
            <div className="flex items-center gap-2">
              {model.skillCount > 0 ? (
                <span className="text-[0.65rem] text-muted-foreground">{model.skillCount} on</span>
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
          {model.skillsLoading ? (
            <p className="px-1.5 py-1 text-xs text-muted-foreground">Loading…</p>
          ) : model.skillRows.length === 0 ? (
            <p className="px-1.5 py-1 text-xs text-muted-foreground">
              No creative skills yet — create one from Manage.
            </p>
          ) : (
            model.skillRows.map((row) => <ToggleRow key={row.key} row={row} />)
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
