'use client';

import type { BrandStyle } from '@continuum/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type BrandStyleDecision, decideBrandStyle, listBrandStyles } from '@/lib/api/styles';

export const brandStylesQueryKey = (brandId: string) => ['brand-styles', brandId] as const;

const DECIDED: Record<BrandStyleDecision, BrandStyle['status']> = {
  approve: 'approved',
  retire: 'retired',
};

/** The brand's own styles (drafts and approved; retired ones leave the shelf) and the decision a
 *  brand user makes on them, applied optimistically and put back if the Backend refuses. */
export function useBrandStyles(brandId: string) {
  const queryClient = useQueryClient();
  const queryKey = brandStylesQueryKey(brandId);

  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => listBrandStyles(brandId, signal),
    enabled: brandId.length > 0,
  });

  const decision = useMutation({
    mutationFn: ({ styleId, decision }: { styleId: string; decision: BrandStyleDecision }) =>
      decideBrandStyle(brandId, styleId, decision),
    onMutate: async ({ styleId, decision }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient
        .getQueryData<BrandStyle[]>(queryKey)
        ?.find((style) => style.id === styleId);
      queryClient.setQueryData<BrandStyle[]>(queryKey, (styles) =>
        styles?.map((style) =>
          style.id === styleId ? { ...style, status: DECIDED[decision] } : style,
        ),
      );
      return { previous };
    },
    onError: (_error, { styleId }, context) => {
      const previous = context?.previous;
      if (!previous) return;
      queryClient.setQueryData<BrandStyle[]>(queryKey, (styles) =>
        styles?.map((style) => (style.id === styleId ? previous : style)),
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    styles: (query.data ?? []).filter((style) => style.status !== 'retired'),
    isLoading: query.isLoading,
    error: query.error,
    decide: decision.mutateAsync,
    pendingStyleId: decision.isPending ? decision.variables?.styleId : undefined,
  };
}
