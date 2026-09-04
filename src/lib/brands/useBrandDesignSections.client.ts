'use client';

// The design-system sections a canvas node can switch on or off.
//
// Deliberately NOT `useDesignSystem` (components/design-system/useDesignSystem.ts). That
// hook follows the row over Realtime and carries a 180-second stale-parse watchdog because
// it renders an ingest in progress. A canvas can hold dozens of nodes, each with its own
// grounding chip, and none of them is watching an upload — they need one answer about a
// system that was ingested days ago. A plain read is the right shape here; the settings
// card keeps the live one.

import {
  type DesignSection,
  type DesignSystemSnapshot,
  effectiveRigorTier,
  isGateableSection,
} from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { fetchDesignSystem } from '@/lib/brands/designSystem.client';

export interface BrandDesignSectionRow {
  readonly section: DesignSection;
  readonly title: string;
  readonly ruleCount: number;
  /** True when this section's rules are hard enough to reject a candidate. */
  readonly gates: boolean;
}

export type BrandDesignSectionsState = {
  readonly sections: readonly BrandDesignSectionRow[];
  /**
   * The whole system, for the callers that need more than the row list.
   *
   * The grounding popover only wants "which sections can I toggle". A `designRef` node
   * needs the tokens, the fonts and the section's exemplars to build its specimen and its
   * token summary — and it is looking at the same system, on the same canvas, that every
   * chip beside it already read. Handing back what was already fetched costs nothing;
   * a second hook fetching the same row would cost a round trip per node.
   */
  readonly snapshot: DesignSystemSnapshot | null;
  /** Id of the active system — the storage prefix its exemplar paths are relative to. */
  readonly designSystemId: string | null;
  readonly isLoading: boolean;
  /** Set when the READ failed, which must not look like "this brand has no system". */
  readonly error: string | null;
};

/** Module-level so the empty answer keeps one identity: callers put `sections` straight into
 *  `useCallback` deps, and a fresh `[]` per render would rebuild those on every render. */
const NO_SECTIONS: readonly BrandDesignSectionRow[] = [];

export const brandDesignSectionsQueryKey = (brandId?: string) =>
  ['brand-design-sections', brandId] as const;

/**
 * Only the sections the brand left enabled.
 *
 * A disabled section cannot reach a generation whatever the node says, so offering it as a
 * togglable row would be a control that does nothing — the brand turns sections back on in
 * settings, not from a canvas node.
 */
export const designSectionRows = (
  snapshot: DesignSystemSnapshot,
): readonly BrandDesignSectionRow[] => {
  const strict = effectiveRigorTier(snapshot) === 'strict';
  return snapshot.sections
    .filter((section) => section.enabled)
    .map((section) => ({
      section: section.section,
      title: section.title,
      ruleCount: section.rules.length,
      gates: strict && isGateableSection(section.section),
    }));
};

export function useBrandDesignSections(brandId?: string): BrandDesignSectionsState {
  const query = useQuery({
    queryKey: brandDesignSectionsQueryKey(brandId),
    queryFn: () => fetchDesignSystem(brandId as string),
    enabled: Boolean(brandId),
    staleTime: 5 * 60_000,
  });

  const snapshot = query.data?.design_system ?? null;
  // Derived per snapshot, not per render: `sections` lands in caller `useCallback` deps.
  const sections = useMemo(
    () => (snapshot ? designSectionRows(snapshot) : NO_SECTIONS),
    [snapshot],
  );

  return {
    sections,
    snapshot,
    designSystemId: query.data?.design_system_id ?? null,
    isLoading: query.isLoading,
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : 'Could not read the design system.'
      : null,
  };
}
