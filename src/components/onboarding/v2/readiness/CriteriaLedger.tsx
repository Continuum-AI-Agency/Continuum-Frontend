import type { ReadinessCriterionMet, ReadinessCriterionResult } from '@continuum/contracts';
import { CircleCheck, CircleQuestionMark, CircleX, Contrast, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import { Badge, badgeVariants } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ReadinessAnalysis, ReadinessDimension } from '@/lib/onboarding/agentClient';
import { cn } from '@/lib/utils';
import { getDimensionLabels, sourceChipLabel } from './utils';

function getCriterionGlyphs(tUi: ReturnType<typeof useTranslations<'onboarding'>>) {
  return {
    yes: {
      icon: CircleCheck,
      tone: 'text-success',
      label: tUi('m_e4028358c8'),
    },
    partial: {
      icon: Contrast,
      tone: 'text-warning',
      label: tUi('m_e461bb3818'),
    },
    no: { icon: CircleX, tone: 'text-destructive', label: tUi('m_f421aed614') },
    unknown: {
      icon: CircleQuestionMark,
      tone: 'text-muted-foreground',
      label: tUi('m_fade4edeec'),
    },
  };
}

type Props = {
  id: string;
  dimension: ReadinessDimension;
  readiness: ReadinessAnalysis;
  pinned: boolean;
  onClose: () => void;
};

/** What earned one dimension's score: each criterion, its verdict, and the quote behind it. */
export function CriteriaLedger({ id, dimension, readiness, pinned, onClose }: Props) {
  const tUi = useTranslations('onboarding');

  const dim = readiness.dimensions[dimension];
  const criteria = dim.criteria ?? [];
  const answered = criteria.filter((c) => c.met !== 'unknown').length;

  return (
    <section
      aria-label={tUi('m_dcee61b8f4', {
        v0: String(getDimensionLabels(tUi)[dimension]),
      })}
      className="space-y-2"
      data-dimension={dimension}
      data-testid="criteria-ledger"
      id={id}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-foreground">
            {getDimensionLabels(tUi)[dimension]}{' '}
            <span className="tabular-nums text-muted-foreground">
              {dim.coverage === 0 ? tUi('m_4e720d1246') : Math.round(dim.score)}
            </span>
          </h4>
          {criteria.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {answered}
              {tUi('m_607f2de6ce')}
              {criteria.length}
              {tUi('m_d36ea15d98')}
            </p>
          ) : null}
        </div>
        {pinned ? (
          <Button
            aria-label={tUi('m_927f11ef6f')}
            onClick={onClose}
            size="icon"
            variant="ghost"
            className="size-6 shrink-0"
          >
            <X className="size-3.5" />
          </Button>
        ) : null}
      </header>
      {dim.rationale ? (
        <p className="text-xs leading-snug text-muted-foreground">{dim.rationale}</p>
      ) : null}
      {criteria.length > 0 ? (
        <ul className="divide-y divide-border">
          {criteria.map((criterion) => (
            <CriterionRow criterion={criterion} key={criterion.id} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function CriterionRow({ criterion }: { criterion: ReadinessCriterionResult }) {
  const tUi = useTranslations('onboarding');
  const GLYPH = getCriterionGlyphs(tUi);

  const glyph = GLYPH[criterion.met];
  const Icon = glyph.icon;
  // Only a quote that matched its source is shown as evidence; the scorer already
  // downgraded an unmatched one to unknown.
  const quote = criterion.verified ? criterion.quote : null;
  const chip = criterion.source
    ? sourceChipLabel(criterion.source, criterion.source_url, tUi)
    : null;
  return (
    <li
      className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 py-2"
      data-met={criterion.met}
      data-testid="readiness-criterion"
    >
      <Icon className={cn('mt-0.5 size-4', glyph.tone)} />
      <div className="min-w-0 space-y-1">
        <p className="text-sm leading-snug text-foreground">
          <span className="sr-only">{glyph.label}: </span>
          {criterion.label}
        </p>
        {quote ? (
          <blockquote className="border-l-2 border-border pl-2 text-xs leading-snug text-muted-foreground">
            “{quote}”
          </blockquote>
        ) : null}
        {chip ? (
          criterion.source_url ? (
            <a
              className={cn(
                badgeVariants({ variant: 'muted' }),
                'font-normal hover:bg-foreground/5',
              )}
              data-testid="criterion-source"
              href={criterion.source_url}
              rel="noopener noreferrer"
              target="_blank"
            >
              {chip}
            </a>
          ) : (
            <Badge data-testid="criterion-source" variant="muted" className="font-normal">
              {chip}
            </Badge>
          )
        ) : null}
      </div>
    </li>
  );
}
