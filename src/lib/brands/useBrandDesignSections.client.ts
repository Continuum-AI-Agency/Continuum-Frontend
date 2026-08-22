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
import React from 'react';

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
  readonly isLoading: boolean;
  /** Set when the READ failed, which must not look like "this brand has no system". */
  readonly error: string | null;
};

const EMPTY: BrandDesignSectionsState = { sections: [], isLoading: false, error: null };

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
  const [state, setState] = React.useState<BrandDesignSectionsState>(EMPTY);

  React.useEffect(() => {
    if (!brandId) {
      setState(EMPTY);
      return;
    }

    let cancelled = false;
    setState({ ...EMPTY, isLoading: true });

    fetchDesignSystem(brandId)
      .then((response) => {
        if (cancelled) return;
        setState({
          sections: response.design_system ? designSectionRows(response.design_system) : [],
          isLoading: false,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          ...EMPTY,
          error: error instanceof Error ? error.message : 'Could not read the design system.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [brandId]);

  return state;
}
