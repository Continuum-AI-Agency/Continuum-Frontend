'use client';

// Per-node brand-book picker rendered as a context-menu submenu on the image and
// video generation blocks. The user tags which brand-book pieces are forced into
// the generation; the Backend renders the tagged pieces from brand_tokens into an
// authoritative block (App/ai-studio/services/brand-enforcement.ts). Pieces the
// brand has not built yet are disabled with a nudge to finish the brand book.

import type { BrandBookPieceKind } from '@continuum/contracts';
import React from 'react';
import {
  ContextMenuCheckboxItem,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useBrandBook } from '@/lib/brands/useBrandBook.client';
import {
  BRAND_BOOK_PIECE_OPTIONS,
  brandBookAvailability,
  enforcedConcretePieces,
  isEntireBookEnforced,
  isPieceEnforced,
} from '../utils/brandEnforcement';

export function BrandBookMenu({
  brandId,
  pieces,
  onToggle,
}: {
  brandId?: string;
  pieces: BrandBookPieceKind[] | undefined;
  onToggle: (kind: BrandBookPieceKind) => void;
}) {
  const { brandTokens, isLoading } = useBrandBook(brandId);
  const availability = React.useMemo(() => brandBookAvailability(brandTokens), [brandTokens]);
  const enforcedCount = enforcedConcretePieces(pieces).length;

  const select = (kind: BrandBookPieceKind) => (event: Event) => {
    event.preventDefault();
    onToggle(kind);
  };

  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        Brand Book{enforcedCount > 0 ? ` (${enforcedCount})` : ''}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="max-h-80 w-60 overflow-y-auto">
        <ContextMenuCheckboxItem
          checked={isEntireBookEnforced(pieces)}
          disabled={!availability.full}
          onSelect={select('full')}
        >
          Enforce entire brand book
        </ContextMenuCheckboxItem>
        <ContextMenuSeparator />
        {isLoading ? (
          <ContextMenuItem disabled>Loading brand book…</ContextMenuItem>
        ) : !availability.full ? (
          <ContextMenuItem disabled>No brand book yet — finish it in Settings</ContextMenuItem>
        ) : (
          <TooltipProvider delayDuration={250}>
            {BRAND_BOOK_PIECE_OPTIONS.map(({ kind, label, description }) => (
              <ContextMenuCheckboxItem
                key={kind}
                checked={isPieceEnforced(pieces, kind)}
                disabled={!availability[kind]}
                onSelect={select(kind)}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="min-w-0 flex-1 truncate">
                      {label}
                      {!availability[kind] ? ' · not in brand book' : ''}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs">
                    {description}
                  </TooltipContent>
                </Tooltip>
              </ContextMenuCheckboxItem>
            ))}
          </TooltipProvider>
        )}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
