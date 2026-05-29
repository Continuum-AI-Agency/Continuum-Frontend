import { motion } from "motion/react";
import { useOnboarding } from "@/components/onboarding/providers/OnboardingContext";
import { IdentityPanel } from "../dna/IdentityPanel";
import { DnaSectionCard } from "../dna/DnaSectionCard";
import { VoiceDetail } from "../dna/VoiceDetail";
import { AudienceDetail } from "../dna/AudienceDetail";
import { BusinessFeatureChips } from "../dna/BusinessFeatureChips";
import { StreamFallback } from "../dna/StreamFallback";
import { EditableProse } from "../dna/EditableProse";
import { HorizontalRow } from "../dna/HorizontalRow";
import { WebsiteSummaryCard } from "../dna/WebsiteSummaryCard";
import { UnderstandingCard } from "../dna/UnderstandingCard";
import { ReadinessCard } from "../dna/ReadinessCard";
import { AuditsCard } from "../dna/AuditsCard";
import { CitationsCard } from "../dna/CitationsCard";
import { RunProgressBanner } from "../dna/RunProgressBanner";
import { DimensionChip } from "../readiness/DimensionChip";
import { FindingsStack } from "../readiness/FindingsStack";
import { OverallReadinessChip } from "../readiness/OverallReadinessChip";
import type { AgentPreviewBuckets } from "../state/agentPreview";
import type { PreviewSection, ReadinessAnalysis, ReadinessFinding } from "@/lib/onboarding/agentClient";

type BrandDnaScreenProps = {
  agentBuckets: AgentPreviewBuckets | null;
  readinessLoading?: boolean;
  onRetry?: () => void;
};

function placeholderFor(
  status: AgentPreviewBuckets["sectionStatus"][keyof AgentPreviewBuckets["sectionStatus"]] | undefined,
  defaultText: string,
): string {
  if (status === "skipped" || status === "error") {
    return "We couldn't draft this — write your own";
  }
  return defaultText;
}

function countSuccessfulSections(buckets: AgentPreviewBuckets | null): number {
  if (!buckets) return 0;
  return Object.values(buckets.sectionStatus).filter((s) => s === "done").length;
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
  visible: { opacity: 1, scale: 1, transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] as const } },
};

function findingFor(readiness: ReadinessAnalysis | null, dim: ReadinessFinding["dimension"]): ReadinessFinding | null {
  return readiness?.findings?.find((f) => f.dimension === dim) ?? null;
}

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
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
  return (status === "skipped" || status === "error") && data == null;
}

export function BrandDnaScreen({ agentBuckets, readinessLoading, onRetry }: BrandDnaScreenProps) {
  const { state, updateState } = useOnboarding();
  const brand = state.brand;
  const websiteHost = brand.website ? safeHostname(brand.website) : null;

  const voice = agentBuckets?.voice;
  const audience = agentBuckets?.audience;
  const business = agentBuckets?.business;
  const heroStatement = agentBuckets?.website?.hero_statement;
  const overviewText = brand.overview || business?.business_description || agentBuckets?.businessStream || "";
  const audienceText = brand.targetAudience || audience?.summary || agentBuckets?.audienceStream || "";

  const readiness: ReadinessAnalysis | null = brand.readiness ?? agentBuckets?.readiness ?? null;
  const loading = Boolean(readinessLoading) && !readiness;
  const settled = !loading && !readinessLoading;
  const successfulCount = countSuccessfulSections(agentBuckets);
  const thinResult = settled && successfulCount < 3;

  return (
    <motion.div
      variants={reveal}
      initial="hidden"
      animate="visible"
      className="mx-auto flex w-full min-h-0 max-w-[1400px] flex-1 flex-col px-4 py-8 md:px-8"
    >
      <motion.header
        variants={heroEnter}
        className="mb-6 grid grid-cols-1 items-end gap-4 md:grid-cols-[1fr_auto]"
      >
        <div className="space-y-2 text-left">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Brand DNA
          </p>
          <h2 className="text-balance text-[44px] font-bold leading-[0.95] tracking-tighter text-foreground md:text-[72px]">
            {thinResult ? (
              <>
                <span className="text-muted-foreground">Let&apos;s get to know </span>
                {brand.name || "your brand"}
              </>
            ) : (
              <>
                {brand.name || "Your brand"}
                <span className="text-muted-foreground">, decoded</span>
              </>
            )}
          </h2>
          <RunProgressBanner buckets={agentBuckets} running={readinessLoading ?? false} onRetry={onRetry} />
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
          toneFinding={findingFor(readiness, "messaging_coherence")}
          brandIdentityChip={<DimensionChip dim="brand_identity" readiness={readiness} loading={loading} />}
          messagingChip={<DimensionChip dim="messaging_coherence" readiness={readiness} loading={loading} />}
          agentBuckets={agentBuckets}
          onRename={(next) => updateState({ brand: { name: next } })}
        />
      </motion.div>

      <motion.div variants={card} className="mb-4">
        <HorizontalRow label="Narrative">
          <DnaSectionCard
            title="Business overview"
            badge="Core"
            chips={
              <>
                <DimensionChip dim="value_proposition" readiness={readiness} loading={loading} />
                <DimensionChip dim="success_metrics" readiness={readiness} loading={loading} />
              </>
            }
            findings={
              <FindingsStack
                findings={[
                  findingFor(readiness, "value_proposition"),
                  findingFor(readiness, "success_metrics"),
                ]}
              />
            }
          >
            <EditableProse
              value={overviewText}
              placeholder={placeholderFor(agentBuckets?.sectionStatus.business, "Drafting…")}
              loading={loading}
              onCommit={(next) => updateState({ brand: { overview: next } })}
            />
            {business ? <BusinessFeatureChips business={business} /> : null}
          </DnaSectionCard>

          <DnaSectionCard
            title="Brand voice & tone"
            badge="Voice"
            chips={<DimensionChip dim="positioning" readiness={readiness} loading={loading} />}
            findings={<FindingsStack findings={[findingFor(readiness, "positioning")]} />}
          >
            {voice ? <VoiceDetail voice={voice} /> : <StreamFallback text={agentBuckets?.voiceStream ?? ""} loading={loading} />}
          </DnaSectionCard>

          <DnaSectionCard
            title="Target audience"
            badge="Audience"
            chips={
              <>
                <DimensionChip dim="icp_clarity" readiness={readiness} loading={loading} />
                <DimensionChip dim="customer_pains" readiness={readiness} loading={loading} />
              </>
            }
            findings={
              <FindingsStack
                findings={[
                  findingFor(readiness, "icp_clarity"),
                  findingFor(readiness, "customer_pains"),
                ]}
              />
            }
          >
            <EditableProse
              value={audienceText}
              placeholder={placeholderFor(agentBuckets?.sectionStatus.audience, "Drafting…")}
              loading={loading}
              onCommit={(next) => updateState({ brand: { targetAudience: next } })}
            />
            {audience ? <AudienceDetail audience={audience} /> : null}
          </DnaSectionCard>
        </HorizontalRow>
      </motion.div>

      <motion.div variants={card} className="mb-4">
        <HorizontalRow label="Analysis">
          {isTerminallyEmpty(agentBuckets, "website", agentBuckets?.website) ? null : (
            <WebsiteSummaryCard buckets={agentBuckets} />
          )}
          <UnderstandingCard buckets={agentBuckets} />
          {isTerminallyEmpty(agentBuckets, "readiness", readiness) ? null : (
            <ReadinessCard buckets={agentBuckets} readiness={readiness} loading={loading} />
          )}
          <AuditsCard buckets={agentBuckets} />
          <CitationsCard buckets={agentBuckets} />
        </HorizontalRow>
      </motion.div>

    </motion.div>
  );
}
