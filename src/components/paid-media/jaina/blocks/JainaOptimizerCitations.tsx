'use client';

// Where a turn's cited optimizer cards get their figures.
//
// `OptimizerCardBlock` is deliberately figure-free and resolver-driven — it takes a
// `resolve(candidateId)` and knows nothing about Supabase, React Query or the Jaina tab. This
// is the one place that hands it a real one, so the block stays renderable from a bench with a
// plain function and from the transcript with a live read.
//
// One hook for the whole turn, not one per card: every citation in an answer names the same
// read (the tool resolves the read id itself), so a card each would be N subscriptions to one
// query for nothing.

import type { JainaOptimizerCard } from '@continuum/contracts';
import { useJainaBrandScope } from '@/lib/jaina/brandScope';
import { useCitedOptimizerRead } from '@/lib/jaina/optimizerCitedRead';
import { OptimizerCardBlock } from './OptimizerCardBlock';

export type JainaOptimizerCitationsProps = {
  citations: JainaOptimizerCard[];
  onOpenRead?: (readId: string) => void;
};

export function JainaOptimizerCitations({ citations, onOpenRead }: JainaOptimizerCitationsProps) {
  const scope = useJainaBrandScope();
  // Every citation in one answer names the same read; the first is as good as any for the key.
  const { resolve, readDate, currency } = useCitedOptimizerRead(
    scope,
    citations[0]?.read_id ?? null,
  );

  if (citations.length === 0) return null;

  return (
    <div className="space-y-2">
      {citations.map((card) => (
        <OptimizerCardBlock
          card={card}
          currency={currency}
          key={`${card.read_id}:${card.candidate_ids.join(',')}`}
          readDate={readDate}
          resolve={resolve}
          {...(onOpenRead ? { onOpenRead } : {})}
        />
      ))}
    </div>
  );
}
