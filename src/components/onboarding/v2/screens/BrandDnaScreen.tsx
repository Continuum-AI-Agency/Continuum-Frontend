import { motion } from 'motion/react';
import { useOnboarding } from '@/components/onboarding/providers/OnboardingContext';
import { Skeleton } from '@/components/ui/skeleton';
import type { ReadinessAnalysis, ReadinessFinding } from '@/lib/onboarding/agentClient';
import { AudienceDetail } from '../dna/AudienceDetail';
import { BusinessFeatureChips } from '../dna/BusinessFeatureChips';
import { CardSurface } from '../dna/CardSurface';
import { EditableProse } from '../dna/EditableProse';
import { HorizontalRow } from '../dna/HorizontalRow';
import { IdentityPanel } from '../dna/IdentityPanel';
import { ProvenanceMark } from '../dna/RevealMarks';
import { RunProgressBanner } from '../dna/RunProgressBanner';
import { provenanceOf, readableProse } from '../dna/reveal';
import { StrategyGuidelinesRow } from '../dna/StrategyGuidelinesRow';
import { UnderstandingCard } from '../dna/UnderstandingCard';
import { VoiceDetail } from '../dna/VoiceDetail';
import { WebsiteSummaryCard } from '../dna/WebsiteSummaryCard';
import { DimensionChip } from '../readiness/DimensionChip';
import { FindingsStack } from '../readiness/FindingsStack';
import { ReadinessHero, type ReadinessHeroStatus } from '../readiness/ReadinessHero';
import { hostOf } from '../readiness/utils';
import type { AgentPreviewBuckets } from '../state/agentPreview';

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

export function BrandDnaScreen({ agentBuckets, readinessLoading, onRetry }: BrandDnaScreenProps) {
  const { state, updateState } = useOnboarding();
  const brand = state.brand;
  const websiteHost = hostOf(brand.website);

  const voice = agentBuckets?.voice;
  const audience = agentBuckets?.audience;
  const business = agentBuckets?.business;
  const heroStatement = agentBuckets?.website?.hero_statement;

  // Only parsed payloads and saved prose reach a card. A section without either shows
  // its skeleton while the run is live and says why it is empty once it is not — never
  // the model's streamed JSON, which is what an unparsed section used to fall back to.
  const voiceStatus = agentBuckets?.sectionStatus.voice;

  const businessStatus = agentBuckets?.sectionStatus.business;
  const savedOverview = readableProse(brand.overview);
  const businessEmpty = !business && !savedOverview;
  const overviewValue = savedOverview || business?.business_description || '';

  const audienceStatus = agentBuckets?.sectionStatus.audience;
  const savedAudience = readableProse(brand.targetAudience);
  const audienceEmpty = !audience && !savedAudience;
  const audienceValue = savedAudience || audience?.summary || '';

  const readiness: ReadinessAnalysis | null = brand.readiness ?? agentBuckets?.readiness ?? null;
  const loading = Boolean(readinessLoading) && !readiness;
  const settled = !loading && !readinessLoading;
  const readinessStatus: ReadinessHeroStatus =
    agentBuckets?.sectionStatus.readiness === 'error'
      ? 'error'
      : readinessLoading
        ? 'running'
        : 'settled';
  const successfulCount = countSuccessfulSections(agentBuckets);
  const thinResult = settled && successfulCount < 3;

  return (
    <motion.div
      variants={reveal}
      initial="hidden"
      animate="visible"
      className="mx-auto flex w-full min-h-0 max-w-[1700px] flex-1 flex-col px-4 py-8 md:px-8"
    >
      <motion.header variants={heroEnter} className="mb-6">
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
      </motion.header>

      <motion.div variants={card} className="mb-4">
        <ReadinessHero readiness={readiness} status={readinessStatus} />
      </motion.div>

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
            status={businessStatus}
            isEmpty={businessEmpty}
            settled={settled}
            onRetry={onRetry}
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
                    savedOverview ? 'saved profile' : 'brand analysis',
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
            status={voiceStatus}
            isEmpty={!voice}
            settled={settled}
            onRetry={onRetry}
            minBodyHeight={140}
            maxBodyHeight={320}
            skeleton={voiceSkeleton}
            className="h-full"
            chips={
              <>
                <ProvenanceMark
                  field="brand-voice"
                  provenance={provenanceOf(voice, 'brand analysis')}
                />
                <DimensionChip dim="positioning" readiness={readiness} loading={loading} />
              </>
            }
            findings={<FindingsStack findings={[findingFor(readiness, 'positioning')]} />}
          >
            {voice ? <VoiceDetail voice={voice} /> : null}
          </CardSurface>

          <CardSurface
            title="Target audience"
            badge="Audience"
            status={audienceStatus}
            isEmpty={audienceEmpty}
            settled={settled}
            onRetry={onRetry}
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
                    savedAudience ? 'saved profile' : 'brand analysis',
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
        <StrategyGuidelinesRow buckets={agentBuckets} settled={settled} onRetry={onRetry} />
      </motion.div>

      <motion.div variants={card} className="mb-4">
        <HorizontalRow label="Analysis" layout="grid">
          <WebsiteSummaryCard buckets={agentBuckets} settled={settled} onRetry={onRetry} />
          <UnderstandingCard buckets={agentBuckets} settled={settled} onRetry={onRetry} />
        </HorizontalRow>
      </motion.div>
    </motion.div>
  );
}
