'use client';

// The open asset's spoken track. Fetched on modal open (video assets only)
// rather than shipped with every grid card — see the route's note on payload
// weight. The '' vs null distinction survives the wire and is resolved into a
// view state by transcriptView().

import { transcriptSegmentSchema } from '@continuum/contracts';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { type TranscriptView, transcriptView } from './transcriptSegments';

const responseSchema = z.object({
  assetId: z.string(),
  transcript: z.string().nullable(),
  transcriptSegments: z.array(transcriptSegmentSchema).nullable(),
  transcriptSource: z.string().nullable(),
});

export type UseAssetTranscriptResult = {
  loading: boolean;
  error: string | null;
  view: TranscriptView;
  source: string | null;
};

const UNTRANSCRIBED: TranscriptView = { status: 'untranscribed' };

export function useAssetTranscript(
  brandId: string,
  assetId: string,
  enabled: boolean,
): UseAssetTranscriptResult {
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<TranscriptView>(UNTRANSCRIBED);
  const [source, setSource] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ brandId, assetId });
    fetch(`/api/library/transcript?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Transcript request failed (${response.status})`);
        return responseSchema.parse(await response.json());
      })
      .then((payload) => {
        if (cancelled) return;
        setView(
          transcriptView({
            transcript: payload.transcript,
            transcriptSegments: payload.transcriptSegments,
          }),
        );
        setSource(payload.transcriptSource);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load the transcript');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [brandId, assetId, enabled]);

  return { loading, error, view, source };
}
