import type { ReadinessSeverity } from '@continuum/contracts';
import { readinessSeverity } from '@continuum/contracts';
import { BookOpen, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { ReadinessFinding } from '@/lib/onboarding/agentClient';
import { cn } from '@/lib/utils';
import { DIMENSION_LABELS } from './utils';

// Static class strings so Tailwind can see them; colours are theme tokens so the
// tint holds in dark mode.
const TINT: Record<ReadinessSeverity, string> = {
  low: 'border-[color-mix(in_srgb,var(--success)_22%,transparent)] bg-[color-mix(in_srgb,var(--success)_5%,transparent)]',
  medium:
    'border-[color-mix(in_srgb,var(--warning)_26%,transparent)] bg-[color-mix(in_srgb,var(--warning)_6%,transparent)]',
  high: 'border-[color-mix(in_srgb,var(--destructive)_24%,transparent)] bg-[color-mix(in_srgb,var(--destructive)_5%,transparent)]',
};

const ICON_TONE: Record<ReadinessSeverity, string> = {
  low: 'text-success',
  medium: 'text-warning',
  high: 'text-destructive',
};

function pointsLabel(points: number): string {
  return points >= 1 ? `+${Math.round(points)} pts` : '+<1 pt';
}

/** `brand_book.value_proposition` → `Value proposition`: the field a fix lands in. */
function fieldLabel(targetField: string): string {
  const leaf = targetField.split('.').pop() ?? targetField;
  const words = leaf.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

type Props = {
  finding: ReadinessFinding;
  /** Rail mode: the card becomes the control that opens its dimension's criteria ledger. */
  onSelect?: () => void;
  onPreview?: (previewing: boolean) => void;
  selected?: boolean;
  controls?: string;
};

export function FindingCallout({ finding, onSelect, onPreview, selected, controls }: Props) {
  const severity = readinessSeverity(finding.score);
  const rail = Boolean(onSelect);
  const meta =
    finding.points_gain !== undefined || finding.target_field ? (
      <span className="flex flex-wrap items-center gap-1.5 pt-1.5">
        {finding.points_gain !== undefined ? (
          <span
            className="text-sm font-semibold tabular-nums text-foreground"
            data-testid="move-points"
          >
            {pointsLabel(finding.points_gain)}
          </span>
        ) : null}
        {rail ? (
          <span className="text-xs text-muted-foreground">
            {DIMENSION_LABELS[finding.dimension]}
          </span>
        ) : null}
        {finding.target_field ? (
          <Badge variant="muted" className="font-normal" title={finding.target_field}>
            <BookOpen aria-hidden />
            {fieldLabel(finding.target_field)}
          </Badge>
        ) : null}
      </span>
    ) : null;

  const body = (
    <span className="flex items-start gap-2">
      <Sparkles aria-hidden className={cn('mt-0.5 size-3.5 shrink-0', ICON_TONE[severity])} />
      <span className="block min-w-0 space-y-1">
        <span className="block text-sm font-semibold text-foreground">{finding.headline}</span>
        {rail ? null : (
          <span className="block text-sm leading-snug text-muted-foreground">{finding.detail}</span>
        )}
        <span className="block pt-0.5 text-sm leading-snug text-foreground">
          <span className="font-semibold">Try this: </span>
          {finding.recommendation}
        </span>
        {meta}
      </span>
    </span>
  );

  if (rail) {
    return (
      <button
        type="button"
        aria-pressed={selected}
        aria-controls={controls}
        data-testid="readiness-move"
        data-dimension={finding.dimension}
        onClick={onSelect}
        onPointerEnter={() => onPreview?.(true)}
        onPointerLeave={() => onPreview?.(false)}
        onFocus={() => onPreview?.(true)}
        onBlur={() => onPreview?.(false)}
        className={cn(
          'block w-full rounded-md border p-3 text-left transition-[box-shadow,border-color] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          TINT[severity],
          selected && 'ring-2 ring-ring/60',
        )}
      >
        {body}
      </button>
    );
  }

  return (
    <div className="space-y-2.5">
      <Separator className="opacity-60" />
      <div className={cn('rounded-md border p-3', TINT[severity])}>{body}</div>
    </div>
  );
}
