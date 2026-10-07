import {
  type ListeningFeedResponse,
  type ListeningKeyword,
  listeningFeedResponseSchema,
} from '@continuum/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { request } from '@/lib/api/http';

const listeningKey = (brandId: string) => ['listening', brandId] as const;

export function useListening(brandId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: listeningKey(brandId ?? ''),
    queryFn: () =>
      request<ListeningFeedResponse>({
        path: `/api/listening?brand_id=${encodeURIComponent(brandId as string)}`,
        schema: listeningFeedResponseSchema,
        cache: 'no-store',
      }),
    enabled: Boolean(brandId) && enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** Saves the keyword list; the Backend starts listening for new ones right away. */
export function useSaveListeningKeywords(brandId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (keywords: ListeningKeyword[]) =>
      request<ListeningFeedResponse>({
        path: '/api/listening/keywords',
        method: 'PUT',
        body: { brand_id: brandId, keywords },
        schema: listeningFeedResponseSchema,
      }),
    onSuccess: (feed) => queryClient.setQueryData(listeningKey(brandId), feed),
  });
}
