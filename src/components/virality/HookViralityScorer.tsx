'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useViralityScore } from '@/lib/virality/useViralityScore';
import { ViralityScoreCard } from './ViralityScoreCard';

// Drop-in on-demand hook scorer: paste a hook, grade it against this brand's winning
// hooks, and see the 0-100 with its full component breakdown. Wraps the shared
// on-demand route (POST /api/virality/score) end to end.
export function HookViralityScorer({
  brandId,
  initialHook = '',
  className,
}: {
  brandId: string;
  initialHook?: string;
  className?: string;
}) {
  const [hook, setHook] = useState(initialHook);
  const { score, loading, error, scoreHook } = useViralityScore(brandId);

  return (
    <div className={className}>
      <label
        htmlFor="virality-hook-input"
        className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground"
      >
        Score a hook
      </label>
      <Textarea
        id="virality-hook-input"
        value={hook}
        onChange={(event) => setHook(event.target.value)}
        placeholder="Paste the opening line of a post or clip…"
        rows={3}
        className="resize-none"
      />
      <div className="mt-2 flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          disabled={loading || hook.trim().length === 0}
          onClick={() => void scoreHook(hook)}
        >
          {loading ? 'Scoring…' : 'Score hook'}
        </Button>
        {error ? <span className="text-sm text-destructive">{error}</span> : null}
      </div>

      {score ? <ViralityScoreCard score={score} className="mt-4" /> : null}
    </div>
  );
}
