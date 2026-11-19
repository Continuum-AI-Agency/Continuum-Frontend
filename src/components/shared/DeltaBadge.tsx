import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { judgeDelta } from '@/components/paid-media/jaina/reading';
import type { UiLocale } from '@/i18n/config';
import { cn } from '@/lib/utils';

type DeltaPresentation = { amount: string; ariaLabel: string };
type DeltaProps = {
  value: number;
  isPercent?: boolean;
  goodWhenDown?: boolean;
  className?: string;
  presentation?: DeltaPresentation;
};
function deltaFacts(value: number, goodWhenDown: boolean) {
  const direction = value > 0 ? 'up' : value < 0 ? 'down' : 'neutral';
  return {
    direction,
    judgement: judgeDelta({ change: value, goodWhenDown }),
    Icon: direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus,
    magnitude: Math.abs(Math.round(value)),
  };
}
type DeltaFacts = ReturnType<typeof deltaFacts>;
const formats = new Map<string, Intl.NumberFormat>();
function formatMagnitude(magnitude: number, isPercent: boolean, locale: UiLocale): string {
  const key = `${locale}:${isPercent}`;
  let formatter = formats.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: isPercent ? 'percent' : 'decimal',
      maximumFractionDigits: 0,
    });
    formats.set(key, formatter);
  }
  return formatter.format(isPercent ? magnitude / 100 : magnitude);
}
function DeltaFigure({
  facts,
  presentation,
  className,
}: {
  facts: DeltaFacts;
  presentation: DeltaPresentation;
  className?: string;
}) {
  const { Icon, judgement } = facts;
  return (
    <span
      role="img"
      aria-label={presentation.ariaLabel}
      className={cn(
        'inline-flex items-center justify-end gap-0.5 font-mono text-xs tabular-nums',
        judgement === 'positive' && 'text-success-ink',
        judgement === 'risk' && 'text-destructive-ink',
        judgement === 'watch' && 'text-warning',
        (judgement === 'neutral' || judgement === 'unjudged') && 'text-muted-foreground',
        className,
      )}
    >
      <Icon className="size-3" />
      {presentation.amount}
    </span>
  );
}
function LocalizedDelta({
  facts,
  isPercent,
  className,
}: {
  facts: DeltaFacts;
  isPercent: boolean;
  className?: string;
}) {
  const t = useTranslations('common');
  const locale = useLocale();
  const amount = formatMagnitude(facts.magnitude, isPercent, locale);
  const movement = t('deltaMovement', { direction: facts.direction, amount });
  const ariaLabel =
    facts.judgement === 'unjudged'
      ? movement
      : t('deltaMovementJudged', {
          movement,
          judgement: t('deltaJudgement', { judgement: facts.judgement }),
        });
  return <DeltaFigure facts={facts} presentation={{ amount, ariaLabel }} className={className} />;
}

/** Direction and judgement always use the original data; report callers own their presentation language. */
export function DeltaBadge({
  value,
  isPercent = true,
  goodWhenDown = false,
  className,
  presentation,
}: DeltaProps) {
  const facts = deltaFacts(value, goodWhenDown);
  return presentation ? (
    <DeltaFigure facts={facts} presentation={presentation} className={className} />
  ) : (
    <LocalizedDelta facts={facts} isPercent={isPercent} className={className} />
  );
}
