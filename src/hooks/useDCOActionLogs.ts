'use client';

import { parseRuleActionLogResponse } from '@continuum/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadFailureMessage } from '@/lib/api/loadFailure';
import { fetchWithTimeout, supabaseTimeoutPolicy } from '@/lib/api/timeout';
import { DEFAULT_DATE_RANGE_DAYS, getDateRangeFromDays } from '@/lib/dco/dateRange';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type {
  ActionLog,
  ActionLogFilters,
  ActionLogResponse,
  ActionLogSort,
  AdAccountOption,
  CampaignOption,
} from '@/lib/types/dco';

interface UseDCOActionLogsOptions {
  brandId: string;
  metaAccountId?: string;
  initialPageSize?: number;
  initialDateRangeDays?: number;
}

interface UseDCOActionLogsReturn {
  logs: ActionLog[];
  isLoading: boolean;
  /** Why the logs could not be read, as a sentence; null while fine. */
  error: string | null;
  /** Why the campaign / ad-account selector lists could not be read. A failed list is not an
   *  empty account: without this a 500 read as "no campaigns". */
  selectorError: string | null;
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  filters: ActionLogFilters;
  sort: ActionLogSort;
  campaigns: CampaignOption[];
  adAccounts: AdAccountOption[];
  isLoadingCampaigns: boolean;
  isLoadingAdAccounts: boolean;
  setFilters: (filters: Partial<ActionLogFilters>) => void;
  setSort: (sort: ActionLogSort) => void;
  goToPage: (page: number) => void;
  refresh: () => void;
}

const DEFAULT_PAGE_SIZE = 20;

/** The three edge reads this hook makes, on the shared read bound (`supabaseTimeoutPolicy`). */
const edgeFetch = fetchWithTimeout(supabaseTimeoutPolicy);

/** A non-2xx response as an error that carries its status and, when the body is JSON with an
 *  `error` sentence, that sentence — never the HTML of a gateway page. */
async function responseError(response: Response): Promise<Error & { status: number }> {
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => null);
  const sentence =
    body && typeof body === 'object' && typeof Reflect.get(body, 'error') === 'string'
      ? (Reflect.get(body, 'error') as string)
      : `${response.status} ${response.statusText}`;
  return Object.assign(new Error(sentence), { status: response.status });
}

function areFiltersEqual(left: ActionLogFilters, right: ActionLogFilters): boolean {
  return (
    left.metaAccountId === right.metaAccountId &&
    left.campaignId === right.campaignId &&
    left.actionType === right.actionType &&
    left.status === right.status &&
    left.scopeType === right.scopeType &&
    left.dateFrom === right.dateFrom &&
    left.dateTo === right.dateTo
  );
}

function areSortEqual(left: ActionLogSort, right: ActionLogSort): boolean {
  return left.sortBy === right.sortBy && left.sortOrder === right.sortOrder;
}

export function useDCOActionLogs({
  brandId,
  metaAccountId: initialMetaAccountId,
  initialPageSize = DEFAULT_PAGE_SIZE,
  initialDateRangeDays = DEFAULT_DATE_RANGE_DAYS,
}: UseDCOActionLogsOptions): UseDCOActionLogsReturn {
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);
  const [adAccountsError, setAdAccountsError] = useState<string | null>(null);

  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: initialPageSize,
    totalCount: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false,
  });

  const [filters, setFiltersState] = useState<ActionLogFilters>({
    metaAccountId: initialMetaAccountId,
  });

  const [sort, setSortState] = useState<ActionLogSort>({
    sortBy: 'occurred_at',
    sortOrder: 'desc',
  });
  const filtersRef = useRef(filters);
  const sortRef = useRef(sort);

  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [adAccounts, setAdAccounts] = useState<AdAccountOption[]>([]);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(false);
  const [isLoadingAdAccounts, setIsLoadingAdAccounts] = useState(false);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    sortRef.current = sort;
  }, [sort]);

  const getDefaultDateRange = useCallback(() => {
    return getDateRangeFromDays(initialDateRangeDays);
  }, [initialDateRangeDays]);

  const fetchCampaigns = useCallback(async () => {
    const dateRange = getDefaultDateRange();
    const selectedMetaAccountId = filters.metaAccountId;
    if (!brandId || !selectedMetaAccountId) {
      setCampaigns([]);
      return;
    }

    setIsLoadingCampaigns(true);
    setCampaignsError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) return;

      const params = new URLSearchParams({
        brandId,
        metaAccountId: selectedMetaAccountId,
        dateFrom: filters.dateFrom ?? dateRange.dateFrom,
        dateTo: filters.dateTo ?? dateRange.dateTo,
      });

      const response = await edgeFetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/fetch-campaigns-for-selector?${params}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );

      if (!response.ok) throw await responseError(response);
      const result: unknown = await response.json();
      const list = result && typeof result === 'object' ? Reflect.get(result, 'campaigns') : null;
      setCampaigns(Array.isArray(list) ? (list as CampaignOption[]) : []);
    } catch (err) {
      console.error('[useDCOActionLogs] fetch campaigns error:', err);
      setCampaignsError(loadFailureMessage('the campaign list', err));
    } finally {
      setIsLoadingCampaigns(false);
    }
  }, [brandId, filters.dateFrom, filters.dateTo, filters.metaAccountId, getDefaultDateRange]);

  const fetchAdAccounts = useCallback(async () => {
    if (!brandId) {
      setAdAccounts([]);
      return;
    }

    const dateRange = getDefaultDateRange();
    setIsLoadingAdAccounts(true);
    setAdAccountsError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) return;

      const params = new URLSearchParams({
        brandId,
        dateFrom: filters.dateFrom ?? dateRange.dateFrom,
        dateTo: filters.dateTo ?? dateRange.dateTo,
      });

      const response = await edgeFetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/fetch-ad-accounts-for-selector?${params}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );

      if (!response.ok) throw await responseError(response);
      const result: unknown = await response.json();
      const list = result && typeof result === 'object' ? Reflect.get(result, 'accounts') : null;
      setAdAccounts(Array.isArray(list) ? (list as AdAccountOption[]) : []);
    } catch (err) {
      console.error('[useDCOActionLogs] fetch ad accounts error:', err);
      setAdAccountsError(loadFailureMessage('the ad account list', err));
    } finally {
      setIsLoadingAdAccounts(false);
    }
  }, [brandId, filters.dateFrom, filters.dateTo, getDefaultDateRange]);

  useEffect(() => {
    fetchCampaigns();
    fetchAdAccounts();
  }, [fetchCampaigns, fetchAdAccounts]);

  const fetchLogs = useCallback(async () => {
    if (!brandId) return;

    setIsLoading(true);
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('No authentication session');
      }

      const dateRange = getDefaultDateRange();

      const params = new URLSearchParams({
        brandId,
        page: pagination.page.toString(),
        pageSize: pagination.pageSize.toString(),
        sortBy: sort.sortBy,
        sortOrder: sort.sortOrder,
        dateFrom: filters.dateFrom ?? dateRange.dateFrom,
        dateTo: filters.dateTo ?? dateRange.dateTo,
      });

      if (filters.campaignId) params.set('campaignId', filters.campaignId);
      if (filters.metaAccountId) params.set('metaAccountId', filters.metaAccountId);
      if (filters.actionType) params.set('actionType', filters.actionType);
      if (filters.status) params.set('status', filters.status);
      if (filters.scopeType) params.set('scopeType', filters.scopeType);

      const response = await edgeFetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/fetch-rule-action-logs?${params}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) throw await responseError(response);

      // Validated at the boundary: a bad envelope is a failed read, a bad row is a dropped row.
      // Unvalidated, one missing key in one row took the whole /scale route to its boundary.
      const parsed = parseRuleActionLogResponse(await response.json().catch(() => null));
      if (!parsed.ok) {
        console.error('[useDCOActionLogs] unexpected action-log response', parsed.issue);
        throw Object.assign(new Error('the action logs came back in an unexpected shape'), {
          status: 0,
        });
      }
      if (parsed.read.dropped.length > 0) {
        console.warn('[useDCOActionLogs] dropped malformed action-log rows', parsed.read.dropped);
      }
      const read: ActionLogResponse = {
        data: parsed.read.logs,
        pagination: parsed.read.pagination ?? {
          page: pagination.page,
          pageSize: pagination.pageSize,
          totalCount: parsed.read.logs.length,
          totalPages: parsed.read.logs.length > 0 ? 1 : 0,
          hasNextPage: false,
          hasPrevPage: pagination.page > 1,
        },
      };

      setLogs(read.data);
      setPagination((prev) => ({
        ...prev,
        ...read.pagination,
      }));
    } catch (err) {
      setError(loadFailureMessage('the action logs', err));
      console.error('[useDCOActionLogs] fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [brandId, pagination.page, pagination.pageSize, sort, filters, getDefaultDateRange]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const setFilters = useCallback((newFilters: Partial<ActionLogFilters>) => {
    const previous = filtersRef.current;
    const next = { ...previous, ...newFilters };
    if (areFiltersEqual(previous, next)) return;

    setFiltersState(next);
    setPagination((prev) => (prev.page === 1 ? prev : { ...prev, page: 1 }));
  }, []);

  const setSort = useCallback((newSort: ActionLogSort) => {
    if (areSortEqual(sortRef.current, newSort)) return;

    setSortState(newSort);
    setPagination((prev) => (prev.page === 1 ? prev : { ...prev, page: 1 }));
  }, []);

  const goToPage = useCallback((page: number) => {
    setPagination((prev) => ({ ...prev, page }));
  }, []);

  const refresh = useCallback(() => {
    fetchLogs();
  }, [fetchLogs]);

  return {
    logs,
    isLoading,
    error,
    selectorError: campaignsError ?? adAccountsError,
    pagination,
    filters,
    sort,
    campaigns,
    adAccounts,
    isLoadingCampaigns,
    isLoadingAdAccounts,
    setFilters,
    setSort,
    goToPage,
    refresh,
  };
}
