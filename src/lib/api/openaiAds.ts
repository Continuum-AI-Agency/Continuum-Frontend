'use client';

/**
 * The Frontend's whole OpenAI Ads surface: connect, read, and the writes the campaign
 * canvas makes.
 *
 * Every response is parsed through the shared contract schema, so a Backend that starts
 * returning a different shape fails here rather than three components later. Every write
 * names its brand and ad account — the Backend resolves the key from them and has no
 * ambient account to fall back on.
 */

import {
  type OpenAiAdsAccountResponse,
  type OpenAiAdsAd,
  type OpenAiAdsAdCreateRequest,
  type OpenAiAdsAdGroup,
  type OpenAiAdsAdGroupCreateRequest,
  type OpenAiAdsAdGroupUpdateRequest,
  type OpenAiAdsAdUpdateRequest,
  type OpenAiAdsCampaign,
  type OpenAiAdsCampaignCreateRequest,
  type OpenAiAdsCampaignTree,
  type OpenAiAdsCampaignUpdateRequest,
  type OpenAiAdsConnectResponse,
  type OpenAiAdsEntityKind,
  type OpenAiAdsStateAction,
  openAiAdsAccountResponseSchema,
  openAiAdsAdGroupSchema,
  openAiAdsAdSchema,
  openAiAdsCampaignListSchema,
  openAiAdsCampaignSchema,
  openAiAdsCampaignTreeSchema,
  openAiAdsConnectResponseSchema,
  openAiAdsGeoSearchResponseSchema,
  openAiAdsInsightListSchema,
} from '@continuum/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { http } from '@/lib/api/http';

export type OpenAiAdsScope = { brandId: string; adAccountId: string };

const scopeQuery = (scope: OpenAiAdsScope, extra: Record<string, string | number> = {}) => {
  const params = new URLSearchParams({
    brandId: scope.brandId,
    adAccountId: scope.adAccountId,
    ...Object.fromEntries(Object.entries(extra).map(([key, value]) => [key, String(value)])),
  });
  return params.toString();
};

// -- connection ---------------------------------------------------------------

const brandAccountsSchema = z.object({
  accounts: z.array(
    z.object({
      adAccountId: z.string(),
      name: z.string().nullable(),
      integrationId: z.string(),
    }),
  ),
});
export type OpenAiAdsBrandAccount = z.infer<typeof brandAccountsSchema>['accounts'][number];

export async function connectOpenAiAds(input: {
  apiKey: string;
  brandId: string;
}): Promise<OpenAiAdsConnectResponse> {
  return http.request<OpenAiAdsConnectResponse>({
    path: '/integrations/openai/connect',
    method: 'POST',
    body: input,
    schema: openAiAdsConnectResponseSchema,
    cache: 'no-store',
  });
}

/** The paste-your-key mutation. The key is sent once and never comes back. */
export function useConnectOpenAiAds() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: connectOpenAiAds,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['openai-ads', 'accounts', variables.brandId],
      });
    },
  });
}

export function useOpenAiAdAccounts(brandId: string | null) {
  return useQuery({
    queryKey: ['openai-ads', 'accounts', brandId],
    enabled: Boolean(brandId),
    queryFn: () =>
      http.request<z.infer<typeof brandAccountsSchema>>({
        path: `/paid/openai/accounts?brandId=${encodeURIComponent(brandId ?? '')}`,
        schema: brandAccountsSchema,
        cache: 'no-store',
      }),
  });
}

/**
 * Account metadata plus `servable`. The flag is the whole reason this is fetched before a
 * launch: an account whose brand review is not approved cannot deliver, and the canvas
 * says so instead of offering an activate that quietly does nothing.
 */
export function useOpenAiAdAccount(scope: Partial<OpenAiAdsScope>) {
  const ready = Boolean(scope.brandId && scope.adAccountId);
  return useQuery({
    queryKey: ['openai-ads', 'account', scope.brandId, scope.adAccountId],
    enabled: ready,
    queryFn: () =>
      http.request<OpenAiAdsAccountResponse>({
        path: `/paid/openai/account?${scopeQuery(scope as OpenAiAdsScope)}`,
        schema: openAiAdsAccountResponseSchema,
        cache: 'no-store',
      }),
  });
}

export function useResolveOpenAiFavicon(scope: Partial<OpenAiAdsScope>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { imageUrl: string; name?: string }) =>
      http.request<OpenAiAdsAccountResponse>({
        path: '/paid/openai/account/favicon',
        method: 'POST',
        body: { ...scope, ...input },
        schema: openAiAdsAccountResponseSchema,
        cache: 'no-store',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['openai-ads', 'account', scope.brandId, scope.adAccountId],
      });
    },
  });
}

// -- reads --------------------------------------------------------------------

export function useOpenAiCampaigns(scope: Partial<OpenAiAdsScope>) {
  const ready = Boolean(scope.brandId && scope.adAccountId);
  return useQuery({
    queryKey: ['openai-ads', 'campaigns', scope.brandId, scope.adAccountId],
    enabled: ready,
    queryFn: () =>
      http.request<z.infer<typeof openAiAdsCampaignListSchema>>({
        path: `/paid/openai/campaigns?${scopeQuery(scope as OpenAiAdsScope)}`,
        schema: openAiAdsCampaignListSchema,
        cache: 'no-store',
      }),
  });
}

export async function fetchOpenAiCampaignTree(scope: OpenAiAdsScope, campaignId: string) {
  return http.request<OpenAiAdsCampaignTree>({
    path: `/paid/openai/campaigns/${encodeURIComponent(campaignId)}/tree?${scopeQuery(scope)}`,
    schema: openAiAdsCampaignTreeSchema,
    cache: 'no-store',
  });
}

export async function searchOpenAiLocations(scope: OpenAiAdsScope, query: string) {
  return http.request<z.infer<typeof openAiAdsGeoSearchResponseSchema>>({
    path: `/paid/openai/geo?${scopeQuery(scope, { q: query })}`,
    schema: openAiAdsGeoSearchResponseSchema,
    cache: 'no-store',
  });
}

export function useOpenAiInsights(
  scope: Partial<OpenAiAdsScope>,
  params: {
    scope?: 'ad_account' | 'campaign' | 'ad_group' | 'ad';
    entityId?: string;
    limit?: number;
  } = {},
) {
  const ready = Boolean(scope.brandId && scope.adAccountId);
  return useQuery({
    queryKey: ['openai-ads', 'insights', scope.brandId, scope.adAccountId, params],
    enabled: ready,
    queryFn: () =>
      http.request<z.infer<typeof openAiAdsInsightListSchema>>({
        path: `/paid/openai/insights?${scopeQuery(scope as OpenAiAdsScope, {
          scope: params.scope ?? 'ad_account',
          ...(params.entityId ? { entityId: params.entityId } : {}),
          limit: params.limit ?? 90,
        })}`,
        schema: openAiAdsInsightListSchema,
        cache: 'no-store',
      }),
  });
}

// -- writes -------------------------------------------------------------------

export async function uploadOpenAiImage(scope: OpenAiAdsScope, imageUrl: string): Promise<string> {
  // Annotated: `request<TResponse = unknown>` only infers TResponse from the expected
  // type, and a bare `const` gives it none.
  const result = await http.request<{ file_id: string }>({
    path: '/paid/openai/uploads',
    method: 'POST',
    body: { ...scope, image_url: imageUrl },
    schema: z.object({ file_id: z.string() }),
    cache: 'no-store',
  });
  return result.file_id;
}

export async function createOpenAiCampaign(
  scope: OpenAiAdsScope,
  body: OpenAiAdsCampaignCreateRequest,
): Promise<OpenAiAdsCampaign> {
  return http.request<OpenAiAdsCampaign>({
    path: '/paid/openai/campaigns',
    method: 'POST',
    body: { ...scope, ...body },
    schema: openAiAdsCampaignSchema,
    cache: 'no-store',
  });
}

export async function updateOpenAiCampaign(
  scope: OpenAiAdsScope,
  campaignId: string,
  body: OpenAiAdsCampaignUpdateRequest,
): Promise<OpenAiAdsCampaign> {
  return http.request<OpenAiAdsCampaign>({
    path: `/paid/openai/campaigns/${encodeURIComponent(campaignId)}`,
    method: 'POST',
    body: { ...scope, ...body },
    schema: openAiAdsCampaignSchema,
    cache: 'no-store',
  });
}

export async function createOpenAiAdGroup(
  scope: OpenAiAdsScope,
  body: OpenAiAdsAdGroupCreateRequest,
): Promise<OpenAiAdsAdGroup> {
  return http.request<OpenAiAdsAdGroup>({
    path: '/paid/openai/ad-groups',
    method: 'POST',
    body: { ...scope, ...body },
    schema: openAiAdsAdGroupSchema,
    cache: 'no-store',
  });
}

export async function updateOpenAiAdGroup(
  scope: OpenAiAdsScope,
  adGroupId: string,
  body: OpenAiAdsAdGroupUpdateRequest,
): Promise<OpenAiAdsAdGroup> {
  return http.request<OpenAiAdsAdGroup>({
    path: `/paid/openai/ad-groups/${encodeURIComponent(adGroupId)}`,
    method: 'POST',
    body: { ...scope, ...body },
    schema: openAiAdsAdGroupSchema,
    cache: 'no-store',
  });
}

export async function createOpenAiAd(
  scope: OpenAiAdsScope,
  body: OpenAiAdsAdCreateRequest,
): Promise<OpenAiAdsAd> {
  return http.request<OpenAiAdsAd>({
    path: '/paid/openai/ads',
    method: 'POST',
    body: { ...scope, ...body },
    schema: openAiAdsAdSchema,
    cache: 'no-store',
  });
}

export async function updateOpenAiAd(
  scope: OpenAiAdsScope,
  adId: string,
  body: OpenAiAdsAdUpdateRequest,
): Promise<OpenAiAdsAd> {
  return http.request<OpenAiAdsAd>({
    path: `/paid/openai/ads/${encodeURIComponent(adId)}`,
    method: 'POST',
    body: { ...scope, ...body },
    schema: openAiAdsAdSchema,
    cache: 'no-store',
  });
}

/**
 * The only call that can make something serve, and the only one that can archive it.
 * Kept separate from every update path so "what can spend money?" has one answer.
 */
export async function setOpenAiEntityState(
  scope: OpenAiAdsScope,
  kind: OpenAiAdsEntityKind,
  entityId: string,
  action: OpenAiAdsStateAction,
): Promise<unknown> {
  return http.request({
    path: `/paid/openai/${kind}/${encodeURIComponent(entityId)}/${action}`,
    method: 'POST',
    body: scope,
    cache: 'no-store',
  });
}
