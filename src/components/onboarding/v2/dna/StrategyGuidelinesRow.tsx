// Renders the two synthesis sections of the Brand DNA — strategy + operational
// guidelines — using the same CardSurface presentation as the rest of the
// onboarding output, with a per-section audit score chip. Read-only: the
// structured object is the source of truth (persisted backend-side via the
// composite); edits to these sections are out of scope here.
import type { BrandGuidelines, BrandStrategy } from "@continuum/contracts";
import { Badge } from "@/components/ui/badge";
import { CardSurface } from "./CardSurface";
import { HorizontalRow } from "./HorizontalRow";
import type { AgentPreviewBuckets } from "../state/agentPreview";

function auditScore(audit: unknown): number | null {
  if (audit && typeof audit === "object" && "score" in audit) {
    const score = (audit as { score?: unknown }).score;
    return typeof score === "number" ? score : null;
  }
  return null;
}

function ScoreChip({ score }: { score: number | null }) {
  if (score === null) return null;
  return (
    <Badge variant="secondary" className="text-[11px]">
      Score {score}
    </Badge>
  );
}

function ChipList({ label, items }: { label: string; items?: string[] | null }) {
  if (!items || items.length === 0) return null;
  return (
    <p className="m-0 text-[12px] text-muted-foreground">
      <span className="font-medium text-foreground">{label}:</span> {items.join(", ")}
    </p>
  );
}

function StrategyBody({ strategy }: { strategy: BrandStrategy }) {
  return (
    <div className="flex flex-col gap-2 text-[13px]">
      {strategy.promise?.headline ? (
        <p className="m-0 font-medium text-foreground">{strategy.promise.headline}</p>
      ) : null}
      {strategy.positioning?.statement ? (
        <p className="m-0 text-muted-foreground">{strategy.positioning.statement}</p>
      ) : null}
      <ChipList label="Pillars" items={strategy.message_pillars?.map((pillar) => pillar.pillar)} />
      <ChipList label="Traits" items={strategy.personality?.traits} />
      {strategy.taglines?.primary ? (
        <p className="m-0 text-[12px] text-muted-foreground">
          <span className="font-medium text-foreground">Tagline:</span> {strategy.taglines.primary}
        </p>
      ) : null}
    </div>
  );
}

function GuidelinesBody({ guidelines }: { guidelines: BrandGuidelines }) {
  return (
    <div className="flex flex-col gap-2 text-[13px]">
      <ChipList label="Do" items={guidelines.voice_rules?.dos} />
      <ChipList label="Don't" items={guidelines.voice_rules?.donts} />
      <ChipList label="Avoid" items={guidelines.messaging_guardrails?.banned_words} />
      <ChipList label="Prefer" items={guidelines.messaging_guardrails?.preferred_terms} />
      <ChipList
        label="Content pillars"
        items={guidelines.content_pillars?.map((pillar) => pillar.pillar)}
      />
    </div>
  );
}

export function StrategyGuidelinesRow({ buckets }: { buckets: AgentPreviewBuckets | null }) {
  const strategy = buckets?.strategy ?? null;
  const guidelines = buckets?.guidelines ?? null;

  return (
    <HorizontalRow label="Brand strategy" layout="grid">
      <CardSurface
        title="Strategy"
        badge="Positioning"
        status={buckets?.sectionStatus.strategy}
        isEmpty={!strategy}
        minBodyHeight={140}
        maxBodyHeight={320}
        className="h-full"
        chips={<ScoreChip score={auditScore(buckets?.audits.strategy)} />}
      >
        {strategy ? <StrategyBody strategy={strategy} /> : null}
      </CardSurface>

      <CardSurface
        title="Guidelines"
        badge="Operating rules"
        status={buckets?.sectionStatus.guidelines}
        isEmpty={!guidelines}
        minBodyHeight={140}
        maxBodyHeight={320}
        className="h-full"
        chips={<ScoreChip score={auditScore(buckets?.audits.guidelines)} />}
      >
        {guidelines ? <GuidelinesBody guidelines={guidelines} /> : null}
      </CardSurface>
    </HorizontalRow>
  );
}
