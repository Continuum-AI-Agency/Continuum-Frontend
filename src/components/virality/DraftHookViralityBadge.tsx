'use client';

import { useEffect } from 'react';
import { useViralityScore } from '@/lib/virality/useViralityScore';
import { ViralityScoreBadge } from './ViralityScoreBadge';

// Grades a generated hook on view. The deterministic scorer runs in ~2ms server-side,
// so scoring lazily when a draft is opened is cheaper than precomputing on every
// generation — and it always reflects the brand's latest calibration. Renders nothing
// until a score lands, and nothing at all if scoring fails (never blocks the draft).
export function DraftHookViralityBadge({
  brandId,
  hook,
  className,
}: {
  brandId: string;
  hook: string;
  className?: string;
}) {
  const { score, scoreHook } = useViralityScore(brandId);

  useEffect(() => {
    void scoreHook(hook);
  }, [hook, scoreHook]);

  if (!score) return null;
  return <ViralityScoreBadge overall={score.overall} grade={score.grade} className={className} />;
}
