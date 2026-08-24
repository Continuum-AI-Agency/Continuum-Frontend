'use client';

// The single grounding indicator on a canvas node. Replaces the old brand badge +
// ring + hidden-skills-in-a-submenu with ONE compact chip that says, at a glance,
// what will be forced into the generation ("Brand · Skills 2"). Hover reveals the
// full list of brand-book pieces and skills WITH their descriptions; on a
// generation node, clicking opens the editor popover. On the enrich (string) node
// it is read-only — it surfaces the grounding inherited from the downstream
// generator so "tele-fill" visibly shows it is brand-guarded + skill-aware.

import type { BrandBookPieceKind, BrandDirectionPiece, DesignSection } from '@continuum/contracts';
import { SECTION_AUTO_APPLY, suppressedDesignSections } from '@continuum/contracts';
import { ChevronDown, Gem } from 'lucide-react';
import React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
  GroundingPopover,
} from './GroundingPopover';

type Props = {
  brandId?: string;
  skillIds?: string[];
  brandBookPieces: BrandBookPieceKind[] | undefined;
  // Editable → clicking opens the grounding editor (generation nodes).
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
    <div className="max-w-xs space-y-2 text-xs">
      {inherited ? (
        <p className="font-medium text-foreground">Applied when enriching this prompt</p>
      ) : null}
      <div>
        <p className="font-medium text-foreground">Brand book</p>
        {!enforced ? (
          <p className="text-muted-foreground">Off</p>
        ) : isEntireBookEnforced(brandBookPieces) ? (
          <p className="text-muted-foreground">Entire brand book</p>
        ) : (
          <ul className="text-muted-foreground">
            {pieces.map((piece) => (
              <li key={piece}>· {BRAND_BOOK_PIECE_LABELS[piece]}</li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="font-medium text-foreground">Creative direction</p>
        <p className="text-muted-foreground">
          {brandDirectionPieces === undefined
            ? 'Everything this brand has authored'
            : brandDirectionPieces.length === 0
              ? 'Off'
              : `${brandDirectionPieces.length} selected`}
        </p>
      </div>
      <div>
        <p className="font-medium text-foreground">Design system</p>
        <p className="text-muted-foreground">
          {effectiveSections === null
            ? 'Everything this brand has approved'
            : effectiveSections.length === 0
              ? 'Off'
              : `${effectiveSections.join(', ')}${
                  designSystemSections === undefined ? ' — automatic for this node' : ''
                }`}
        </p>
        {contextual && contextual.wired.length > 0 ? (
          <p className="text-muted-foreground">
            Wired: {contextual.wired.join(', ')} — from a Design Reference
          </p>
        ) : null}
      </div>
      <div>
        <p className="font-medium text-foreground">Creative skills</p>
        {selectedSkills.length === 0 ? (
          <p className="text-muted-foreground">None</p>
        ) : (
          <ul className="space-y-0.5 text-muted-foreground">
            {selectedSkills.map((skill) => (
              <li key={skill.id}>
                · <span className="text-foreground">{skill.name}</span>
                {skill.description ? ` — ${skill.description}` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
      {editable ? <p className="text-muted-foreground/80">Click to edit</p> : null}
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
    <TooltipProvider>
      <Popover>
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                render={
                  <button type="button" className="nodrag nopan cursor-pointer">
                    {chipInner}
                  </button>
                }
              />
            }
          />
          <TooltipContent side="top">{tooltip}</TooltipContent>
        </Tooltip>
        <PopoverContent
          align="start"
          side="top"
          collisionPadding={16}
          className="nodrag nopan z-[1100] w-96 bg-popover p-0"
        >
          <GroundingPopover
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
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
