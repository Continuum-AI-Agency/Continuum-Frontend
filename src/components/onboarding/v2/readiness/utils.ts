import type { useTranslations } from 'next-intl';

type ReadinessTranslator = ReturnType<typeof useTranslations<'onboarding'>>;

import type { ReadinessEvidenceSource } from '@continuum/contracts';
import type { ReadinessAnalysis, ReadinessDimension } from '@/lib/onboarding/agentClient';

export const DIMENSION_LABELS: Record<ReadinessDimension, string> = {
  value_proposition: 'Value prop',
  icp_clarity: 'ICP',
  customer_pains: 'Customer pains',
  success_metrics: 'Outcomes',
  positioning: 'Positioning',
  messaging_coherence: 'Messaging',
  brand_identity: 'Identity',
};

const DIMENSION_KEYS = {
  value_proposition: 'dimensionValue',
  icp_clarity: 'dimensionIcp',
  customer_pains: 'dimensionPains',
  success_metrics: 'dimensionOutcomes',
  positioning: 'dimensionPositioning',
  messaging_coherence: 'dimensionMessaging',
  brand_identity: 'dimensionIdentity',
} as const;
export function getDimensionLabels(
  translate: ReadinessTranslator,
): Record<ReadinessDimension, string> {
  return Object.fromEntries(
    Object.entries(DIMENSION_KEYS).map(([key, message]) => [key, translate(message)]),
  ) as Record<ReadinessDimension, string>;
}

export function scoreFor(
  readiness: ReadinessAnalysis | null,
  dim: ReadinessDimension,
): number | null {
  return readiness?.dimensions?.[dim]?.score ?? null;
}

// Display order — brand identity/positioning surface first, then value/ICP/business signals.
// Diverges intentionally from the backend READINESS_DIMENSIONS canonical order.
// _exhaustive below forces tsc to fail if the union of ReadinessDimension changes
// without this array being updated.
export const DIMENSION_DISPLAY_ORDER = [
  'brand_identity',
  'positioning',
  'messaging_coherence',
  'value_proposition',
  'icp_clarity',
  'customer_pains',
  'success_metrics',
] as const satisfies readonly ReadinessDimension[];
type _ExhaustiveDimensions = Exclude<ReadinessDimension, (typeof DIMENSION_DISPLAY_ORDER)[number]>;
const _exhaustive: [_ExhaustiveDimensions] extends [never] ? true : false = true;
void _exhaustive;

type DimensionResult = ReadinessAnalysis['dimensions'][ReadinessDimension];

/**
 * How much the drawn score can be trusted. `coverage` is the share of criterion
 * weight the scorer could answer; a row scored before criteria has none and is
 * drawn as it always was.
 */
export type AxisConfidence = 'measured' | 'thin' | 'unknown';
const THIN_COVERAGE = 0.5;

export function axisConfidence(dim: DimensionResult): AxisConfidence {
  if (dim.coverage === undefined) return 'measured';
  if (dim.coverage === 0) return 'unknown';
  return dim.coverage < THIN_COVERAGE ? 'thin' : 'measured';
}

/** Mean answerable share across dimensions; null for a legacy row with no coverage. */
export function meanCoverage(readiness: ReadinessAnalysis): number | null {
  const values = DIMENSION_DISPLAY_ORDER.map((d) => readiness.dimensions[d].coverage).filter(
    (c): c is number => c !== undefined,
  );
  return values.length > 0 ? values.reduce((sum, c) => sum + c, 0) / values.length : null;
}

/** Scored by the criteria scorer, so each score carries the criteria that earned it. */
export function isCriteriaScored(readiness: ReadinessAnalysis): boolean {
  return (
    Boolean(readiness.scorer_version) ||
    DIMENSION_DISPLAY_ORDER.some((d) => (readiness.dimensions[d].criteria?.length ?? 0) > 0)
  );
}

const SOURCE_LABELS: Record<ReadinessEvidenceSource, string> = {
  homepage: 'Homepage',
  about: 'About',
  pricing: 'Pricing',
  customers: 'Customers',
  instagram_bio: 'Instagram',
  instagram_post: 'Instagram',
  search: 'Web search',
  brand_md: 'Brand book',
};

export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function sourceChipLabel(
  source: ReadinessEvidenceSource,
  url: string | null | undefined,
  translate?: ReadinessTranslator,
): string {
  const host = source === 'search' ? hostOf(url) : null;
  const keys = {
    homepage: 'sourceHomepage',
    about: 'sourceAbout',
    pricing: 'sourcePricing',
    customers: 'sourceCustomers',
    instagram_bio: 'sourceInstagram',
    instagram_post: 'sourceInstagram',
    search: 'sourceSearch',
    brand_md: 'sourceBrandBook',
  } as const;
  return host ? `web: ${host}` : translate ? translate(keys[source]) : SOURCE_LABELS[source];
}

const EVIDENCE_SOURCE_NAMES = {
  homepage: 'your homepage',
  subpages: 'your site pages',
  instagram: 'Instagram',
  search: 'web search',
} as const;

/** The evidence sources that could not be read, in words, for the partial banner. */
export function failedEvidenceSources(
  readiness: ReadinessAnalysis,
  translate?: ReadinessTranslator,
): string[] {
  const sources = readiness.evidence_sources;
  if (!sources) return [];
  return (Object.keys(EVIDENCE_SOURCE_NAMES) as (keyof typeof EVIDENCE_SOURCE_NAMES)[])
    .filter((key) => sources[key] === 'failed')
    .map((key) =>
      translate
        ? translate(
            (
              {
                homepage: 'evidenceHomepage',
                subpages: 'evidenceSubpages',
                instagram: 'evidenceInstagram',
                search: 'evidenceSearch',
              } as const
            )[key],
          )
        : EVIDENCE_SOURCE_NAMES[key],
    );
}

export function listInWords(
  items: readonly string[],
  conjunction: 'and' | 'or',
  locale = 'en',
): string {
  if (items.length <= 1) return items[0] ?? '';
  return new Intl.ListFormat(locale, {
    style: 'long',
    type: conjunction === 'or' ? 'disjunction' : 'conjunction',
  }).format(items);
}
