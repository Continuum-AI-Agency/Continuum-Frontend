'use client';

import type { ViralityScore } from '@continuum/contracts';
import { useCallback, useState } from 'react';
import { scoreHookForBrand } from '@/lib/virality/scoreHook';

// Small client hook wrapping the on-demand hook scorer with loading/error state.
export function useViralityScore(brandId: string) {
  const [score, setScore] = useState<ViralityScore | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scoreHook = useCallback(
    async (hookText: string): Promise<ViralityScore | null> => {
      const trimmed = hookText.trim();
      if (trimmed.length === 0) return null;
      setLoading(true);
      setError(null);
      try {
        const result = await scoreHookForBrand({ brandId, hookText: trimmed });
        setScore(result);
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not score this hook. Try again.');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [brandId],
  );

  const reset = useCallback(() => {
    setScore(null);
    setError(null);
  }, []);

  return { score, loading, error, scoreHook, reset };
}
