"use client";

import { useState, useEffect, useCallback } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ActionLog, ActionLogResponse, ActionLogFilters, ActionLogSort, CampaignOption, AdAccountOption } from "@/lib/types/dco";

interface UseDCOActionLogsOptions {
  brandId: string;
  metaAccountId?: string;
  initialPageSize?: number;
  initialDateRangeHours?: number;
}

interface UseDCOActionLogsReturn {
  logs: ActionLog[];
  isLoading: boolean;
  error: string | null;
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
const DEFAULT_DATE_RANGE_HOURS = 168; // 7 days

export function useDCOActionLogs({
  brandId,
  metaAccountId: initialMetaAccountId,
  initialPageSize = DEFAULT_PAGE_SIZE,
  initialDateRangeHours = DEFAULT_DATE_RANGE_HOURS,
}: UseDCOActionLogsOptions): UseDCOActionLogsReturn {
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
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
    sortBy: "occurred_at",
    sortOrder: "desc",
  });

  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [adAccounts, setAdAccounts] = useState<AdAccountOption[]>([]);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(false);
  const [isLoadingAdAccounts, setIsLoadingAdAccounts] = useState(false);

  const getDefaultDateRange = useCallback(() => {
    const now = new Date();
    const from = new Date(now.getTime() - initialDateRangeHours * 60 * 60 * 1000);
    return {
      dateFrom: from.toISOString(),
      dateTo: now.toISOString(),
    };
  }, [initialDateRangeHours]);

  const fetchCampaigns = useCallback(async () => {
    if (!brandId || !initialMetaAccountId) {
      setCampaigns([]);
      return;
    }

    setIsLoadingCampaigns(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) return;

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/fetch-campaigns-for-selector?brandId=${brandId}&metaAccountId=${initialMetaAccountId}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );

      if (response.ok) {
        const result = await response.json();
        setCampaigns(result.campaigns || []);
      }
    } catch (err) {
      console.error("[useDCOActionLogs] fetch campaigns error:", err);
    } finally {
      setIsLoadingCampaigns(false);
    }
  }, [brandId, initialMetaAccountId]);

  const fetchAdAccounts = useCallback(async () => {
    if (!brandId) {
      setAdAccounts([]);
      return;
    }

    setIsLoadingAdAccounts(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) return;

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/fetch-ad-accounts-for-selector?brandId=${brandId}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );

      if (response.ok) {
        const result = await response.json();
        setAdAccounts(result.accounts || []);
      }
    } catch (err) {
      console.error("[useDCOActionLogs] fetch ad accounts error:", err);
    } finally {
      setIsLoadingAdAccounts(false);
    }
  }, [brandId]);

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
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error("No authentication session");
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

      if (filters.campaignId) params.set("campaignId", filters.campaignId);
      if (filters.metaAccountId) params.set("metaAccountId", filters.metaAccountId);
      if (filters.actionType) params.set("actionType", filters.actionType);
      if (filters.status) params.set("status", filters.status);
      if (filters.scopeType) params.set("scopeType", filters.scopeType);

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/fetch-rule-action-logs?${params}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error ?? "Failed to fetch action logs");
      }

      const result: ActionLogResponse = await response.json();
      
      setLogs(result.data);
      setPagination(prev => ({
        ...prev,
        ...result.pagination,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      console.error("[useDCOActionLogs] fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [brandId, pagination.page, pagination.pageSize, sort, filters, getDefaultDateRange]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const setFilters = useCallback((newFilters: Partial<ActionLogFilters>) => {
    setFiltersState(prev => ({ ...prev, ...newFilters }));
    setPagination(prev => ({ ...prev, page: 1 }));
  }, []);

  const setSort = useCallback((newSort: ActionLogSort) => {
    setSortState(newSort);
    setPagination(prev => ({ ...prev, page: 1 }));
  }, []);

  const goToPage = useCallback((page: number) => {
    setPagination(prev => ({ ...prev, page }));
  }, []);

  const refresh = useCallback(() => {
    fetchLogs();
  }, [fetchLogs]);

  return {
    logs,
    isLoading,
    error,
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
