import {
  type ViralityScore,
  type ViralityScoreResponse,
  type ViralitySubjectType,
  viralityScoreResponseSchema,
} from '@continuum/contracts';
import { request } from '@/lib/api/http';

// Browser -> Backend on-demand hook scoring. Calls POST /api/virality/score and
// returns the brand-grounded virality score (0-100 + component breakdown). The
// prediction is recorded server-side for calibration; the caller just renders it.
export async function scoreHookForBrand(params: {
  brandId: string;
  hookText: string;
  subjectType?: ViralitySubjectType;
  subjectRef?: string | null;
  signal?: AbortSignal;
}): Promise<ViralityScore> {
  const response = await request<ViralityScoreResponse>({
    path: '/api/virality/score',
    method: 'POST',
    body: {
      brandId: params.brandId,
      hookText: params.hookText,
      ...(params.subjectType ? { subjectType: params.subjectType } : {}),
      ...(params.subjectRef ? { subjectRef: params.subjectRef } : {}),
    },
    schema: viralityScoreResponseSchema,
    signal: params.signal,
  });
  return response.score;
}
