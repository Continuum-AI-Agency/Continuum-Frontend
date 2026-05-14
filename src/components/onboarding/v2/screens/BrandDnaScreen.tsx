import { motion } from "motion/react";
import { useOnboarding } from "@/components/onboarding/providers/OnboardingContext";
import { DocumentUploader } from "@/components/onboarding/shared/DocumentUploader";
import { IdentityCard } from "../dna/IdentityCard";
import { PaletteCard } from "../dna/PaletteCard";
import { TypographyCard } from "../dna/TypographyCard";
import { ToneCard } from "../dna/ToneCard";
import { DnaSectionCard } from "../dna/DnaSectionCard";
import { VoiceDetail } from "../dna/VoiceDetail";
import { AudienceDetail } from "../dna/AudienceDetail";
import { BusinessFeatureChips } from "../dna/BusinessFeatureChips";
import { StreamFallback } from "../dna/StreamFallback";
import { EditableProse } from "../dna/EditableProse";
import { TeamInviteSection } from "../dna/TeamInviteSection";
import { DimensionChip } from "../readiness/DimensionChip";
import { FindingsStack } from "../readiness/FindingsStack";
import { OverallReadinessChip } from "../readiness/OverallReadinessChip";
import type { AgentPreviewBuckets } from "../state/agentPreview";
import type { ReadinessAnalysis, ReadinessFinding } from "@/lib/onboarding/agentClient";

type BrandDnaScreenProps = {
  agentBuckets: AgentPreviewBuckets | null;
  readinessLoading?: boolean;
};

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

export function BrandDnaScreen({ agentBuckets, readinessLoading }: BrandDnaScreenProps) {
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

  return (
    <motion.div
      variants={reveal}
      initial="hidden"
      animate="visible"
      className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-8"
    >
      <motion.header variants={heroEnter} className="mb-7 flex flex-col items-center gap-3 text-center">
        <h2 className="text-balance text-[32px] font-bold tracking-tight text-[#0b1220] md:text-[40px]">
          {brand.name || "Your brand"}, decoded
        </h2>
        {agentBuckets?.firstImpression?.headline ? (
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-2xl text-balance text-[15px] italic leading-snug text-[#475569]"
          >
            {agentBuckets.firstImpression.headline}
          </motion.p>
        ) : null}
        <OverallReadinessChip readiness={readiness} loading={loading} />
      </motion.header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <motion.div variants={card}>
            <IdentityCard
              name={brand.name}
              host={websiteHost}
              heroStatement={heroStatement ?? brand.tagline ?? null}
              logoPath={brand.logoPath}
              onRename={(next) => updateState({ brand: { name: next } })}
            />
          </motion.div>
          <motion.div variants={card}>
            <PaletteCard
              colors={brand.colors}
              chip={<DimensionChip dim="brand_identity" readiness={readiness} loading={loading} />}
            />
          </motion.div>
          <motion.div variants={card}>
            <TypographyCard
              primary={brand.typography.primary}
              secondary={brand.typography.secondary}
              chip={<DimensionChip dim="brand_identity" readiness={readiness} loading={loading} />}
            />
          </motion.div>
          <motion.div variants={card}>
            <ToneCard
              chip={<DimensionChip dim="messaging_coherence" readiness={readiness} loading={loading} />}
              finding={findingFor(readiness, "messaging_coherence")}
            />
          </motion.div>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <motion.div variants={card}>
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
                placeholder="Drafting…"
                onCommit={(next) => updateState({ brand: { overview: next } })}
              />
              {business ? <BusinessFeatureChips business={business} /> : null}
            </DnaSectionCard>
          </motion.div>

          <motion.div variants={card}>
            <DnaSectionCard
              title="Brand voice & tone"
              badge="Voice"
              chips={<DimensionChip dim="positioning" readiness={readiness} loading={loading} />}
              findings={<FindingsStack findings={[findingFor(readiness, "positioning")]} />}
            >
              {voice ? <VoiceDetail voice={voice} /> : <StreamFallback text={agentBuckets?.voiceStream ?? ""} />}
            </DnaSectionCard>
          </motion.div>

          <motion.div variants={card}>
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
                placeholder="Drafting…"
                onCommit={(next) => updateState({ brand: { targetAudience: next } })}
              />
              {audience ? <AudienceDetail audience={audience} /> : null}
            </DnaSectionCard>
          </motion.div>
        </div>
      </div>

      <motion.div variants={card} className="mt-4">
        <DocumentUploader />
      </motion.div>
      <motion.div variants={card} className="mt-4">
        <TeamInviteSection />
      </motion.div>
    </motion.div>
  );
}
