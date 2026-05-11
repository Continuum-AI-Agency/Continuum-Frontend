import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { SafeMarkdown } from "@/components/ui/SafeMarkdown";
import { useOnboarding } from "@/components/onboarding/providers/OnboardingContext";
import { createSignedAssetUrl } from "@/lib/creative-assets/storageClient";
import { ColorSwatch } from "../dna/ColorSwatch";
import { FontSample } from "../dna/FontSample";
import { TonePicker } from "../dna/TonePicker";
import { EditableHeading } from "../dna/EditableHeading";
import { EditableProse } from "../dna/EditableProse";
import { ScoreBadge, bandFor } from "../readiness/ScoreBadge";
import { ScorePip } from "../readiness/ScorePip";
import { FindingCallout } from "../readiness/FindingCallout";
import { DocumentUploader } from "@/components/onboarding/shared/DocumentUploader";
import { TeamInviteSection } from "../dna/TeamInviteSection";
import type { AgentPreviewBuckets } from "../state/agentPreview";
import type { ReadinessAnalysis, ReadinessDimension, ReadinessFinding } from "@/lib/onboarding/agentClient";

type BrandDnaScreenProps = {
  agentBuckets: AgentPreviewBuckets | null;
  readinessLoading?: boolean;
};

const DIMENSION_LABELS: Record<ReadinessDimension, string> = {
  value_proposition: "Value prop",
  icp_clarity: "ICP",
  customer_pains: "Customer pains",
  success_metrics: "Outcomes",
  positioning: "Positioning",
  messaging_coherence: "Messaging",
  brand_identity: "Identity",
};

function scoreFor(readiness: ReadinessAnalysis | null, dim: ReadinessDimension): number | null {
  return readiness?.dimensions?.[dim]?.score ?? null;
}

function findingFor(readiness: ReadinessAnalysis | null, dim: ReadinessDimension): ReadinessFinding | null {
  return readiness?.findings?.find((f) => f.dimension === dim) ?? null;
}

const reveal = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

const card = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const } },
};

const heroEnter = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } },
};

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
              chip={
                <DimensionChip
                  dim="brand_identity"
                  readiness={readiness}
                  loading={loading}
                />
              }
            />
          </motion.div>
          <motion.div variants={card}>
            <TypographyCard
              primary={brand.typography.primary}
              secondary={brand.typography.secondary}
              chip={
                <DimensionChip
                  dim="brand_identity"
                  readiness={readiness}
                  loading={loading}
                />
              }
            />
          </motion.div>
          <motion.div variants={card}>
            <ToneCard
              chip={
                <DimensionChip
                  dim="messaging_coherence"
                  readiness={readiness}
                  loading={loading}
                />
              }
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

function DimensionChip({
  dim,
  readiness,
  loading,
}: {
  dim: ReadinessDimension;
  readiness: ReadinessAnalysis | null;
  loading: boolean;
}) {
  const score = scoreFor(readiness, dim);
  if (!loading && score === null) return null;
  return <ScoreBadge label={DIMENSION_LABELS[dim]} score={score} loading={loading} />;
}

function FindingsStack({ findings }: { findings: (ReadinessFinding | null)[] }) {
  const real = findings.filter((f): f is ReadinessFinding => f !== null);
  if (real.length === 0) return null;
  return (
    <div className="space-y-3 pt-1">
      {real.map((f) => (
        <FindingCallout key={f.dimension} finding={f} />
      ))}
    </div>
  );
}

function OverallReadinessChip({
  readiness,
  loading,
}: {
  readiness: ReadinessAnalysis | null;
  loading: boolean;
}) {
  if (loading) {
    return <ScoreBadge label="Brand readiness" score={null} loading className="h-7 px-3" />;
  }
  if (!readiness) return null;
  const score = readiness.overall_score;
  const band = bandFor(score);
  const pipColor = band === "strong" ? "#0daea2" : band === "watch" ? "#f59e0b" : "#e11d48";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-3 py-1.5 text-[12px] font-medium text-[#0b1220] shadow-sm transition-colors hover:border-[#cbd5e1]"
        >
          <ScorePip score={score} size={14} color={pipColor} />
          Brand readiness
          <span className="tabular-nums text-[#64748b]">· {Math.round(score)}%</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#94a3b8]">
          What we scored
        </p>
        <ul className="space-y-2">
          {(Object.keys(readiness.dimensions) as ReadinessDimension[]).map((dim) => {
            const d = readiness.dimensions[dim];
            if (!d) return null;
            return (
              <li key={dim} className="flex items-start justify-between gap-3 text-[12px]">
                <div className="min-w-0">
                  <p className="font-medium text-[#0b1220]">{DIMENSION_LABELS[dim]}</p>
                  <p className="leading-snug text-[#64748b]">{d.rationale}</p>
                </div>
                <span className="shrink-0 tabular-nums text-[#94a3b8]">{Math.round(d.score)}</span>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function IdentityCard({
  name,
  host,
  heroStatement,
  logoPath,
  onRename,
}: {
  name: string;
  host: string | null;
  heroStatement: string | null;
  logoPath: string | null;
  onRename: (next: string) => void;
}) {
  const [resolvedLogo, setResolvedLogo] = useState<string | null>(null);
  useEffect(() => {
    if (!logoPath) {
      setResolvedLogo(null);
      return;
    }
    if (/^https?:\/\//i.test(logoPath)) {
      setResolvedLogo(logoPath);
      return;
    }
    let active = true;
    createSignedAssetUrl(logoPath, 3600)
      .then((url) => active && setResolvedLogo(url))
      .catch(() => active && setResolvedLogo(null));
    return () => {
      active = false;
    };
  }, [logoPath]);

  return (
    <Card className="border-[#e5e7eb] shadow-sm">
      <CardContent className="space-y-3 p-5">
        <Avatar className="h-14 w-14 rounded-xl bg-[#0b1220]">
          {resolvedLogo ? <AvatarImage src={resolvedLogo} alt={`${name} logo`} className="object-cover" /> : null}
          <AvatarFallback className="rounded-xl bg-[#0b1220] text-[16px] font-bold text-white">
            {(name || "B").slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <EditableHeading value={name} placeholder="Untitled brand" onCommit={onRename} />
        {host ? (
          <div className="flex items-center gap-1.5 text-[12px] text-[#64748b]">
            <ExternalLink className="h-3 w-3" />
            {host}
          </div>
        ) : null}
        {heroStatement ? (
          <p className="text-[13px] italic leading-relaxed text-[#374151]">&ldquo;{heroStatement}&rdquo;</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PaletteCard({ colors, chip }: { colors: string[]; chip?: React.ReactNode }) {
  return (
    <Card className="border-[#e5e7eb] shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-[12px] font-semibold uppercase tracking-wide text-[#64748b]">
          Palette
        </CardTitle>
        {chip}
      </CardHeader>
      <CardContent>
        {colors.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {colors.map((hex) => (
              <ColorSwatch key={hex} hex={hex} />
            ))}
          </div>
        ) : (
          <p className="text-[12px] italic text-[#94a3b8]">No palette detected.</p>
        )}
      </CardContent>
    </Card>
  );
}

function TypographyCard({
  primary,
  secondary,
  chip,
}: {
  primary: string | null;
  secondary: string | null;
  chip?: React.ReactNode;
}) {
  return (
    <Card className="border-[#e5e7eb] shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-[12px] font-semibold uppercase tracking-wide text-[#64748b]">
          Typography
        </CardTitle>
        {chip}
      </CardHeader>
      <CardContent>
        {primary || secondary ? (
          <div className="flex gap-5">
            <FontSample family={primary} role="Primary" weight={700} />
            <FontSample family={secondary} role="Secondary" weight={400} />
          </div>
        ) : (
          <p className="text-[12px] italic text-[#94a3b8]">No fonts detected.</p>
        )}
      </CardContent>
    </Card>
  );
}

function ToneCard({ chip, finding }: { chip?: React.ReactNode; finding?: ReadinessFinding | null }) {
  return (
    <Card className="border-[#e5e7eb] shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-[12px] font-semibold uppercase tracking-wide text-[#64748b]">
          Tone of voice
        </CardTitle>
        {chip}
      </CardHeader>
      <CardContent className="space-y-3">
        <TonePicker />
        {finding ? <FindingCallout finding={finding} /> : null}
      </CardContent>
    </Card>
  );
}

function DnaSectionCard({
  title,
  badge,
  children,
  chips,
  findings,
}: {
  title: string;
  badge: string;
  children: React.ReactNode;
  chips?: React.ReactNode;
  findings?: React.ReactNode;
}) {
  return (
    <Card className="border-[#e5e7eb] shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <CardTitle className="text-[14px]">{title}</CardTitle>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {chips}
          <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">
            {badge}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-[13px] leading-relaxed text-[#374151]">
        {children}
        {findings}
      </CardContent>
    </Card>
  );
}

function VoiceDetail({ voice }: { voice: NonNullable<AgentPreviewBuckets["voice"]> }) {
  const tags = [
    voice.tone ? { label: "Tone", value: voice.tone } : null,
    voice.voice_style ? { label: "Style", value: voice.voice_style } : null,
    voice.emoji_usage ? { label: "Emoji", value: voice.emoji_usage } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div className="space-y-3">
      {tags.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {tags.map((t) => (
            <div key={t.label} className="rounded-md border border-[#e5e7eb] bg-[#f7f8fb] p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8]">{t.label}</p>
              <p className="mt-1 text-[12px] text-[#0b1220]">{t.value}</p>
            </div>
          ))}
        </div>
      ) : null}
      {voice.mission ? (
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8]">Mission</p>
          <p>{voice.mission}</p>
        </div>
      ) : null}
      {voice.vision ? (
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8]">Vision</p>
          <p>{voice.vision}</p>
        </div>
      ) : null}
      {voice.core_values && voice.core_values.length > 0 ? (
        <ChipRow label="Core values" values={voice.core_values} variant="teal" />
      ) : null}
      {voice.keywords && voice.keywords.length > 0 ? (
        <ChipRow label="Keywords" values={voice.keywords} variant="violet" />
      ) : null}
      {voice.key_messaging && voice.key_messaging.length > 0 ? (
        <BulletList label="Key messaging" items={voice.key_messaging} />
      ) : null}
    </div>
  );
}

function AudienceDetail({ audience }: { audience: NonNullable<AgentPreviewBuckets["audience"]> }) {
  const sections: { label: string; items?: string[] }[] = [
    { label: "Demographics", items: audience.demographics },
    { label: "Psychographics", items: audience.psychographics },
    { label: "Pain points", items: audience.pain_points },
    { label: "Goals", items: audience.goals },
    { label: "Buying criteria", items: audience.buying_criteria },
    { label: "Interests", items: audience.interests },
  ].filter((s) => s.items && s.items.length > 0);
  if (sections.length === 0) return null;
  return (
    <div className="space-y-3 pt-1">
      <Separator />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {sections.map((section) => (
          <div key={section.label}>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8]">{section.label}</p>
            <ul className="space-y-1 text-[12px] text-[#374151]">
              {(section.items ?? []).slice(0, 4).map((item, idx) => (
                <li key={idx} className="leading-snug">
                  • {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function BusinessFeatureChips({ business }: { business: NonNullable<AgentPreviewBuckets["business"]> }) {
  const features = business.business_features ?? [];
  const benefits = business.business_benefits ?? [];
  if (features.length === 0 && benefits.length === 0) return null;
  return (
    <div className="space-y-2 pt-2">
      {features.length > 0 ? <ChipRow label="Features" values={features} variant="violet" /> : null}
      {benefits.length > 0 ? <ChipRow label="Benefits" values={benefits} variant="teal" /> : null}
    </div>
  );
}

function ChipRow({ label, values, variant }: { label: string; values: string[]; variant: "teal" | "violet" }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8]">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => (
          <Badge key={value} variant={variant}>
            {value}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function BulletList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8]">{label}</p>
      <ul className="space-y-1 text-[12px] text-[#374151]">
        {items.slice(0, 5).map((item, idx) => (
          <li key={idx} className="leading-snug">
            • {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StreamFallback({ text }: { text: string }) {
  if (!text) return <p className="m-0 italic text-[#94a3b8]">Drafting…</p>;
  return <SafeMarkdown content={text} />;
}

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
