import {
  BRAND_BIBLE_SECTIONS,
  DEEP_PENDING_LABEL,
  toBrandDna,
  type BrandBibleTier,
  type BrandReportResult,
} from "@continuum/contracts";

// Pure presentation model for the Brand Book viewer: groups the canonical
// section registry by tier and resolves each section's body (or pending state)
// from a BrandReportResult. Kept separate from the React component so the
// grouping/pending logic is unit-testable.

export type BrandBookSectionView = {
  id: string;
  title: string;
  tier: BrandBibleTier;
  pending: boolean;
  lines: string[];
};

export type BrandBookTierGroup = {
  tier: BrandBibleTier;
  label: string;
  sections: BrandBookSectionView[];
};

export type BrandBookView = {
  groups: BrandBookTierGroup[];
};

const TIER_ORDER: readonly BrandBibleTier[] = ["T0", "T1", "T2"];

const TIER_LABELS: Record<BrandBibleTier, string> = {
  T0: "Identity",
  T1: "Signals",
  T2: "Deep analysis",
};

function stripHeading(title: string): string {
  return title.replace(/^#+\s*/, "");
}

export function buildBrandBookView(result: BrandReportResult): BrandBookView {
  const dna = toBrandDna(result);
  const byTier = new Map<BrandBibleTier, BrandBookSectionView[]>(
    TIER_ORDER.map((tier) => [tier, []]),
  );

  for (const section of BRAND_BIBLE_SECTIONS) {
    const lines = section.render({ mode: "full", dna, result });
    if (lines.length === 0) continue;
    const pending = lines.length === 1 && lines[0] === DEEP_PENDING_LABEL;
    byTier.get(section.tier)?.push({
      id: section.id,
      title: stripHeading(section.title),
      tier: section.tier,
      pending,
      lines: pending ? [] : lines,
    });
  }

  const groups: BrandBookTierGroup[] = [];
  for (const tier of TIER_ORDER) {
    const sections = byTier.get(tier) ?? [];
    if (sections.length > 0) {
      groups.push({ tier, label: TIER_LABELS[tier], sections });
    }
  }
  return { groups };
}
