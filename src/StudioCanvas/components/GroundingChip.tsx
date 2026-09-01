'use client';

// The single grounding indicator on a canvas node. Replaces the old brand badge +
// ring + hidden-skills-in-a-submenu with ONE compact chip that says, at a glance,
// what will be forced into the generation ("Brand · Skills 2"). On a generation
// node, hovering (or clicking, for touch and keyboard) expands the Style menu out
// of the chip; hovering a section expands its checkbox rows as a submenu. On the
// enrich (string) node it is read-only — a plain tooltip surfaces the grounding
// inherited from the downstream generator so "tele-fill" visibly shows it is
// brand-guarded + skill-aware.

import type { BrandBookPieceKind, BrandDirectionPiece, DesignSection } from '@continuum/contracts';
import { SECTION_AUTO_APPLY, suppressedDesignSections } from '@continuum/contracts';
import { ChevronDown, Gem } from 'lucide-react';
import React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useBrandSkills } from '@/lib/organic/skills';
import { cn } from '@/lib/utils';
import { useStudioStore } from '../stores/useStudioStore';
import {
  BRAND_BOOK_PIECE_LABELS,
  enforcedConcretePieces,
  groundingChipLabel,
  isBrandEnforced,
  isEntireBookEnforced,
} from '../utils/brandEnforcement';
import {
  type DesignGroundingContext,
  effectiveDesignSections,
  GroundingMenuSections,
} from './GroundingPopover';

type Props = {
  brandId?: string;
  skillIds?: string[];
  brandBookPieces: BrandBookPieceKind[] | undefined;
  // Editable → hovering or clicking opens the grounding menu (generation nodes).
  editable?: boolean;
  onToggleSkill?: (skillId: string) => void;
  onTogglePiece?: (kind: BrandBookPieceKind) => void;
  /** Tri-state: undefined = everything the plan admits, [] = none, a list narrows. */
  brandDirectionPieces?: BrandDirectionPiece[];
  onToggleDirectionPiece?: (piece: BrandDirectionPiece) => void;
  /** Tri-state: undefined = the Backend resolves it from the rigor tier, [] = off. */
  designSystemSections?: DesignSection[] | undefined;
  onToggleDesignSection?: (section: DesignSection) => void;
  /**
   * This chip's own node, so it can say WHERE its design-system sections came from.
   *
   * With both set the chip derives the node type's ambient row and the sections a
   * connected Design Reference supplies. Without them it keeps the pre-contextual
   * reading, which is what the read-only enrich chip wants: the string node is handed
   * its generator's already-resolved list and has nothing of its own to derive.
   */
  nodeId?: string;
  nodeType?: string;
  // Read-only → the chip surfaces grounding inherited by the enrich node.
  inherited?: boolean;
  className?: string;
};

export function GroundingChip({
  brandId,
  skillIds,
  brandBookPieces,
  brandDirectionPieces,
  designSystemSections,
  editable,
  onToggleSkill,
  onTogglePiece,
  onToggleDirectionPiece,
  onToggleDesignSection,
  nodeId,
  nodeType,
  inherited,
  className,
}: Props) {
  const ids = skillIds ?? [];
  /*
   * Derived through a STRING, not an array.
   *
   * A canvas holds dozens of chips and `state.nodes` gets a new identity on every drag
   * frame, so selecting the array would re-render all of them continuously. Selecting the
   * joined section list means Zustand compares by value and a chip only re-renders when
   * its own wired set actually changes.
   */
  const wiredKey = useStudioStore((state) =>
    nodeId ? suppressedDesignSections(nodeId, state.nodes, state.edges).sort().join(',') : '',
  );
  const contextual: DesignGroundingContext | undefined = React.useMemo(() => {
    const autoApplied = nodeType
      ? SECTION_AUTO_APPLY[nodeType as keyof typeof SECTION_AUTO_APPLY]
      : undefined;
    if (!autoApplied) return undefined;
    return {
      autoApplied,
      wired: wiredKey ? (wiredKey.split(',') as DesignSection[]) : [],
    };
  }, [nodeType, wiredKey]);
  const effectiveSections = effectiveDesignSections(designSystemSections, contextual);
  const { all } = useBrandSkills(brandId);
  const selectedSkills = all.filter((skill) => ids.includes(skill.id));
  const label = groundingChipLabel(
    brandBookPieces,
    ids.length,
    brandDirectionPieces?.length ?? null,
  );
  const enforced = isBrandEnforced(brandBookPieces);
  const pieces = enforcedConcretePieces(brandBookPieces);

  const tooltip = (
    <div className="flex max-w-xs flex-col gap-2 text-xs">
      {inherited ? <p className="font-medium">Applied when enriching this prompt</p> : null}
      <div>
        <p className="font-medium">Brand book</p>
        {!enforced ? (
          <p className="opacity-70">Off</p>
        ) : isEntireBookEnforced(brandBookPieces) ? (
          <p className="opacity-70">Entire brand book</p>
        ) : (
          <ul className="opacity-70">
            {pieces.map((piece) => (
              <li key={piece}>· {BRAND_BOOK_PIECE_LABELS[piece]}</li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="font-medium">Creative direction</p>
        <p className="opacity-70">
          {brandDirectionPieces === undefined
            ? 'Everything this brand has authored'
            : brandDirectionPieces.length === 0
              ? 'Off'
              : `${brandDirectionPieces.length} selected`}
        </p>
      </div>
      <div>
        <p className="font-medium">Design system</p>
        <p className="opacity-70">
          {effectiveSections === null
            ? 'Everything this brand has approved'
            : effectiveSections.length === 0
              ? 'Off'
              : `${effectiveSections.join(', ')}${
                  designSystemSections === undefined ? ' — automatic for this node' : ''
                }`}
        </p>
        {contextual && contextual.wired.length > 0 ? (
          <p className="opacity-70">
            Wired: {contextual.wired.join(', ')} — from a Design Reference
          </p>
        ) : null}
      </div>
      <div>
        <p className="font-medium">Creative skills</p>
        {selectedSkills.length === 0 ? (
          <p className="opacity-70">None</p>
        ) : (
          <ul className="flex flex-col gap-0.5 opacity-70">
            {selectedSkills.map((skill) => (
              <li key={skill.id}>
                · <span className="font-medium">{skill.name}</span>
                {skill.description ? ` — ${skill.description}` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  const chipInner = (
    <span
      className={cn(
        'flex h-6 items-center gap-1 rounded-full border border-brand-primary/30 bg-brand-primary/10 px-2 text-[0.65rem] font-medium text-brand-primary',
        className,
      )}
    >
      <Gem className="h-3 w-3" />
      <span>{label}</span>
      {editable ? <ChevronDown className="h-3 w-3 opacity-70" /> : null}
    </span>
  );

  if (!editable) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger render={<span className="cursor-default">{chipInner}</span>} />
          <TooltipContent side="top">{tooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        openOnHover
        render={
          <button type="button" className="nodrag nopan cursor-pointer">
            {chipInner}
          </button>
        }
      />
      <DropdownMenuContent
        align="start"
        side="top"
        className="nodrag nopan nowheel z-[1100] w-64 max-h-[min(32rem,var(--available-height))]"
      >
        <GroundingMenuSections
          brandId={brandId}
          skillIds={ids}
          brandBookPieces={brandBookPieces}
          brandDirectionPieces={brandDirectionPieces}
          designSystemSections={designSystemSections}
          {...(contextual ? { contextual } : {})}
          onToggleSkill={(id) => onToggleSkill?.(id)}
          onTogglePiece={(kind) => onTogglePiece?.(kind)}
          {...(onToggleDirectionPiece ? { onToggleDirectionPiece } : {})}
          {...(onToggleDesignSection ? { onToggleDesignSection } : {})}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
