// The honest state of a multi-platform surface whose RPC is not deployed yet. One line, no
// figures: a zero here would read as "nothing happened", and nothing was measured.

import { cn } from '@/lib/utils';
import { MULTIPLATFORM_UNAVAILABLE_TITLE } from './multiplatformRead';

export function MultiPlatformUnavailable({
  detail,
  className,
}: {
  /** What still shows meanwhile, e.g. "Meta's figures below are today's." */
  detail?: string;
  className?: string;
}) {
  return (
    <p
      className={cn(
        'rounded-md border border-border/70 border-dashed px-3 py-2 text-muted-foreground text-xs',
        className,
      )}
      data-testid="multiplatform-unavailable"
      role="status"
    >
      <span className="font-semibold text-foreground">{MULTIPLATFORM_UNAVAILABLE_TITLE}.</span>
      {detail ? ` ${detail}` : null}
    </p>
  );
}
