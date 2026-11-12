// Renders the two synthesis sections of the Brand DNA — strategy + operational
// guidelines — using the same CardSurface presentation as the rest of the
// onboarding output, with a per-section audit score chip. Read-only: the
// structured object is the source of truth (persisted backend-side via the
// composite); edits to these sections are out of scope here.
import type { BrandGuidelines, BrandStrategy } from '@continuum/contracts';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import type { AgentPreviewBuckets } from '../state/agentPreview';
import { CardSurface } from './CardSurface';
import { HorizontalRow } from './HorizontalRow';
import { ProvenanceMark } from './RevealMarks';
import { provenanceOf } from './reveal';

function auditScore(audit: unknown): number | null {
  if (audit && typeof audit === 'object' && 'score' in audit) {
    const score = (audit as { score?: unknown }).score;
    return typeof score === 'number' ? score : null;
  }
  return null;
}

function ScoreChip({ score }: { score: number | null }) {
  const tUi = useTranslations('onboarding');

  if (score === null) return null;
  return (
    <Badge variant="secondary" className="text-xs">
      {tUi('m_93d630bb95')}
      {score}
    </Badge>
  );
}

function ChipList({ label, items }: { label: string; items?: string[] | null }) {
  if (!items || items.length === 0) return null;
  return (
    <p className="m-0 text-sm text-muted-foreground">
      <span className="font-medium text-foreground">{label}:</span> {items.join(', ')}
    </p>
  );
}

function StrategyBody({ strategy }: { strategy: BrandStrategy }) {
  const tUi = useTranslations('onboarding');

  return (
    <div className="flex flex-col gap-2 text-sm">
      {strategy.promise?.headline ? (
        <p className="m-0 font-medium text-foreground">{strategy.promise.headline}</p>
      ) : null}
      {strategy.positioning?.statement ? (
        <p className="m-0 text-muted-foreground">{strategy.positioning.statement}</p>
      ) : null}
      <ChipList
        label={tUi('m_2727a73fb1')}
        items={strategy.message_pillars?.map((pillar) => pillar.pillar)}
      />
      <ChipList label={tUi('m_d1a616085a')} items={strategy.personality?.traits} />
      {strategy.taglines?.primary ? (
        <p className="m-0 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{tUi('m_bfabbcabdb')}</span>{' '}
          {strategy.taglines.primary}
        </p>
      ) : null}
    </div>
  );
}

function GuidelinesBody({ guidelines }: { guidelines: BrandGuidelines }) {
  const tUi = useTranslations('onboarding');

  return (
    <div className="flex flex-col gap-2 text-sm">
      <ChipList label={tUi('m_22bdf47be3')} items={guidelines.voice_rules?.dos} />
      <ChipList label={tUi('m_bfed24b7dd')} items={guidelines.voice_rules?.donts} />
      <ChipList label={tUi('m_33fc27cf0a')} items={guidelines.messaging_guardrails?.banned_words} />
      <ChipList
        label={tUi('m_13f66243ef')}
        items={guidelines.messaging_guardrails?.preferred_terms}
      />
      <ChipList
        label={tUi('m_c5a309f176')}
        items={guidelines.content_pillars?.map((pillar) => pillar.pillar)}
      />
    </div>
  );
}

export function StrategyGuidelinesRow({
  buckets,
  settled = false,
  onRetry,
}: {
  buckets: AgentPreviewBuckets | null;
  /** True once the run is over, so an untouched section reads as empty, not pending. */
  settled?: boolean;
  onRetry?: () => void;
}) {
  const tUi = useTranslations('onboarding');

  const strategy = buckets?.strategy ?? null;
  const guidelines = buckets?.guidelines ?? null;

  return (
    <HorizontalRow label={tUi('m_a8015b8e67')} layout="grid">
      <CardSurface
        title={tUi('m_69fb26dda8')}
        badge={tUi('dimensionPositioning')}
        status={buckets?.sectionStatus.strategy}
        isEmpty={!strategy}
        settled={settled}
        onRetry={onRetry}
        minBodyHeight={140}
        maxBodyHeight={320}
        className="h-full"
        chips={
          <>
            <ProvenanceMark
              field="strategy"
              provenance={provenanceOf(strategy, 'brand analysis')}
            />
            <ScoreChip score={auditScore(buckets?.audits.strategy)} />
          </>
        }
      >
        {strategy ? <StrategyBody strategy={strategy} /> : null}
      </CardSurface>

      <CardSurface
        title={tUi('m_141d1d74d8')}
        badge={tUi('dnaBadgeOperatingRules')}
        status={buckets?.sectionStatus.guidelines}
        isEmpty={!guidelines}
        settled={settled}
        onRetry={onRetry}
        minBodyHeight={140}
        maxBodyHeight={320}
        className="h-full"
        chips={
          <>
            <ProvenanceMark
              field="guidelines"
              provenance={provenanceOf(guidelines, 'brand analysis')}
            />
            <ScoreChip score={auditScore(buckets?.audits.guidelines)} />
          </>
        }
      >
        {guidelines ? <GuidelinesBody guidelines={guidelines} /> : null}
      </CardSurface>
    </HorizontalRow>
  );
}
