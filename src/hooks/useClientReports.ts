'use client';

import {
  type ClientReportDetailResponse,
  type ClientReportListResponse,
  type ClientReportShareResponse,
  type ClientReportTargetsResponse,
  type ClientReportTargetsUpdate,
  clientReportDetailResponseSchema,
  clientReportListResponseSchema,
  clientReportShareResponseSchema,
  clientReportTargetsResponseSchema,
} from '@continuum/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getApiBaseUrl } from '@/lib/api/config';
import { assertOk, markFetchFailure } from '@/lib/api/errors';
import { http } from '@/lib/api/http';
import { backendTimeoutPolicy, fetchWithTimeout } from '@/lib/api/timeout';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';

// Performance → Reports: the weekly client report the Backend drafts every Monday
// (Continuum-Backend App/modules/clientReport).

const listKey = (brandId: string) => ['client-reports', brandId] as const;
const detailKey = (brandId: string, id: string | null) => ['client-reports', brandId, id] as const;
const targetsKey = (brandId: string, month: string | null) =>
  ['client-report-targets', brandId, month] as const;
const brandQuery = (brandId: string) => `brandId=${encodeURIComponent(brandId)}`;

/** A live read of the platforms: a large account takes most of a minute. */
const GENERATE_TIMEOUT_MS = 150_000;

export function useClientReports(brandId: string) {
  return useQuery<ClientReportListResponse>({
    queryKey: listKey(brandId),
    queryFn: () =>
      http.request({
        path: `/api/client-reports?${brandQuery(brandId)}`,
        schema: clientReportListResponseSchema,
      }),
    staleTime: 60_000,
  });
}

export function useClientReport(brandId: string, id: string | null) {
  return useQuery<ClientReportDetailResponse>({
    queryKey: detailKey(brandId, id),
    queryFn: () =>
      http.request({
        path: `/api/client-reports/${id}?${brandQuery(brandId)}`,
        schema: clientReportDetailResponseSchema,
      }),
    enabled: Boolean(id),
    staleTime: 5 * 60_000,
  });
}

export function useClientReportTargets(brandId: string, month: string | null) {
  return useQuery<ClientReportTargetsResponse>({
    queryKey: targetsKey(brandId, month),
    queryFn: () =>
      http.request({
        path: `/api/client-reports/targets?${brandQuery(brandId)}&month=${month}`,
        schema: clientReportTargetsResponseSchema,
      }),
    enabled: Boolean(month),
  });
}

export function useClientReportActions(brandId: string) {
  const queryClient = useQueryClient();
  const refresh = (detail: ClientReportDetailResponse) => {
    queryClient.setQueryData(detailKey(brandId, detail.summary.id), detail);
    void queryClient.invalidateQueries({ queryKey: listKey(brandId) });
  };
  return {
    generate: useMutation<ClientReportDetailResponse, Error, void>({
      mutationFn: () =>
        http.request({
          path: `/api/client-reports/generate?${brandQuery(brandId)}`,
          method: 'POST',
          schema: clientReportDetailResponseSchema,
          timeoutMs: GENERATE_TIMEOUT_MS,
        }),
      onSuccess: refresh,
    }),
    review: useMutation<ClientReportDetailResponse, Error, string>({
      mutationFn: (id) =>
        http.request({
          path: `/api/client-reports/${id}/review?${brandQuery(brandId)}`,
          method: 'POST',
          schema: clientReportDetailResponseSchema,
        }),
      onSuccess: refresh,
    }),
    /** Back to draft: every share link of the report stops opening. */
    withdraw: useMutation<ClientReportDetailResponse, Error, string>({
      mutationFn: (id) =>
        http.request({
          path: `/api/client-reports/${id}/withdraw?${brandQuery(brandId)}`,
          method: 'POST',
          schema: clientReportDetailResponseSchema,
        }),
      onSuccess: refresh,
    }),
    share: useMutation<ClientReportShareResponse, Error, string>({
      mutationFn: (id) =>
        http.request({
          path: `/api/client-reports/${id}/share?${brandQuery(brandId)}`,
          method: 'POST',
          body: { days: 14 },
          schema: clientReportShareResponseSchema,
        }),
    }),
    saveTargets: useMutation<ClientReportTargetsResponse, Error, ClientReportTargetsUpdate>({
      mutationFn: (update) =>
        http.request({
          path: `/api/client-reports/targets?${brandQuery(brandId)}`,
          method: 'PUT',
          body: update,
          schema: clientReportTargetsResponseSchema,
        }),
      onSuccess: (_, update) =>
        void queryClient.invalidateQueries({ queryKey: ['client-report-targets', brandId] }),
    }),
  };
}

/** The share link the Backend signed, on the Backend's own origin. */
export const shareUrlOf = (share: ClientReportShareResponse): string =>
  `${getApiBaseUrl()}${share.path}`;

/** The printable page, read with the session, for the browser's print dialog (Save as PDF). */
export async function fetchClientReportHtml(brandId: string, id: string): Promise<string> {
  const token = await getBrowserAccessToken();
  const response = await fetchWithTimeout(backendTimeoutPolicy)(
    `${getApiBaseUrl()}/api/client-reports/${id}/html?${brandQuery(brandId)}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  ).catch((error: unknown) => {
    throw markFetchFailure(error);
  });
  await assertOk(response);
  return response.text();
}
