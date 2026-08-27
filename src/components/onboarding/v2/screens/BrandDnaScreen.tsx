import { motion } from 'motion/react';
import { useOnboarding } from '@/components/onboarding/providers/OnboardingContext';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  PreviewSection,
  ReadinessAnalysis,
  ReadinessFinding,
} from '@/lib/onboarding/agentClient';
import { AudienceDetail } from '../dna/AudienceDetail';
import { BusinessFeatureChips } from '../dna/BusinessFeatureChips';
import { CardSurface } from '../dna/CardSurface';
import { EditableProse } from '../dna/EditableProse';
import { HorizontalRow } from '../dna/HorizontalRow';
import { IdentityPanel } from '../dna/IdentityPanel';
import { ProvenanceMark } from '../dna/RevealMarks';
import { provenanceOf } from '../dna/reveal';
import { ReadinessCard } from '../dna/ReadinessCard';
import { RunProgressBanner } from '../dna/RunProgressBanner';
import { StrategyGuidelinesRow } from '../dna/StrategyGuidelinesRow';
import { UnderstandingCard } from '../dna/UnderstandingCard';
import { VoiceDetail } from '../dna/VoiceDetail';
import { WebsiteSummaryCard } from '../dna/WebsiteSummaryCard';
import { DimensionChip } from '../readiness/DimensionChip';
import { FindingsStack } from '../readiness/FindingsStack';
import { OverallReadinessChip } from '../readiness/OverallReadinessChip';
import type { AgentPreviewBuckets, SectionStatus } from '../state/agentPreview';

type BrandDnaScreenProps = {
  agentBuckets: AgentPreviewBuckets | null;
  readinessLoading?: boolean;
  onRetry?: () => void;
};

function placeholderFor(
  status:
    | AgentPreviewBuckets['sectionStatus'][keyof AgentPreviewBuckets['sectionStatus']]
    | undefined,
  defaultText: string,
): string {
  if (status === 'skipped' || status === 'error') {
    return "We couldn't draft this — write your own";
  }
  return defaultText;
}

function countSuccessfulSections(buckets: AgentPreviewBuckets | null): number {
  if (!buckets) return 0;
  return Object.values(buckets.sectionStatus).filter((s) => s === 'done').length;
}

const reveal = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

const card = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] as const } },
};

const heroEnter = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] as const },
  },
};

const isTerminal = (status: SectionStatus | undefined): boolean =>
  status === 'done' || status === 'error' || status === 'skipped';

const proseSkeleton = (
  <div className="space-y-2" role="status" aria-label="Drafting">
    <Skeleton className="h-3 w-3/4" />
    <Skeleton className="h-3 w-full" />
    <Skeleton className="h-3 w-5/6" />
    <Skeleton className="h-3 w-2/3" />
  </div>
);

const voiceSkeleton = (
  <div className="space-y-2.5" role="status" aria-label="Drafting">
    <Skeleton className="h-3 w-1/3" />
    <Skeleton className="h-6 w-full rounded-md" />
    <Skeleton className="h-3 w-1/4" />
    <Skeleton className="h-6 w-5/6 rounded-md" />
  </div>
);

function findingFor(
  readiness: ReadinessAnalysis | null,
  dim: ReadinessFinding['dimension'],
): ReadinessFinding | null {
  return readiness?.findings?.find((f) => f.dimension === dim) ?? null;
}

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function isTerminallyEmpty<T>(
  buckets: AgentPreviewBuckets | null,
  section: PreviewSection,
  data: T | null | undefined,
): boolean {
  const status = buckets?.sectionStatus[section];
  return (status === 'skipped' || status === 'error') && data == null;
}

export function BrandDnaScreen({ agentBuckets, readinessLoading, onRetry }: BrandDnaScreenProps) {
  const { state, updateState } = useOnboarding();
  const brand = state.brand;
  const websiteHost = brand.website ? safeHostname(brand.website) : null;

  const voice = agentBuckets?.voice;
  const audience = agentBuckets?.audience;
  const business = agentBuckets?.business;
  const heroStatement = agentBuckets?.website?.hero_statement;

  // Skeleton-until-ready: while a section is still streaming we show its skeleton
  // (never raw running text). `isEmpty` only counts the streamed draft once the
  // section is terminal, so a parse failure degrades to the editable draft
  // ("write your own") instead of either janking mid-stream or dropping info.
  const voiceStatus = agentBuckets?.sectionStatus.voice;
  const voiceDraft = agentBuckets?.voiceStream ?? '';
  const voiceEmpty = !voice && !(isTerminal(voiceStatus) && voiceDraft.trim().length > 0);

  const businessStatus = agentBuckets?.sectionStatus.business;
  const businessDraft = agentBuckets?.businessStream ?? '';
  const businessEmpty =
    !business &&
    !brand.overview &&
    !(isTerminal(businessStatus) && businessDraft.trim().length > 0);
  const overviewValue =
    brand.overview ||
    business?.business_description ||
    (isTerminal(businessStatus) ? businessDraft : '');

  const audienceStatus = agentBuckets?.sectionStatus.audience;
  const audienceDraft = agentBuckets?.audienceStream ?? '';
  const audienceEmpty =
    !audience &&
    !brand.targetAudience &&
    !(isTerminal(audienceStatus) && audienceDraft.trim().length > 0);
  const audienceValue =
    brand.targetAudience || audience?.summary || (isTerminal(audienceStatus) ? audienceDraft : '');

  const readiness: ReadinessAnalysis | null = brand.readiness ?? agentBuckets?.readiness ?? null;
  const loading = Boolean(readinessLoading) && !readiness;
  const settled = !loading && !readinessLoading;
  const successfulCount = countSuccessfulSections(agentBuckets);
  const thinResult = settled && successfulCount < 3;

  // A section still `idle` once the run has SETTLED is not loading — it is finished with
  // nothing. A resumed snapshot carries no per-section status at all, so without this an
  // empty voice breathes a skeleton for ever and never admits it found nothing, which is
  // the same lie as a placeholder.
  const resolvedStatus = (status: SectionStatus | undefined): SectionStatus | undefined =>
    settled && (status === undefined || status === 'idle') ? 'skipped' : status;

  return (
    <motion.div
      variants={reveal}
      initial="hidden"
      animate="visible"
      className="mx-auto flex w-full min-h-0 max-w-[1700px] flex-1 flex-col px-4 py-8 md:px-8"
    >
      <motion.header
        variants={heroEnter}
        className="mb-6 grid grid-cols-1 items-end gap-4 md:grid-cols-[1fr_auto]"
      >
        <div className="space-y-2 text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Brand DNA
          </p>
          <h2 className="text-balance text-5xl font-bold leading-[0.95] tracking-tighter text-foreground md:text-7xl">
            {thinResult ? (
              <>
                <span className="text-muted-foreground">Let&apos;s get to know </span>
                {brand.name || 'your brand'}
              </>
            ) : (
              brand.name || 'Your brand'
            )}
          </h2>
          <RunProgressBanner
            buckets={agentBuckets}
            running={readinessLoading ?? false}
            onRetry={onRetry}
          />
        </div>
        <div className="md:justify-self-end">
          <OverallReadinessChip readiness={readiness} loading={loading} />
        </div>
      </motion.header>

      <motion.div variants={card} className="mb-4">
        <IdentityPanel
          name={brand.name}
          host={websiteHost}
          heroStatement={heroStatement ?? brand.tagline ?? null}
          logoPath={brand.logoPath}
          colors={brand.colors}
          typography={brand.typography}
          toneFinding={findingFor(readiness, 'messaging_coherence')}
          brandIdentityChip={
            <DimensionChip dim="brand_identity" readiness={readiness} loading={loading} />
          }
          messagingChip={
            <DimensionChip dim="messaging_coherence" readiness={readiness} loading={loading} />
          }
          agentBuckets={agentBuckets}
          onRename={(next) => updateState({ brand: { name: next } })}
        />
      </motion.div>

      <motion.div variants={card} className="mb-4">
        <HorizontalRow label="Narrative" layout="grid">
          <CardSurface
            title="Business overview"
            badge="Core"
            status={resolvedStatus(businessStatus)}
            isEmpty={businessEmpty}
            minBodyHeight={140}
            maxBodyHeight={320}
            skeleton={proseSkeleton}
            className="h-full"
            chips={
              <>
                <ProvenanceMark
                  field="business-overview"
                  provenance={provenanceOf(
                    overviewValue,
                    brand.overview ? 'saved profile' : 'brand analysis',
                  )}
                />
                <DimensionChip dim="value_proposition" readiness={readiness} loading={loading} />
                <DimensionChip dim="success_metrics" readiness={readiness} loading={loading} />
              </>
            }
            findings={
              <FindingsStack
                findings={[
                  findingFor(readiness, 'value_proposition'),
                  findingFor(readiness, 'success_metrics'),
                ]}
              />
            }
          >
            <EditableProse
              value={overviewValue}
              placeholder={placeholderFor(businessStatus, 'Write your own')}
              onCommit={(next) => updateState({ brand: { overview: next } })}
            />
            {business ? <BusinessFeatureChips business={business} /> : null}
          </CardSurface>

          <CardSurface
            title="Brand voice & tone"
            badge="Voice"
            status={resolvedStatus(voiceStatus)}
            isEmpty={voiceEmpty}
            minBodyHeight={140}
            maxBodyHeight={320}
            skeleton={voiceSkeleton}
            className="h-full"
            chips={
              <>
                <ProvenanceMark
                  field="brand-voice"
                  provenance={provenanceOf(voice ?? voiceDraft, 'brand analysis')}
                />
                <DimensionChip dim="positioning" readiness={readiness} loading={loading} />
              </>
            }
            findings={<FindingsStack findings={[findingFor(readiness, 'positioning')]} />}
          >
            {voice ? (
              <VoiceDetail voice={voice} />
            ) : (
              <p className="m-0 whitespace-pre-wrap text-sm text-muted-foreground">{voiceDraft}</p>
            )}
          </CardSurface>

          <CardSurface
            title="Target audience"
            badge="Audience"
            status={resolvedStatus(audienceStatus)}
            isEmpty={audienceEmpty}
            minBodyHeight={140}
            maxBodyHeight={320}
            skeleton={proseSkeleton}
            className="h-full"
            chips={
              <>
                <ProvenanceMark
                  field="target-audience"
                  provenance={provenanceOf(
                    audienceValue,
                    brand.targetAudience ? 'saved profile' : 'brand analysis',
                  )}
                />
                <DimensionChip dim="icp_clarity" readiness={readiness} loading={loading} />
                <DimensionChip dim="customer_pains" readiness={readiness} loading={loading} />
              </>
            }
            findings={
              <FindingsStack
                findings={[
                  findingFor(readiness, 'icp_clarity'),
                  findingFor(readiness, 'customer_pains'),
                ]}
              />
            }
          >
            <EditableProse
              value={audienceValue}
              placeholder={placeholderFor(audienceStatus, 'Write your own')}
              onCommit={(next) => updateState({ brand: { targetAudience: next } })}
            />
            {audience ? <AudienceDetail audience={audience} /> : null}
          </CardSurface>
        </HorizontalRow>
      </motion.div>

      <motion.div variants={card} className="mb-4">
        <StrategyGuidelinesRow buckets={agentBuckets} settled={settled} />
      </motion.div>

      <motion.div variants={card} className="mb-4">
        <HorizontalRow label="Analysis" layout="grid">
          {isTerminallyEmpty(agentBuckets, 'website', agentBuckets?.website) ? null : (
            <WebsiteSummaryCard buckets={agentBuckets} />
          )}
          <UnderstandingCard buckets={agentBuckets} />
          {isTerminallyEmpty(agentBuckets, 'readiness', readiness) ? null : (
            <ReadinessCard buckets={agentBuckets} readiness={readiness} />
          )}
        </HorizontalRow>
      </motion.div>
    </motion.div>
  );
}
