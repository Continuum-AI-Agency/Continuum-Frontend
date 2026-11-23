import type { useTranslations } from 'next-intl';

type GenerationTranslator = ReturnType<typeof useTranslations<'settings'>>;

import type {
  AgentRequestPayload,
  CompleteStatusValue,
  OnboardingPreviewEvent,
  PreviewSection,
} from '@/lib/onboarding/agentClient';
import type { ScrapeResult } from '@/lib/onboarding/scrape';

// The Brand Book empty state can kick off a first-time brand-report generation
// (the same durable `preview` run onboarding uses). These pure helpers drive the
// generation panel's progress line and decide whether we have enough of a brand
// profile to run at all — kept out of the client component so they're unit-tested
// without a DOM.

export type BrandBookGenerationPayload = AgentRequestPayload;

const SECTION_LABELS: Record<PreviewSection, string> = {
  brand_profile: 'brand profile',
  voice: 'brand voice',
  audience: 'audience',
  website: 'website',
  business: 'business model',
  strategy: 'strategy',
  guidelines: 'guidelines',
  readiness: 'readiness',
  first_impression: 'first impression',
};

export function brandBookSectionLabel(
  section: PreviewSection,
  translate?: GenerationTranslator,
): string {
  const keys = {
    brand_profile: 'generationBrandProfile',
    voice: 'generationVoice',
    audience: 'generationAudience',
    website: 'generationWebsite',
    business: 'generationBusiness',
    strategy: 'generationStrategy',
    guidelines: 'generationGuidelines',
    readiness: 'generationReadiness',
    first_impression: 'generationFirstImpression',
  } as const;
  return translate ? translate(keys[section]) : (SECTION_LABELS[section] ?? section);
}

// Maps a preview stream event to a short, human progress line for the panel.
// Returns null for events that don't warrant a visible status change (deltas,
// pings, per-section payloads, errors surfaced via toast instead).
export function brandBookGenerationStatus(
  event: OnboardingPreviewEvent,
  translate?: GenerationTranslator,
): string | null {
  switch (event.type) {
    case 'run':
      return translate ? translate('generationStarting') : 'Starting analysis…';
    case 'status':
      return event.status === 'running'
        ? translate
          ? translate('generationAnalyzing', {
              section: brandBookSectionLabel(event.section, translate),
            })
          : `Analyzing ${brandBookSectionLabel(event.section)}…`
        : null;
    case 'complete':
      return event.status === 'error'
        ? null
        : translate
          ? translate('generationFinalizing')
          : 'Finalizing your Brand Book…';
    default:
      return null;
  }
}

// A run needs an existing brand_profile id plus a user and brand name for the
// run context — otherwise the preview endpoint 400s. Narrows null away on success.
export function canGenerateBrandBook(
  payload: BrandBookGenerationPayload | null | undefined,
): payload is BrandBookGenerationPayload {
  if (!payload) return false;
  const hasBrand =
    typeof payload.brandProfile?.id === 'string' &&
    payload.brandProfile.id.length > 0 &&
    typeof payload.brandProfile?.brand_name === 'string' &&
    payload.brandProfile.brand_name.length > 0;
  const hasContext =
    typeof payload.runContext?.user_id === 'string' &&
    payload.runContext.user_id.length > 0 &&
    typeof payload.runContext?.brand_name === 'string' &&
    payload.runContext.brand_name.length > 0;
  return hasBrand && hasContext;
}

export type BrandDnaReanalysisInputs = {
  websiteUrl: string;
  scrape: ScrapeResult | null;
  // The user's own account of the business and their uploaded brand documents: evidence, not
  // inference, so the new run is grounded on them instead of on what the old site suggested.
  description?: string;
  // Who the user says their customers are; the analysis builds the audience from it.
  audience?: string;
  documentIds?: string[];
  // A public Instagram profile or Facebook Page, already read, for the run to ground on.
  social?: Pick<AgentRequestPayload, 'instagram_profile' | 'facebook_profile'>;
  // The voice tags the user picked (onboarding's tone picker); none is a valid choice.
  voiceTags?: string[];
  discardEdit: boolean;
};

// A re-analysis starts from the user's own evidence: the website and, when given, their
// description, documents, social page and voice tags. The stored description, voice, audience
// and intake are what the earlier run inferred (from the wrong site, when that is why the user
// is re-running), and passing them along would steer the new run straight back to it.
export function brandBookReanalysisPayload(
  base: BrandBookGenerationPayload,
  inputs: BrandDnaReanalysisInputs,
): BrandBookGenerationPayload {
  const description = inputs.description?.trim() || null;
  const audience = inputs.audience?.trim() || null;
  const documentIds = inputs.documentIds ?? [];
  const facebook = inputs.social?.facebook_profile ?? null;
  const instagram = inputs.social?.instagram_profile ?? null;
  // A Facebook Page reaches the run only as intake evidence, so it opens an intake too.
  const ownEvidence = description !== null || documentIds.length > 0 || facebook !== null;
  return {
    brandProfile: {
      id: base.brandProfile.id,
      brand_name: base.brandProfile.brand_name,
      website_url: inputs.websiteUrl,
      ...(audience ? { target_audience: { summary: audience } } : {}),
    },
    runContext: {
      ...base.runContext,
      platform_urls: [inputs.websiteUrl],
      brand_voice_tags: inputs.voiceTags ?? [],
      // Account ids only re-link accounts the brand already has; the analysis never reads them.
      integration_account_ids: [],
      ...(inputs.discardEdit ? { discard_brand_md_edit: true } : {}),
    },
    scrape: inputs.scrape,
    ...(instagram ? { instagram_profile: instagram } : {}),
    ...(facebook ? { facebook_profile: facebook } : {}),
    ...(ownEvidence
      ? {
          intake: {
            kind: 'website' as const,
            brand_name: base.brandProfile.brand_name,
            url: inputs.websiteUrl,
            description,
          },
          document_ids: documentIds,
        }
      : {}),
  };
}

// Settings renders the materialized brand book, which a commit only queues a refresh for. After a
// run, wait until the book has been rebuilt since the run started, so the page shows the new DNA
// instead of the one it replaces. False when it did not happen in time.
export async function waitForBrandBookRefresh(params: {
  brandId: string;
  refreshedBefore: string | null;
  fetchBook: (brandId: string) => Promise<{ refreshed_at: string | null } | null>;
  timeoutMs?: number;
  intervalMs?: number;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
}): Promise<boolean> {
  const sleep = params.sleep ?? ((ms: number) => new Promise((done) => setTimeout(done, ms)));
  const intervalMs = params.intervalMs ?? 2_000;
  const attempts = Math.ceil((params.timeoutMs ?? 30_000) / intervalMs);
  for (let attempt = 0; attempt < attempts && !params.signal?.aborted; attempt += 1) {
    const refreshedAt = (await params.fetchBook(params.brandId))?.refreshed_at ?? null;
    if (refreshedAt && refreshedAt !== params.refreshedBefore) return true;
    await sleep(intervalMs);
  }
  return false;
}

/** The run ended without a stored Brand DNA; whatever the brand had before still stands. */
export class BrandBookRunIncompleteError extends Error {
  constructor(readonly reason: string | null) {
    super(reason ?? 'The analysis did not finish.');
  }
}

type PreviewRunner = (options: {
  payload: BrandBookGenerationPayload;
  signal?: AbortSignal;
  onEvent?: (event: OnboardingPreviewEvent) => void;
}) => Promise<{ runId: string | null }>;

type PreviewApprover = (options: {
  payload: BrandBookGenerationPayload;
  signal?: AbortSignal;
}) => Promise<unknown>;

// Resolves only once the run's Brand DNA is stored. The stream reports a failed or partial run
// as events, not as a thrown error, and the Backend commits a run without intake only when it
// completes; one carrying the user's description or documents is a draft until approved, as in
// onboarding. Callers inject the agent client so this stays a plain, unit-tested function.
export async function runBrandBookGeneration({
  payload,
  signal,
  onEvent,
  runPreview,
  approve,
}: {
  payload: BrandBookGenerationPayload;
  signal?: AbortSignal;
  onEvent?: (event: OnboardingPreviewEvent) => void;
  runPreview: PreviewRunner;
  approve: PreviewApprover;
}): Promise<void> {
  let failure = null as string | null;
  let finished = null as CompleteStatusValue | null;
  const { runId } = await runPreview({
    payload,
    signal,
    onEvent: (event) => {
      if (event.type === 'error') failure = event.message;
      if (event.type === 'complete') finished = event.status;
      onEvent?.(event);
    },
  });
  const isDraft = Boolean(payload.intake);
  const stored = finished === 'ok' || (isDraft && finished === 'partial');
  if (failure !== null || !stored) throw new BrandBookRunIncompleteError(failure);
  if (isDraft) {
    if (!runId) throw new BrandBookRunIncompleteError(null);
    await approve({ payload: { ...payload, preview_run_id: runId }, signal });
  }
}
