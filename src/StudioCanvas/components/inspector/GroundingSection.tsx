'use client';

// The grounding half of the inspector — the SAME editor the node's grounding chip
// opens, mounted inline rather than behind a popover on a popover.
//
// GroundingPopover is imported, never reimplemented: the three vocabularies it edits
// (brand-book pieces, creative-direction pieces, design-system sections) are tri-state
// and their toggle semantics live in `utils/brandEnforcement`. A second copy of those
// rules is how "no preference" quietly collapses to a one-element selection.

import type { BrandBookPieceKind, BrandDirectionPiece, DesignSection } from '@continuum/contracts';
import { useCallback } from 'react';
import { useBrandDesignSections } from '@/lib/brands/useBrandDesignSections.client';
import { useBrandDirectionPieces } from '@/lib/brands/useBrandDirectionPieces.client';
import { useStudioStore } from '../../stores/useStudioStore';
import type { StudioNode } from '../../types';
import {
  toggleBrandPiece,
  toggleDesignSection,
  toggleDirectionPiece,
  toggleSkillId,
} from '../../utils/brandEnforcement';
import { GroundingPopover } from '../GroundingPopover';

type Grounding = {
  skillIds?: string[];
  brandBookPieces?: BrandBookPieceKind[];
  brandDirectionPieces?: BrandDirectionPiece[];
  designSystemSections?: DesignSection[];
};

export function GroundingSection({ node, brandId }: { node: StudioNode; brandId?: string }) {
  const updateNode = useStudioStore((state) => state.updateNode);
  const triggerSave = useStudioStore((state) => state.triggerSave);
  const { pieces: authoredDirection } = useBrandDirectionPieces(brandId);
  const { sections: designSections } = useBrandDesignSections(brandId);
  const data = node.data as Grounding;
  const nodeId = node.id;

  // The toggles write ARRAYS, not enum config, so they go through updateNode directly
  // rather than useNodeConfigPatch — coerceNodeConfig has nothing to say about them.
  const patchGrounding = useCallback(
    (next: (current: Grounding) => Partial<Grounding>) => {
      updateNode(nodeId, (current) => ({
        ...current,
        data: { ...current.data, ...next(current.data as Grounding) } as StudioNode['data'],
      }));
      triggerSave();
    },
    [nodeId, triggerSave, updateNode],
  );

  return (
    <GroundingPopover
      brandId={brandId}
      skillIds={data.skillIds ?? []}
      brandBookPieces={data.brandBookPieces}
      brandDirectionPieces={data.brandDirectionPieces}
      designSystemSections={data.designSystemSections}
      onToggleSkill={(skillId) =>
        patchGrounding((current) => ({ skillIds: toggleSkillId(current.skillIds, skillId) }))
      }
      onTogglePiece={(kind) =>
        patchGrounding((current) => ({
          brandBookPieces: toggleBrandPiece(current.brandBookPieces, kind),
        }))
      }
      onToggleDirectionPiece={(piece) =>
        patchGrounding((current) => ({
          brandDirectionPieces: toggleDirectionPiece(
            current.brandDirectionPieces,
            piece,
            authoredDirection.map((entry) => entry.piece),
          ),
        }))
      }
      onToggleDesignSection={(section) =>
        patchGrounding((current) => ({
          designSystemSections: toggleDesignSection(
            current.designSystemSections,
            section,
            designSections.map((entry) => entry.section),
          ),
        }))
      }
    />
  );
}
