'use client';

import {
  type AdminAccessUpdateRequest,
  type AdminAccessUpdateResponse,
  type AdminBrandAccess,
  adminAccessUpdateResponseSchema,
  type ProductCode,
} from '@continuum/contracts';
import {
  ArrowRightLeft,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Globe2,
  History,
  Library,
  Loader2,
  Lock,
  Mail,
  PlayCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  UserCog,
  XCircle,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { AdminActionConfirmation } from '@/components/admin/AdminActionConfirmation';
import {
  ADMIN_AUDIT_ACTIONS,
  auditActorLabel,
  brandsWithWorkflows,
  buildAdminAuditRequestBody,
  buildAdminPaginationRange,
  buildAdminTabParams,
  buildAdminUserListPaginationParams,
  buildAdminUserListSearchParams,
  canBulkTransfer,
  describeAccessError,
  describeWorkflowNames,
  formatAuditActionLabel,
  formatBrandDisambiguationLabel,
  formatDate,
  groupPermissionsByUserId,
  membershipLabel,
  resolveAdminTab,
} from '@/components/admin/adminUserListUtils';
import type {
  AdminAuditLogEntry,
  AdminAuditPagination,
  AdminBrandOption,
  AdminPagination,
  AdminUser,
  AdminWorkflowLibraryRow,
  AdminWorkflowTransferResult,
  PermissionRow,
} from '@/components/admin/adminUserTypes';
import { BrandAccessEditor } from '@/components/admin/BrandAccessEditor';
import { BrandTransferCombobox } from '@/components/admin/BrandTransferCombobox';
import { BrandsTab } from '@/components/admin/tabs/BrandsTab';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/ToastProvider';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DEFAULT_SEARCH_DEBOUNCE_MS, useDebounce } from '@/hooks/useDebounce';
import { LocalizedUiError, useUiErrorMessage } from '@/i18n/errors';
import { useRouter } from '@/i18n/navigation';
import { fuzzyMatches } from '@/lib/search/fuzzy';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { readEdgeErrorMessage } from '@/lib/supabase/edgeErrorMessage';

type Props = {
  users: AdminUser[];
  permissions: PermissionRow[];
  pagination: AdminPagination;
  searchQuery: string;
  /** billing-cutover: false while billing is not exposed — the Tier control stays in charge. */
  billingLive?: boolean;
};

type PendingActions = Record<string, boolean>;

type FullAccessResult = { brandId: string; brandName: string; ok: boolean; message?: string };

type ImpersonationDialogState = {
  email: string;
  link: string;
};

type AdminWorkflowResponse = {
  workflows?: AdminWorkflowLibraryRow[];
  brands?: AdminBrandOption[];
  workflow?: AdminWorkflowLibraryRow;
};

type AdminWorkflowMoveResponse = {
  results?: AdminWorkflowTransferResult[];
};

type BulkTransferOutcome = {
  workflowId: string;
  workflowName: string;
  status: 'success' | 'failed';
  message?: string;
  mediaSummary?: string;
};

function describeMediaMoved(
  assets: number | undefined,
  versions: number | undefined,
  translate: ReturnType<typeof useTranslations<'admin'>>,
): string | undefined {
  return assets ? translate('m_278e9b289b', { assets, versions: versions ?? 0 }) : undefined;
}

const GLOBAL_LIBRARY_BRAND_OPTION: AdminBrandOption = {
  id: 'global',
  brand_name: 'Global workflow library',
  tier: 0,
  active: true,
  ownerEmail: null,
};
const SEARCH_DEBOUNCE_MS = DEFAULT_SEARCH_DEBOUNCE_MS;

type AdminAuditResponse = {
  entries?: AdminAuditLogEntry[];
  pagination?: AdminAuditPagination;
};

const AUDIT_PAGE_SIZE = 50;
const AUDIT_ACTION_ALL = 'all';
const AUDIT_BRAND_ALL = 'all';
const AUDIT_ALL_BRANDS_OPTION: AdminBrandOption = {
  id: AUDIT_BRAND_ALL,
  brand_name: 'All brands',
  tier: 0,
  active: true,
  ownerEmail: null,
};

// Every filter the audit reader accepts. Passed as one object so a new filter
// cannot be added to the UI and silently dropped from a call site.
type AuditFilters = {
  action: string;
  brandProfileId: string;
  search: string;
  actorQuery: string;
};

type FirstValueReportSmokeResponse = {
  status?: string;
  ok?: boolean;
  sent?: boolean;
  resendMessageId?: string | null;
  missing?: { reason?: string; details?: Record<string, unknown> };
  snapshot?: Record<string, unknown>;
  error?: string;
};

function getUserInitials(user: AdminUser) {
  return (user.name ?? user.email).slice(0, 2).toUpperCase();
}

function roleVariant(role: string | null) {
  if (role === 'owner') return 'default';
  if (role === 'admin') return 'secondary';
  return 'outline';
}

// Pretty-print an audit before/after/metadata jsonb value for the detail panel.
// Returns null for empty payloads (null/undefined or an empty object) so the
// caller can hide the block rather than render a bare "{}".
function formatAuditJson(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && Object.keys(value as Record<string, unknown>).length === 0) {
    return null;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function AdminUserList({
  users,
  permissions,
  pagination,
  searchQuery,
  billingLive = false,
}: Props) {
  const getUiErrorMessage = useUiErrorMessage();

  const uiText = useTranslations('admin');
  const uiLocale = useLocale();
  const { show } = useToast();
  const [isNavPending, startNavTransition] = useTransition();
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const activeTab = resolveAdminTab(searchParams.get('tab'));

  const [query, setQuery] = useState(searchQuery);
  const searchParamsRef = useRef(searchParamsString);
  const settledSearchQueryRef = useRef(searchQuery.trim());
  const lastRequestedQueryRef = useRef(searchQuery.trim());
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedUserId, setSelectedUserId] = useState(users[0]?.id ?? null);
  const [pendingActions, setPendingActions] = useState<PendingActions>({});
  const [tierOverrides, setTierOverrides] = useState<Record<string, string>>({});
  // Keyed by brand: several of the selected user's memberships can share one brand.
  const [accessOverrides, setAccessOverrides] = useState<Record<string, AdminBrandAccess>>({});
  const accessInFlight = useRef(new Set<string>());
  const [fullAccessResults, setFullAccessResults] = useState<{
    userId: string;
    results: FullAccessResult[];
  } | null>(null);
  const [impersonationDialog, setImpersonationDialog] = useState<ImpersonationDialogState | null>(
    null,
  );

  const [brands, setBrands] = useState<AdminBrandOption[]>([]);
  const [isBrandLoading, setIsBrandLoading] = useState(false);
  const [sourceBrandId, setSourceBrandId] = useState('global');
  const [targetBrandId, setTargetBrandId] = useState('');
  const [workflowQuery, setWorkflowQuery] = useState('');
  const [workflows, setWorkflows] = useState<AdminWorkflowLibraryRow[]>([]);
  const [focusedWorkflowId, setFocusedWorkflowId] = useState<string | null>(null);
  const [checkedWorkflowIds, setCheckedWorkflowIds] = useState<Set<string>>(new Set());
  const [transferResults, setTransferResults] = useState<BulkTransferOutcome[] | null>(null);
  const [isWorkflowLoading, setIsWorkflowLoading] = useState(false);
  const [auditEntries, setAuditEntries] = useState<AdminAuditLogEntry[]>([]);
  const [isAuditLoading, setIsAuditLoading] = useState(false);
  const [auditPage, setAuditPage] = useState(1);
  const [auditActionFilter, setAuditActionFilter] = useState<string>(AUDIT_ACTION_ALL);
  const [auditBrandFilter, setAuditBrandFilter] = useState<string>(AUDIT_BRAND_ALL);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditActorQuery, setAuditActorQuery] = useState('');
  const [auditPagination, setAuditPagination] = useState<AdminAuditPagination | null>(null);
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);
  // Monotonic request id so a slow older audit fetch can't overwrite the state of
  // a newer one (rapid filter/page changes) or clear loading while a newer is pending.
  const auditRequestSeqRef = useRef(0);
  const [reportBrandId, setReportBrandId] = useState('');
  const [reportRecipientEmail, setReportRecipientEmail] = useState('');
  const [reportSmokeResult, setReportSmokeResult] = useState<FirstValueReportSmokeResponse | null>(
    null,
  );
  const [isReportSmokeLoading, setIsReportSmokeLoading] = useState(false);

  useEffect(() => {
    searchParamsRef.current = searchParamsString;
    settledSearchQueryRef.current = searchQuery.trim();
  }, [searchParamsString, searchQuery]);

  useEffect(() => {
    const syncQueryFromHistory = () => {
      const historyQuery = new URL(window.location.href).searchParams.get('query') ?? '';
      lastRequestedQueryRef.current = historyQuery.trim();
      setQuery(historyQuery);
    };

    window.addEventListener('popstate', syncQueryFromHistory);
    return () => window.removeEventListener('popstate', syncQueryFromHistory);
  }, []);

  useEffect(() => {
    setSelectedUserId(users[0]?.id ?? null);
  }, [pagination.page, searchQuery, users]);

  useEffect(() => {
    setTierOverrides({});
    setAccessOverrides({});
  }, [permissions]);

  const permissionsByUserId = useMemo(() => groupPermissionsByUserId(permissions), [permissions]);
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? users[0] ?? null;
  const selectedMemberships = selectedUser ? (permissionsByUserId.get(selectedUser.id) ?? []) : [];
  const visibleWorkflows = useMemo(
    () =>
      workflows.filter((workflow) =>
        fuzzyMatches([workflow.name, workflow.description], workflowQuery),
      ),
    [workflows, workflowQuery],
  );
  const focusedWorkflow = workflows.find((workflow) => workflow.id === focusedWorkflowId) ?? null;
  const checkedWorkflows = useMemo(
    () => workflows.filter((workflow) => checkedWorkflowIds.has(workflow.id)),
    [workflows, checkedWorkflowIds],
  );
  const bulkEligibility = useMemo(
    () => canBulkTransfer(checkedWorkflows, uiText),
    [checkedWorkflows, uiText],
  );
  const checkedWorkflowNamesLabel = useMemo(
    () =>
      describeWorkflowNames(
        checkedWorkflows.map((workflow) => workflow.name),
        5,
        uiText,
      ),
    [checkedWorkflows, uiText],
  );
  const allCheckedAreBrandScoped =
    checkedWorkflows.length > 0 &&
    checkedWorkflows.every((workflow) => workflow.visibility === 'brand');
  const allCheckedAreGlobalScoped =
    checkedWorkflows.length > 0 &&
    checkedWorkflows.every((workflow) => workflow.visibility === 'global');
  const brandFilterOptions = useMemo(
    () => [{ ...GLOBAL_LIBRARY_BRAND_OPTION, brand_name: uiText('m_061122128b') }, ...brands],
    [brands, uiText],
  );
  // Airtable #277 — a transfer DESTINATION has to be a brand with a Creative Studio.
  // Scoped to the destination picker on purpose: the two filter pickers above and below
  // it are for finding existing rows, where an empty brand is a legitimate thing to look
  // at and finding nothing is the answer.
  const transferTargetBrands = useMemo(() => brandsWithWorkflows(brands), [brands]);
  const auditBrandFilterOptions = useMemo(() => [AUDIT_ALL_BRANDS_OPTION, ...brands], [brands]);
  const debouncedAuditSearch = useDebounce(auditSearch);
  const debouncedAuditActor = useDebounce(auditActorQuery);
  // One filter object, one dependency. Every audit call site reads this, so a
  // refresh or a post-transfer reload cannot quietly use a stale filter set.
  const auditFilters = useMemo<AuditFilters>(
    () => ({
      action: auditActionFilter,
      brandProfileId: auditBrandFilter,
      search: debouncedAuditSearch,
      actorQuery: debouncedAuditActor,
    }),
    [auditActionFilter, auditBrandFilter, debouncedAuditSearch, debouncedAuditActor],
  );
  const allVisibleWorkflowsChecked =
    visibleWorkflows.length > 0 &&
    visibleWorkflows.every((workflow) => checkedWorkflowIds.has(workflow.id));

  const safePage =
    pagination.totalPages > 0 ? Math.min(pagination.page, pagination.totalPages) : pagination.page;
  const totalPages = Math.max(pagination.totalPages, 1);
  const totalCountLabel = pagination.totalCount.toLocaleString(uiLocale);
  const trimmedQuery = query.trim();
  const serverQueryActive = searchQuery.trim().length > 0;
  const isDirectoryUpdating = isNavPending || trimmedQuery !== searchQuery.trim();
  const totalLabelSuffix = serverQueryActive ? 'matches' : 'total';
  const paginationItems = useMemo(
    () => buildAdminPaginationRange({ currentPage: safePage, totalPages, siblingCount: 1 }),
    [safePage, totalPages],
  );

  const adminCount = useMemo(() => users.filter((user) => user.isAdmin).length, [users]);
  const ownerMemberships = useMemo(
    () => permissions.filter((permission) => permission.role === 'owner').length,
    [permissions],
  );
  const uniqueBrandCount = useMemo(
    () => new Set(permissions.map((permission) => permission.brand_profile_id)).size,
    [permissions],
  );

  function setActionPending(actionId: string, pending: boolean) {
    setPendingActions((prev) => {
      if (pending) return { ...prev, [actionId]: true };
      if (!prev[actionId]) return prev;
      const next = { ...prev };
      delete next[actionId];
      return next;
    });
  }

  function handlePageNavigation(event: React.MouseEvent<HTMLAnchorElement>, nextPage: number) {
    if (nextPage === pagination.page) return;
    if (event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
      return;
    event.preventDefault();
    startNavTransition(() => {
      const params = buildAdminUserListPaginationParams(
        searchParamsString,
        nextPage,
        pagination.pageSize,
      );
      router.push(`?${params}`);
    });
  }

  function getPageHref(nextPage: number) {
    const params = buildAdminUserListPaginationParams(
      searchParamsString,
      nextPage,
      pagination.pageSize,
    );
    return `?${params}`;
  }

  const handleTabChange = useCallback(
    (value: string) => {
      const params = buildAdminTabParams(searchParamsRef.current, resolveAdminTab(value));
      startNavTransition(() => {
        router.replace(params ? `?${params}` : window.location.pathname, { scroll: false });
      });
    },
    [router, startNavTransition],
  );

  const handleViewBrandWorkflows = useCallback(
    (brandId: string) => {
      setSourceBrandId(brandId);
      handleTabChange('workflows');
    },
    [handleTabChange],
  );

  const commitSearch = useCallback(
    (nextQuery: string) => {
      const normalizedQuery = nextQuery.trim();
      const currentQuery = new URLSearchParams(searchParamsRef.current).get('query')?.trim() ?? '';
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
      lastRequestedQueryRef.current = normalizedQuery;

      if (normalizedQuery === currentQuery) {
        return;
      }

      startNavTransition(() => {
        const params = buildAdminUserListSearchParams(
          searchParamsRef.current,
          normalizedQuery,
          pagination.pageSize,
        );
        router.replace(`?${params}`, { scroll: false });
      });
    },
    [pagination.pageSize, router, startNavTransition],
  );

  useEffect(() => {
    if (
      trimmedQuery === settledSearchQueryRef.current ||
      trimmedQuery === lastRequestedQueryRef.current
    ) {
      return;
    }

    const timeout = setTimeout(() => {
      searchTimeoutRef.current = null;
      commitSearch(trimmedQuery);
    }, SEARCH_DEBOUNCE_MS);
    searchTimeoutRef.current = timeout;

    return () => {
      clearTimeout(timeout);
      if (searchTimeoutRef.current === timeout) {
        searchTimeoutRef.current = null;
      }
    };
  }, [commitSearch, trimmedQuery]);

  // A FunctionsHttpError's `.message` is the constant "Edge Function returned a
  // non-2xx status code"; the reason the function actually wrote is in the body.
  // A 403 means this browser session is no longer an admin session — an
  // impersonation link replaces the session in place (auth/impersonate/page.tsx),
  // and an already-open /admin tab keeps its stale RSC state — so bounce the tab
  // back through the server guard on this route.
  async function adminEdgeError(error: unknown, fallback: string): Promise<string> {
    const message = await readEdgeErrorMessage(error, fallback);
    if (message === 'Forbidden') {
      router.refresh();
      return uiText('m_8f46f0ad07');
    }
    console.error('[Admin] function request failed', error);
    return describeAccessError(message, uiText);
  }

  async function copyImpersonationLinkToClipboard(url: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  }

  async function handleImpersonate(user: AdminUser) {
    const actionId = `impersonate:${user.id}`;
    setActionPending(actionId, true);
    try {
      const { data, error } = await supabase.functions.invoke('impersonate-user', {
        body: { target_id: user.id },
      });
      if (error) throw new Error(await adminEdgeError(error, 'Unable to generate link.'));
      if (!data?.signInLink) throw new Error('Failed to generate link');
      const copied = await copyImpersonationLinkToClipboard(data.signInLink);
      if (!copied) setImpersonationDialog({ email: user.email, link: data.signInLink });
      show({
        title: uiText('impersonation_link_ready_d3a4cc4'),
        description: copied ? uiText('m_0aad611ee6') : uiText('m_9a7228e20d'),
        variant: copied ? 'success' : 'warning',
      });
    } catch (error) {
      show({
        title: uiText('failed_to_impersonate_abb0ce6'),
        description: getUiErrorMessage(error),
        variant: 'error',
      });
    } finally {
      setActionPending(actionId, false);
    }
  }

  async function handleAdminToggle(user: AdminUser) {
    const actionId = `admin:${user.id}`;
    setActionPending(actionId, true);
    try {
      const { error } = await supabase.functions.invoke('admin-set-admin', {
        method: 'POST',
        body: { userId: user.id, isAdmin: !user.isAdmin },
      });
      if (error) throw new Error(await adminEdgeError(error, 'Unable to update admin flag.'));
      show({
        title: user.isAdmin ? uiText('m_5aed3b6f75') : uiText('m_6dd3a8820f'),
        variant: 'success',
      });
      router.refresh();
    } catch (error) {
      show({
        title: uiText('update_failed_e58282f'),
        description: getUiErrorMessage(error),
        variant: 'error',
      });
    } finally {
      setActionPending(actionId, false);
    }
  }

  async function handleTierChange(input: {
    membership: PermissionRow;
    nextTier: string;
    previousTier: string;
  }) {
    const actionId = `tier:${input.membership.user_id}:${input.membership.brand_profile_id}`;
    setTierOverrides((prev) => ({ ...prev, [actionId]: input.nextTier }));
    setActionPending(actionId, true);
    try {
      const nextTierValue = Number(input.nextTier);
      if (!Number.isFinite(nextTierValue)) return;
      const { error } = await supabase.functions.invoke('admin-update-tier', {
        method: 'POST',
        body: { brandProfileId: input.membership.brand_profile_id, tier: nextTierValue },
      });
      if (error) throw new Error(await adminEdgeError(error, 'Unable to save brand tier.'));
      show({ title: uiText('brand_tier_updated_63b6766'), variant: 'success' });
      router.refresh();
    } catch (error) {
      setTierOverrides((prev) => ({ ...prev, [actionId]: input.previousTier }));
      show({
        title: uiText('failed_to_update_brand_tier_21fa61f'),
        description: getUiErrorMessage(error),
        variant: 'error',
      });
    } finally {
      setActionPending(actionId, false);
    }
  }

  // One admin-update-access call. Throws a sentence (refusal codes described) on failure.
  async function updateAccess(
    brandId: string,
    change: Omit<AdminAccessUpdateRequest, 'brandId'>,
  ): Promise<AdminAccessUpdateResponse> {
    const { data, error } = await supabase.functions.invoke('admin-update-access', {
      method: 'POST',
      body: { brandId, ...change },
    });
    if (error) {
      throw new LocalizedUiError(await adminEdgeError(error, 'Unable to save brand access.'));
    }
    const parsed = adminAccessUpdateResponseSchema.safeParse(data);
    if (!parsed.success) throw new Error('The access update returned an unexpected response.');
    setAccessOverrides((prev) => ({ ...prev, [brandId]: parsed.data.access }));
    return parsed.data;
  }

  // Resolves true once saved. One request per brand at a time: a double click on "Add credits"
  // must not grant twice, and each server call is a fresh grant.
  async function handleAccessChange(
    membership: PermissionRow,
    change: Omit<AdminAccessUpdateRequest, 'brandId'>,
  ): Promise<boolean> {
    const brandId = membership.brand_profile_id;
    const actionId = `access:${brandId}`;
    if (accessInFlight.current.has(actionId)) return false;
    accessInFlight.current.add(actionId);
    setActionPending(actionId, true);
    try {
      const saved = await updateAccess(brandId, change);
      show({
        title: uiText('brand_access_updated_3bc0953'),
        description: saved.note,
        variant: 'success',
      });
      router.refresh();
      return true;
    } catch (error) {
      show({
        title: uiText('failed_to_update_brand_access_4c4ade4'),
        description: getUiErrorMessage(error),
        variant: 'error',
      });
      return false;
    } finally {
      accessInFlight.current.delete(actionId);
      setActionPending(actionId, false);
    }
  }

  // "Full access for all brands": the user's brands one by one through the same endpoint (each
  // change audited server-side), then a per-brand ok/failed list.
  async function handleFullAccessForUser(user: AdminUser, memberships: PermissionRow[]) {
    const actionId = `full-access:${user.id}`;
    if (accessInFlight.current.has(actionId)) return;
    accessInFlight.current.add(actionId);
    setActionPending(actionId, true);
    const brands = [
      ...new Map(
        memberships.map((membership) => [
          membership.brand_profile_id,
          membership.brand_name ?? membership.brand_profile_id,
        ]),
      ),
    ];
    const results: FullAccessResult[] = [];
    try {
      for (const [brandId, brandName] of brands) {
        try {
          await updateAccess(brandId, { fullAccess: true });
          results.push({ brandId, brandName, ok: true });
        } catch (error) {
          results.push({
            brandId,
            brandName,
            ok: false,
            message: getUiErrorMessage(error),
          });
        }
        setFullAccessResults({ userId: user.id, results: [...results] });
      }
      const failed = results.filter((result) => !result.ok).length;
      show({
        title: failed
          ? uiText('m_5d2189b006', { v0: String(failed), v1: String(results.length) })
          : uiText('m_9871041583'),
        description: uiText('m_daceebdbf3', {
          v0: String(results.length - failed),
          v1: String(results.length),
        }),
        variant: failed ? 'error' : 'success',
      });
      router.refresh();
    } finally {
      accessInFlight.current.delete(actionId);
      setActionPending(actionId, false);
    }
  }

  async function handleRemoveMember(membership: PermissionRow) {
    if (membership.role === 'owner') return;
    const actionId = `remove:${membership.user_id}:${membership.brand_profile_id}`;
    setActionPending(actionId, true);
    try {
      const { error } = await supabase.functions.invoke('admin-access-actions', {
        method: 'POST',
        body: {
          action: 'remove_member',
          brandProfileId: membership.brand_profile_id,
          userId: membership.user_id,
        },
      });
      if (error) throw new Error(await adminEdgeError(error, 'Unable to remove member.'));
      show({ title: uiText('member_removed_5dcec1a'), variant: 'success' });
      router.refresh();
    } catch (error) {
      show({
        title: uiText('removal_failed_59ac9c0'),
        description: getUiErrorMessage(error),
        variant: 'error',
      });
    } finally {
      setActionPending(actionId, false);
    }
  }

  async function loadBrands() {
    setIsBrandLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<AdminWorkflowResponse>(
        'admin-workflow-library',
        {
          method: 'POST',
          // Every brand, once. The combobox fuzzy-matches in memory, which is
          // both faster than a round trip and the only way the 213 brands past
          // the old cap were ever reachable.
          body: { action: 'list_brands', limit: 500 },
        },
      );
      if (error) {
        show({
          title: uiText('unable_to_load_brands_042e500'),
          description: await adminEdgeError(error, 'Brand list request failed.'),
          variant: 'error',
        });
        return;
      }
      setBrands(data?.brands ?? []);
    } finally {
      setIsBrandLoading(false);
    }
  }

  async function loadWorkflows() {
    setIsWorkflowLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<AdminWorkflowResponse>(
        'admin-workflow-library',
        {
          method: 'POST',
          body: {
            action: 'list',
            ...(sourceBrandId !== 'global' ? { brandProfileId: sourceBrandId } : {}),
          },
        },
      );
      if (error) throw new Error(await adminEdgeError(error, 'Workflow library request failed.'));
      const nextWorkflows = data?.workflows ?? [];
      setWorkflows(nextWorkflows);
      const nextIds = new Set(nextWorkflows.map((workflow) => workflow.id));
      setFocusedWorkflowId((current) =>
        current && nextIds.has(current) ? current : (nextWorkflows[0]?.id ?? null),
      );
      setCheckedWorkflowIds(
        (current) => new Set(Array.from(current).filter((id) => nextIds.has(id))),
      );
    } catch (error) {
      show({
        title: uiText('unable_to_load_workflows_7d6b735'),
        description: getUiErrorMessage(error),
        variant: 'error',
      });
    } finally {
      setIsWorkflowLoading(false);
    }
  }

  async function loadAuditEntries(page: number, filters: AuditFilters) {
    const seq = (auditRequestSeqRef.current += 1);
    const isCurrent = () => seq === auditRequestSeqRef.current;
    setIsAuditLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<AdminAuditResponse>(
        'admin-audit-log',
        {
          method: 'POST',
          body: buildAdminAuditRequestBody({
            page,
            pageSize: AUDIT_PAGE_SIZE,
            action: filters.action === AUDIT_ACTION_ALL ? null : filters.action,
            brandProfileId:
              filters.brandProfileId === AUDIT_BRAND_ALL ? null : filters.brandProfileId,
            search: filters.search,
            actorQuery: filters.actorQuery,
          }),
        },
      );
      if (error) throw new Error(await adminEdgeError(error, 'Audit request failed.'));
      if (!isCurrent()) return;
      setAuditEntries(data?.entries ?? []);
      setAuditPagination(data?.pagination ?? null);
    } catch (error) {
      if (!isCurrent()) return;
      show({
        title: uiText('unable_to_load_audit_log_e9b1584'),
        description: getUiErrorMessage(error),
        variant: 'error',
      });
    } finally {
      if (isCurrent()) setIsAuditLoading(false);
    }
  }

  useEffect(() => {
    void loadBrands();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only the brand scope refetches. Typing filters the loaded rows in memory, so
  // the search no longer costs an edge-function call per keystroke.
  useEffect(() => {
    void loadWorkflows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceBrandId]);

  useEffect(() => {
    void loadAuditEntries(auditPage, auditFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditPage, auditFilters]);

  function handleAuditActionChange(value: string) {
    setExpandedAuditId(null);
    setAuditPage(1);
    setAuditActionFilter(value);
  }

  function handleAuditBrandChange(value: string) {
    setExpandedAuditId(null);
    setAuditPage(1);
    setAuditBrandFilter(value);
  }

  // Text filters run server-side, so they debounce. Page resets on the DEBOUNCED
  // value, not the keystroke: resetting per character would fight a user paging
  // through results while refining a query.
  useEffect(() => {
    setExpandedAuditId(null);
    setAuditPage(1);
  }, [debouncedAuditSearch, debouncedAuditActor]);

  function goToAuditPage(nextPage: number) {
    setExpandedAuditId(null);
    setAuditPage(nextPage);
  }

  function toggleAuditExpanded(id: string) {
    setExpandedAuditId((current) => (current === id ? null : id));
  }

  const auditTotalPages = auditPagination?.totalPages ?? 0;

  function clearCheckedWorkflows() {
    setCheckedWorkflowIds(new Set());
    setTransferResults(null);
  }

  function toggleWorkflowChecked(workflowId: string) {
    setCheckedWorkflowIds((current) => {
      const next = new Set(current);
      if (next.has(workflowId)) {
        next.delete(workflowId);
      } else {
        next.add(workflowId);
      }
      return next;
    });
  }

  function toggleAllVisibleWorkflowsChecked() {
    setCheckedWorkflowIds((current) => {
      if (
        visibleWorkflows.length > 0 &&
        visibleWorkflows.every((workflow) => current.has(workflow.id))
      ) {
        return new Set();
      }
      return new Set(visibleWorkflows.map((workflow) => workflow.id));
    });
  }

  async function runBulkTransfer(args: {
    actionId: string;
    action: 'move' | 'copy' | 'promote' | 'assign';
    run: () => Promise<BulkTransferOutcome[]>;
  }) {
    setActionPending(args.actionId, true);
    setTransferResults(null);
    try {
      const outcomes = await args.run();
      setTransferResults(outcomes);
      const failed = outcomes.filter((outcome) => outcome.status === 'failed');
      show({
        title:
          failed.length === 0
            ? uiText('m_bb426bea2d', { action: args.action, count: outcomes.length })
            : uiText('m_b4f4fd1b30', {
                succeeded: outcomes.length - failed.length,
                total: outcomes.length,
              }),
        description:
          failed.length === 0 ? undefined : uiText('m_a98a98d292', { v0: String(failed.length) }),
        variant: failed.length === 0 ? 'success' : 'warning',
      });
      const succeededIds = new Set(
        outcomes
          .filter((outcome) => outcome.status === 'success')
          .map((outcome) => outcome.workflowId),
      );
      setCheckedWorkflowIds(
        (current) => new Set(Array.from(current).filter((id) => !succeededIds.has(id))),
      );
      await loadWorkflows();
      await loadAuditEntries(auditPage, auditFilters);
    } catch (error) {
      show({
        title: uiText('bulk_action_failed_46471f3'),
        description: getUiErrorMessage(error),
        variant: 'error',
      });
    } finally {
      setActionPending(args.actionId, false);
    }
  }

  async function runSingleItemBulk(args: {
    actionId: string;
    action: 'move' | 'copy' | 'promote' | 'assign';
    ids: string[];
    buildBody: (workflowId: string) => Record<string, unknown>;
  }) {
    const nameById = new Map(workflows.map((workflow) => [workflow.id, workflow.name]));
    await runBulkTransfer({
      actionId: args.actionId,
      action: args.action,
      run: async () => {
        return Promise.all(
          args.ids.map(async (workflowId) => {
            const { data, error } = await supabase.functions.invoke<{ copiedAssets?: number }>(
              'admin-workflow-library',
              { method: 'POST', body: args.buildBody(workflowId) },
            );
            if (error) {
              // The refusal reason (which media is unregistered, and why that
              // blocks the whole canvas) is in the response BODY. `error.message`
              // is the same generic string for every non-2xx.
              return {
                workflowId,
                workflowName: nameById.get(workflowId) ?? workflowId,
                status: 'failed' as const,
                message: await adminEdgeError(error, 'Workflow transfer failed.'),
              };
            }
            const copiedAssets = data?.copiedAssets ?? 0;
            return {
              workflowId,
              workflowName: nameById.get(workflowId) ?? workflowId,
              status: 'success' as const,
              mediaSummary: copiedAssets
                ? uiText('m_2d41374424', { count: copiedAssets })
                : undefined,
            };
          }),
        );
      },
    });
  }

  async function handleBulkMove() {
    if (!targetBrandId) {
      show({ title: uiText('choose_a_destination_brand_14b305e'), variant: 'warning' });
      return;
    }
    const ids = Array.from(checkedWorkflowIds);
    const nameById = new Map(workflows.map((workflow) => [workflow.id, workflow.name]));
    await runBulkTransfer({
      actionId: 'workflow-bulk:move',
      action: 'move',
      run: async () => {
        const { data, error } = await supabase.functions.invoke<AdminWorkflowMoveResponse>(
          'admin-workflow-library',
          {
            method: 'POST',
            body: {
              action: 'move_to_brand',
              workflowIds: ids,
              targetBrandProfileId: targetBrandId,
            },
          },
        );
        if (error) throw new Error(await adminEdgeError(error, 'Workflow transfer failed.'));
        return (data?.results ?? []).map((result) => ({
          workflowId: result.workflowId,
          workflowName: nameById.get(result.workflowId) ?? result.workflowId,
          status: result.status === 'moved' ? ('success' as const) : ('failed' as const),
          message: result.error ? describeAccessError(result.error, uiText) : undefined,
          mediaSummary: describeMediaMoved(result.movedAssets, result.movedVersions, uiText),
        }));
      },
    });
  }

  async function handleBulkCopy() {
    if (!targetBrandId) {
      show({ title: uiText('choose_a_destination_brand_14b305e'), variant: 'warning' });
      return;
    }
    await runSingleItemBulk({
      actionId: 'workflow-bulk:copy',
      action: 'copy',
      ids: Array.from(checkedWorkflowIds),
      buildBody: (workflowId) => ({
        action: 'duplicate_to_brand',
        workflowId,
        targetBrandProfileId: targetBrandId,
      }),
    });
  }

  async function handleBulkPromote() {
    await runSingleItemBulk({
      actionId: 'workflow-bulk:promote',
      action: 'promote',
      ids: Array.from(checkedWorkflowIds),
      buildBody: (workflowId) => ({ action: 'promote_to_global', workflowId }),
    });
  }

  async function handleBulkAssignToBrand() {
    if (!targetBrandId) {
      show({ title: uiText('choose_a_destination_brand_14b305e'), variant: 'warning' });
      return;
    }
    await runSingleItemBulk({
      actionId: 'workflow-bulk:assign',
      action: 'assign',
      ids: Array.from(checkedWorkflowIds),
      buildBody: (workflowId) => ({
        action: 'migrate_global_to_brand',
        workflowId,
        targetBrandProfileId: targetBrandId,
      }),
    });
  }

  async function handleFirstValueReportSmoke(send: boolean) {
    const brandId = reportBrandId.trim();
    if (!brandId) {
      show({
        title: uiText('brand_id_required_7b8cf5f'),
        description: uiText('select_or_paste_a_brand_id_first_e7edc93'),
        variant: 'warning',
      });
      return;
    }

    setIsReportSmokeLoading(true);
    setReportSmokeResult(null);
    try {
      const { data, error } = await supabase.functions.invoke<FirstValueReportSmokeResponse>(
        'send-first-value-report',
        {
          method: 'POST',
          body: {
            action: 'smoke_test',
            brandId,
            send,
            ...(reportRecipientEmail.trim() ? { recipientEmail: reportRecipientEmail.trim() } : {}),
          },
        },
      );
      if (error)
        throw new Error(
          await adminEdgeError(error, 'Unable to run first value report smoke test.'),
        );
      const result = data ?? { status: 'unknown' };
      setReportSmokeResult(result);
      show({
        title: send ? uiText('smoke_email_sent_0bea2a1') : uiText('m_df2b4e6675'),
        description: send
          ? result.resendMessageId
            ? uiText('m_f9d8507aeb', { v0: String(result.resendMessageId) })
            : uiText('m_320b0a801c')
          : uiText('one_or_more_report_sections_are_available_e726a3c'),
        variant: 'success',
      });
    } catch (error) {
      const message = getUiErrorMessage(error);
      setReportSmokeResult({ status: 'failed', ok: false, error: message });
      show({
        title: send ? uiText('m_b58c2b5f9f') : uiText('m_6d6959b7c5'),
        description: message,
        variant: 'error',
      });
    } finally {
      setIsReportSmokeLoading(false);
    }
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="min-h-0 flex-1 space-y-5">
      <div className="flex shrink-0 flex-col gap-3">
        <TabsList className="w-full justify-start overflow-x-auto rounded-md bg-surface p-1">
          <TabsTrigger value="users" className="gap-2">
            <UserCog className="size-4" />
            {uiText('users_6b0cc90')}
          </TabsTrigger>
          <TabsTrigger value="brands" className="gap-2">
            <Building2 className="size-4" />
            {uiText('brands_ec26be2')}
          </TabsTrigger>
          <TabsTrigger value="workflows" className="gap-2">
            <Library className="size-4" />
            {uiText('m_825ce9e97d')}
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2">
            <History className="size-4" />
            {uiText('m_fa1703dd78')}
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-2">
            <Mail className="size-4" />
            {uiText('m_88bc3fe3da')}
          </TabsTrigger>
        </TabsList>
        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-4">
          <div className="rounded-md border border-subtle bg-surface px-3 py-2">
            <span className="block text-xs uppercase tracking-[0.16em]">
              {uiText('users_6b0cc90')}
            </span>
            <strong className="text-base text-foreground">{users.length}</strong> /{' '}
            {totalCountLabel}
          </div>
          <div className="rounded-md border border-subtle bg-surface px-3 py-2">
            <span className="block text-xs uppercase tracking-[0.16em]">
              {uiText('admins_8273a67')}
            </span>
            <strong className="text-base text-foreground">{adminCount}</strong>
            {uiText('m_e7cfb4febc')}
          </div>
          <div className="rounded-md border border-subtle bg-surface px-3 py-2">
            <span className="block text-xs uppercase tracking-[0.16em]">
              {uiText('brands_ec26be2')}
            </span>
            <strong className="text-base text-foreground">{uniqueBrandCount}</strong>
            {uiText('m_4254f5661d')}
          </div>
          <div className="rounded-md border border-subtle bg-surface px-3 py-2">
            <span className="block text-xs uppercase tracking-[0.16em]">
              {uiText('owners_58f5df9')}
            </span>
            <strong className="text-base text-foreground">{ownerMemberships}</strong>
            {uiText('m_31f7f3c305')}
          </div>
        </div>
      </div>

      {/*
        Airtable #279 — at >=xl the directory budgets the panel height it actually has:
        the table takes what is left after the header, the alert and the pagination row,
        so pagination can never fall below the fold. Its old `max-h-[64vh]` cap was a
        fraction of the VIEWPORT, which is always more than the panel had left. Below xl
        the aside stacks under the table, so the panel scrolls as a whole instead.
      */}
      <TabsContent value="users" className="min-h-0 overflow-y-auto xl:overflow-hidden">
        <div className="grid min-h-[640px] gap-4 xl:h-full xl:min-h-0 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col gap-4 xl:min-h-0">
            <div className="flex flex-col gap-3 rounded-lg border border-subtle bg-surface p-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  {uiText('user_directory_f32b19f')}
                </h2>
                <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
                  {uiText('m_43539d947c', {
                    shown: users.length,
                    total: pagination.totalCount,
                    mode: serverQueryActive ? 'matches' : 'total',
                    updating: isDirectoryUpdating ? 'yes' : 'no',
                  })}
                </p>
              </div>
              <div className="w-full lg:w-[320px]">
                <Label htmlFor="admin-user-search" className="sr-only">
                  {uiText('search_users_e4bb77a')}
                </Label>
                <div className="relative">
                  {isDirectoryUpdating ? (
                    <Loader2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  ) : (
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  )}
                  <Input
                    id="admin-user-search"
                    placeholder={uiText('search_users_by_name_or_email_8408a13')}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return;
                      event.preventDefault();
                      commitSearch(query);
                    }}
                    className="px-9"
                  />
                  {query ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={uiText('clear_search_3b7ea51')}
                      className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
                      onClick={() => {
                        setQuery('');
                        commitSearch('');
                      }}
                    >
                      <XCircle className="size-3.5" />
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            <Alert className="border-amber-200 bg-amber-50/60 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <ShieldAlert className="size-4" />
              <AlertTitle>{uiText('immediate_audited_changes_32ff069')}</AlertTitle>
              <AlertDescription>
                {uiText('service_role_actions_apply_immediately_owner__a665ea8')}
              </AlertDescription>
            </Alert>

            <div
              data-testid="admin-user-directory-results"
              aria-busy={isDirectoryUpdating}
              className={`rounded-lg border border-subtle bg-surface transition-opacity xl:flex xl:min-h-0 xl:flex-1 xl:flex-col ${
                isDirectoryUpdating ? 'opacity-70' : ''
              }`}
            >
              <div className="max-h-[64vh] overflow-auto xl:max-h-none xl:min-h-0 xl:flex-1">
                <div className="min-w-[900px]">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-surface">
                      <TableRow>
                        <TableHead>{uiText('user_b512d97')}</TableHead>
                        <TableHead>{uiText('brands_ec26be2')}</TableHead>
                        <TableHead>{uiText('role_state_5470cc9')}</TableHead>
                        <TableHead className="text-right">
                          {uiText('primary_action_da2eb57')}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className="px-5 py-6 text-sm text-muted-foreground"
                          >
                            {serverQueryActive
                              ? uiText('no_users_match_this_search_daa4b5d')
                              : uiText('no_users_found_ce0171e')}
                          </TableCell>
                        </TableRow>
                      ) : (
                        users.map((user) => {
                          const memberships = permissionsByUserId.get(user.id) ?? [];
                          const isSelected = selectedUser?.id === user.id;
                          const ownerCount = memberships.filter(
                            (membership) => membership.role === 'owner',
                          ).length;
                          const brandSummary =
                            memberships.length === 0
                              ? uiText('no_brand_memberships_ae71bb8')
                              : memberships
                                  .slice(0, 2)
                                  .map(
                                    (membership) =>
                                      membership.brand_name ?? membership.brand_profile_id,
                                  )
                                  .join(', ');

                          return (
                            <TableRow
                              key={user.id}
                              data-state={isSelected ? 'selected' : undefined}
                              className="cursor-pointer"
                              onClick={() => setSelectedUserId(user.id)}
                            >
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <div className="grid h-9 w-9 place-items-center rounded-full bg-muted text-sm font-semibold text-foreground">
                                    {getUserInitials(user)}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-foreground">
                                      {user.name ?? user.email}
                                    </div>
                                    <p className="truncate text-xs text-muted-foreground">
                                      {user.email}
                                    </p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm text-foreground">
                                  {membershipLabel(memberships.length, uiText)}
                                </div>
                                <p
                                  title={brandSummary}
                                  className="max-w-[360px] truncate text-xs text-muted-foreground"
                                >
                                  {brandSummary}
                                </p>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {user.isAdmin ? (
                                    <Badge variant="secondary">{uiText('admin_c1c224b')}</Badge>
                                  ) : null}
                                  {ownerCount > 0 ? (
                                    <Badge variant="outline" className="gap-1">
                                      <Lock className="size-3" />
                                      {ownerCount}
                                      {uiText('m_a81ee2bd70')}
                                    </Badge>
                                  ) : null}
                                  {memberships.length === 0 && (
                                    <Badge variant="outline">{uiText('no_brands_726698d')}</Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={Boolean(pendingActions[`impersonate:${user.id}`])}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void handleImpersonate(user);
                                  }}
                                >
                                  {uiText.rich('sentence_8fe535707c22', {
                                    v0: () =>
                                      pendingActions[`impersonate:${user.id}`] ? (
                                        <Loader2 className="size-4 animate-spin" />
                                      ) : null,
                                  })}
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {uiText.rich('sentence_4e58978f3adf', { v0: () => safePage, v1: () => totalPages })}
              </p>
              <Pagination className="w-auto justify-end">
                <PaginationContent className="flex-wrap justify-end">
                  <PaginationItem>
                    <PaginationLink
                      size="default"
                      href={getPageHref(1)}
                      onClick={(event) => handlePageNavigation(event, 1)}
                      disabled={!pagination.hasPrevPage || isNavPending}
                    >
                      {uiText('first_a151ceb')}
                    </PaginationLink>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationPrevious
                      href={getPageHref(Math.max(1, pagination.page - 1))}
                      onClick={(event) =>
                        handlePageNavigation(event, Math.max(1, pagination.page - 1))
                      }
                      disabled={!pagination.hasPrevPage || isNavPending}
                    />
                  </PaginationItem>
                  {paginationItems.map((item, index) =>
                    item === 'ellipsis' ? (
                      <PaginationItem key={`ellipsis-${index}`}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={`page-${item}`}>
                        <PaginationLink
                          href={getPageHref(item)}
                          onClick={(event) => handlePageNavigation(event, item)}
                          isActive={item === safePage}
                          disabled={isNavPending}
                        >
                          {item}
                        </PaginationLink>
                      </PaginationItem>
                    ),
                  )}
                  <PaginationItem>
                    <PaginationNext
                      href={getPageHref(Math.min(totalPages, pagination.page + 1))}
                      onClick={(event) =>
                        handlePageNavigation(event, Math.min(totalPages, pagination.page + 1))
                      }
                      disabled={!pagination.hasNextPage || isNavPending}
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationLink
                      size="default"
                      href={getPageHref(totalPages)}
                      onClick={(event) => handlePageNavigation(event, totalPages)}
                      disabled={!pagination.hasNextPage || totalPages <= 1 || isNavPending}
                    >
                      {uiText('last_eb970eb')}
                    </PaginationLink>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </div>

          <aside className="min-w-0 rounded-lg border border-subtle bg-surface xl:min-h-0 xl:overflow-y-auto">
            {selectedUser ? (
              <div className="flex h-full flex-col">
                <div className="border-b border-subtle p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold text-foreground">
                        {selectedUser.name ?? selectedUser.email}
                      </h3>
                      <p className="truncate text-xs text-muted-foreground">{selectedUser.email}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {uiText.rich('sentence_26f8d4972219', {
                          v0: () => formatDate(selectedUser.createdAt, uiLocale, uiText),
                        })}
                      </p>
                    </div>
                    {selectedUser.isAdmin ? (
                      <Badge variant="secondary">{uiText('admin_c1c224b')}</Badge>
                    ) : (
                      <Badge variant="outline">{uiText('user_b512d97')}</Badge>
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={Boolean(pendingActions[`impersonate:${selectedUser.id}`])}
                      onClick={() => void handleImpersonate(selectedUser)}
                    >
                      {uiText.rich('sentence_8fe535707c22', {
                        v0: () =>
                          pendingActions[`impersonate:${selectedUser.id}`] ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : null,
                      })}
                    </Button>
                    <AdminActionConfirmation
                      trigger={
                        <Button
                          size="sm"
                          variant={selectedUser.isAdmin ? 'destructive' : 'outline'}
                          disabled={Boolean(pendingActions[`admin:${selectedUser.id}`])}
                        >
                          {pendingActions[`admin:${selectedUser.id}`] ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : null}
                          {selectedUser.isAdmin ? uiText('m_14652b698d') : uiText('m_84ec1c9afa')}
                        </Button>
                      }
                      title={
                        selectedUser.isAdmin
                          ? uiText('revoke_admin_access_83d3315')
                          : uiText('grant_admin_access_996c04c')
                      }
                      description={uiText('this_action_is_immediate_and_will_be_written__a91f769')}
                      confirmLabel={
                        selectedUser.isAdmin ? uiText('m_14652b698d') : uiText('m_84ec1c9afa')
                      }
                      targetEmail={selectedUser.email}
                      requireTypedEmail={!selectedUser.isAdmin}
                      onConfirm={() => void handleAdminToggle(selectedUser)}
                    />
                    <AdminActionConfirmation
                      trigger={
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            !billingLive ||
                            selectedMemberships.length === 0 ||
                            Boolean(pendingActions[`full-access:${selectedUser.id}`])
                          }
                        >
                          {uiText.rich('sentence_3485728deb6d', {
                            v0: () =>
                              pendingActions[`full-access:${selectedUser.id}`] ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : null,
                          })}
                        </Button>
                      }
                      title={uiText('m_32caaa0a56', { v0: String(selectedUser.email) })}
                      description={uiText('m_785b9aeee6', {
                        v0: String(membershipLabel(selectedMemberships.length, uiText)),
                      })}
                      confirmLabel={uiText('m_acc06b922d')}
                      onConfirm={() =>
                        void handleFullAccessForUser(selectedUser, selectedMemberships)
                      }
                    />
                  </div>
                  {fullAccessResults?.userId === selectedUser.id ? (
                    <ul
                      className="mt-3 space-y-1 text-xs"
                      aria-label={uiText('full_access_results_36a1cd8')}
                      data-testid="full-access-results"
                    >
                      {fullAccessResults.results.map((result) => (
                        <li
                          key={result.brandId}
                          data-brand-id={result.brandId}
                          data-ok={result.ok}
                          className="flex items-start gap-1.5"
                        >
                          {result.ok ? (
                            <CheckCircle2 className="mt-px size-3.5 shrink-0 text-emerald-500" />
                          ) : (
                            <XCircle className="mt-px size-3.5 shrink-0 text-destructive" />
                          )}
                          <span className="min-w-0">
                            <span className="text-foreground">{result.brandName}</span>{' '}
                            <span className="text-muted-foreground">
                              {result.ok
                                ? uiText('ok_2689367')
                                : uiText('m_97072e1d57', { v0: String(result.message) })}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {uiText('brand_access_f923b1b')}
                  </h4>
                  {selectedMemberships.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {uiText('no_memberships_for_this_user_46f6ef1')}
                    </p>
                  ) : (
                    selectedMemberships.map((membership) => {
                      const tierValue = String(membership.brand_tier ?? 0);
                      const tierActionId = `tier:${membership.user_id}:${membership.brand_profile_id}`;
                      const currentTier = tierOverrides[tierActionId] ?? tierValue;
                      const removeActionId = `remove:${membership.user_id}:${membership.brand_profile_id}`;
                      const accessActionId = `access:${membership.brand_profile_id}`;
                      const isOwner = membership.role === 'owner';

                      return (
                        <div
                          key={`${membership.user_id}-${membership.brand_profile_id}`}
                          className="rounded-md border border-subtle bg-default/40 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">
                                {membership.brand_name ?? membership.brand_profile_id}
                              </p>
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                <Badge variant={roleVariant(membership.role)}>
                                  {membership.role ?? uiText('unknown_b23a6a8')}
                                </Badge>
                                {billingLive ? null : (
                                  <Badge variant="outline">
                                    {uiText.rich('sentence_d24576c1199a', {
                                      v0: () => currentTier,
                                    })}
                                  </Badge>
                                )}
                                {isOwner ? (
                                  <Badge variant="outline" className="gap-1">
                                    <Lock className="size-3" />
                                    {uiText('m_adec79fd87')}
                                  </Badge>
                                ) : null}
                              </div>
                            </div>
                            {/* billing-cutover: the Tier control until billing is live. */}
                            {billingLive ? null : (
                              <Select
                                value={currentTier}
                                onValueChange={(value) => {
                                  if (value === currentTier) return;
                                  void handleTierChange({
                                    membership,
                                    nextTier: value,
                                    previousTier: currentTier,
                                  });
                                }}
                                disabled={Boolean(pendingActions[tierActionId])}
                              >
                                <SelectTrigger size="sm" className="w-[130px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="0">{uiText('tier_0_6e1a8c3')}</SelectItem>
                                  <SelectItem value="1">{uiText('tier_1_c97454a')}</SelectItem>
                                  <SelectItem value="2">{uiText('tier_2_aa91161')}</SelectItem>
                                  <SelectItem value="3">{uiText('tier_3_5020877')}</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                          <BrandAccessEditor
                            brandId={membership.brand_profile_id}
                            brandName={membership.brand_name ?? 'this brand'}
                            access={
                              accessOverrides[membership.brand_profile_id] ??
                              membership.brand_access
                            }
                            live={billingLive}
                            pending={Boolean(pendingActions[accessActionId])}
                            onToggleProduct={(product: ProductCode, next: boolean) =>
                              void handleAccessChange(membership, { products: { [product]: next } })
                            }
                            onSetContract={(next) =>
                              void handleAccessChange(membership, { contract: next })
                            }
                            onFullAccess={() =>
                              void handleAccessChange(membership, { fullAccess: true })
                            }
                            onAddCredits={(usd, reason) =>
                              handleAccessChange(membership, { addCreditsUsd: usd, reason })
                            }
                            onSetClient={(next) =>
                              void handleAccessChange(membership, { client: next })
                            }
                          />
                          <div className="mt-3 flex justify-end">
                            {isOwner ? (
                              <Button size="sm" variant="outline" disabled className="gap-2">
                                <Lock className="size-4" />
                                {uiText('m_735899a1dd')}
                              </Button>
                            ) : (
                              <AdminActionConfirmation
                                trigger={
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    disabled={Boolean(pendingActions[removeActionId])}
                                  >
                                    {uiText.rich('sentence_3a3421e4f359', {
                                      v0: () =>
                                        pendingActions[removeActionId] ? (
                                          <Loader2 className="size-4 animate-spin" />
                                        ) : (
                                          <Trash2 className="size-4" />
                                        ),
                                    })}
                                  </Button>
                                }
                                title={uiText('remove_this_brand_membership_3c29129')}
                                description={uiText('m_97209ab326', {
                                  v0: String(selectedUser.email),
                                  v1: String(membership.brand_name ?? uiText('this_brand_c31b658')),
                                })}
                                confirmLabel={uiText('m_a13a9514cc')}
                                targetEmail={selectedUser.email}
                                requireTypedEmail
                                onConfirm={() => void handleRemoveMember(membership)}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4 text-sm text-muted-foreground">
                {uiText('select_a_user_to_inspect_access_7bf5417')}
              </div>
            )}
          </aside>
        </div>
      </TabsContent>

      <TabsContent value="brands" className="min-h-0 space-y-4 overflow-y-auto">
        <BrandsTab
          brands={brands}
          isLoading={isBrandLoading}
          onRefresh={() => void loadBrands()}
          onViewWorkflows={handleViewBrandWorkflows}
        />
      </TabsContent>

      <TabsContent value="workflows" className="min-h-0 space-y-4 overflow-y-auto">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-col gap-3 rounded-lg border border-subtle bg-surface p-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-foreground">
                  {uiText('workflow_library_861f22e')}
                </h2>
                <p className="truncate text-xs text-muted-foreground">
                  {uiText.rich('sentence_1310085f6420', {
                    v0: () =>
                      formatBrandDisambiguationLabel(
                        brandFilterOptions.find((brand) => brand.id === sourceBrandId) ?? {
                          ...GLOBAL_LIBRARY_BRAND_OPTION,
                          brand_name: uiText('m_061122128b'),
                        },
                      ),
                  })}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative w-full sm:w-[220px]">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder={uiText('search_workflows_e827cf3')}
                    value={workflowQuery}
                    onChange={(event) => setWorkflowQuery(event.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="w-full sm:w-[280px]">
                  <BrandTransferCombobox
                    id="workflow-source-filter"
                    brands={brandFilterOptions}
                    value={sourceBrandId}
                    onChange={setSourceBrandId}
                    placeholder={uiText('filter_by_brand_6be6143')}
                  />
                </div>
                <Button variant="outline" size="sm" onClick={() => void loadWorkflows()}>
                  <RefreshCw className="size-4" />
                  {uiText('m_56e3badc4e')}
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-subtle bg-surface">
              <div className="max-h-[560px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-surface">
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allVisibleWorkflowsChecked}
                          onCheckedChange={() => toggleAllVisibleWorkflowsChecked()}
                          disabled={visibleWorkflows.length === 0}
                          aria-label={uiText('select_all_visible_workflows_0206450')}
                        />
                      </TableHead>
                      <TableHead>{uiText('workflow_2e2d5c5')}</TableHead>
                      <TableHead>{uiText('scope_b073f6c')}</TableHead>
                      <TableHead>{uiText('updated_3a5ecca')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isWorkflowLoading ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="py-8 text-center text-sm text-muted-foreground"
                        >
                          {uiText('loading_workflows_c0a24ee')}
                        </TableCell>
                      </TableRow>
                    ) : visibleWorkflows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="py-8 text-center text-sm text-muted-foreground"
                        >
                          {workflows.length === 0
                            ? uiText('no_workflows_found_ca97e48')
                            : uiText('m_053607fe47', { v0: String(workflowQuery) })}
                        </TableCell>
                      </TableRow>
                    ) : (
                      visibleWorkflows.map((workflow) => (
                        <TableRow
                          key={workflow.id}
                          data-state={workflow.id === focusedWorkflowId ? 'selected' : undefined}
                          className="cursor-pointer"
                          onClick={() => setFocusedWorkflowId(workflow.id)}
                        >
                          <TableCell onClick={(event) => event.stopPropagation()}>
                            <Checkbox
                              checked={checkedWorkflowIds.has(workflow.id)}
                              onCheckedChange={() => toggleWorkflowChecked(workflow.id)}
                              aria-label={uiText('m_0d07636c17', { v0: String(workflow.name) })}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-foreground">
                                {workflow.name}
                              </div>
                              <p className="line-clamp-1 text-xs text-muted-foreground">
                                {workflow.description ?? uiText('no_description_bcd8cc5')}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            {workflow.visibility === 'global' ? (
                              <Badge variant="secondary" className="gap-1">
                                <Globe2 className="size-3" />
                                {uiText('m_5f1184f7df')}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1">
                                <Building2 className="size-3" />
                                {uiText('brand_090ed43')}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDate(workflow.updated_at, uiLocale, uiText)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-lg border border-subtle bg-surface p-4">
              {focusedWorkflow ? (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center gap-2">
                      {focusedWorkflow.visibility === 'global' ? (
                        <Globe2 className="size-4 text-brand-primary" />
                      ) : (
                        <Library className="size-4 text-brand-primary" />
                      )}
                      <h3 className="min-w-0 truncate text-base font-semibold text-foreground">
                        {focusedWorkflow.name}
                      </h3>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {focusedWorkflow.description ?? uiText('no_description_bcd8cc5')}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md border border-subtle bg-default/40 p-2">
                      <span className="block text-muted-foreground">{uiText('scope_b073f6c')}</span>
                      <strong className="text-foreground">
                        {focusedWorkflow.visibility === 'global'
                          ? uiText('m_5f1184f7df')
                          : uiText('brand_090ed43')}
                      </strong>
                    </div>
                    <div className="rounded-md border border-subtle bg-default/40 p-2">
                      <span className="block text-muted-foreground">{uiText('nodes_7ac3620')}</span>
                      <strong className="text-foreground">{focusedWorkflow.node_count ?? 0}</strong>
                    </div>
                  </div>
                  <Alert className="border-subtle">
                    <Copy className="size-4" />
                    <AlertTitle>{uiText('duplicate_policy_4f7b2a5')}</AlertTitle>
                    <AlertDescription>
                      {uiText('copy_and_assign_actions_save_conflicting_name_6c3d898')}
                    </AlertDescription>
                  </Alert>
                  <p className="text-xs text-muted-foreground">
                    {uiText('check_this_workflow_and_any_others_in_the_tab_e7f6362')}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {uiText('select_a_workflow_to_preview_it_0e0f510')}
                </p>
              )}
            </div>

            {transferResults && transferResults.length > 0 ? (
              <div className="rounded-lg border border-subtle bg-surface p-4">
                <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {uiText('last_transfer_4ba588b')}
                </h4>
                <ul className="mt-2 space-y-2">
                  {transferResults.map((result) => (
                    <li key={result.workflowId} className="flex items-start gap-2 text-xs">
                      {result.status === 'success' ? (
                        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                      ) : (
                        <XCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-foreground">{result.workflowName}</p>
                        {result.message ? (
                          <p className="text-muted-foreground">{result.message}</p>
                        ) : null}
                        {result.mediaSummary ? (
                          <p className="text-muted-foreground">{result.mediaSummary}</p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>

        {checkedWorkflowIds.size > 0 ? (
          <div className="sticky bottom-2 z-20 rounded-lg border border-subtle bg-surface p-3 shadow-lg">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="text-sm text-foreground">
                {uiText('m_fea1461749', { count: checkedWorkflowIds.size })}
                {!bulkEligibility.allowed ? (
                  <span className="ml-2 text-xs text-destructive">{bulkEligibility.reason}</span>
                ) : null}
              </div>
              <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
                {bulkEligibility.allowed ? (
                  <div className="w-full sm:w-[300px]">
                    <BrandTransferCombobox
                      id="workflow-target-brand"
                      brands={transferTargetBrands}
                      value={targetBrandId}
                      onChange={setTargetBrandId}
                      placeholder={uiText('choose_destination_brand_3eb2289')}
                    />
                  </div>
                ) : null}

                {bulkEligibility.allowed && allCheckedAreBrandScoped ? (
                  <>
                    <AdminActionConfirmation
                      trigger={
                        <Button
                          disabled={!targetBrandId || Boolean(pendingActions['workflow-bulk:move'])}
                        >
                          {uiText.rich('sentence_5296add61fa3', {
                            v0: () =>
                              pendingActions['workflow-bulk:move'] ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <ArrowRightLeft className="size-4" />
                              ),
                          })}
                        </Button>
                      }
                      title={uiText('m_7592bcaa87', { count: checkedWorkflows.length })}
                      description={uiText('m_5b418d7ce7', {
                        v0: String(checkedWorkflowNamesLabel),
                      })}
                      confirmLabel={uiText('m_f6bc4dc039')}
                      onConfirm={() => void handleBulkMove()}
                    />
                    <AdminActionConfirmation
                      trigger={
                        <Button
                          variant="outline"
                          disabled={!targetBrandId || Boolean(pendingActions['workflow-bulk:copy'])}
                        >
                          {uiText.rich('sentence_de01e13eed31', {
                            v0: () =>
                              pendingActions['workflow-bulk:copy'] ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Copy className="size-4" />
                              ),
                          })}
                        </Button>
                      }
                      title={uiText('m_abdc66a41f', { count: checkedWorkflows.length })}
                      description={uiText('m_4a1a99b105', {
                        v0: String(checkedWorkflowNamesLabel),
                      })}
                      confirmLabel={uiText('m_ab6956e9e4')}
                      onConfirm={() => void handleBulkCopy()}
                    />
                    <AdminActionConfirmation
                      trigger={
                        <Button
                          variant="outline"
                          disabled={Boolean(pendingActions['workflow-bulk:promote'])}
                        >
                          {uiText.rich('sentence_c9d678a8466c', {
                            v0: () =>
                              pendingActions['workflow-bulk:promote'] ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Globe2 className="size-4" />
                              ),
                          })}
                        </Button>
                      }
                      title={uiText('m_693ff6c55d', { count: checkedWorkflows.length })}
                      description={uiText('m_0bb96e49e9', {
                        v0: String(checkedWorkflowNamesLabel),
                      })}
                      confirmLabel={uiText('m_24197af409')}
                      onConfirm={() => void handleBulkPromote()}
                    />
                  </>
                ) : null}

                {bulkEligibility.allowed && allCheckedAreGlobalScoped ? (
                  <AdminActionConfirmation
                    trigger={
                      <Button
                        disabled={!targetBrandId || Boolean(pendingActions['workflow-bulk:assign'])}
                      >
                        {uiText.rich('sentence_30b478ae35ac', {
                          v0: () =>
                            pendingActions['workflow-bulk:assign'] ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Building2 className="size-4" />
                            ),
                        })}
                      </Button>
                    }
                    title={uiText('m_978e9818d4', { count: checkedWorkflows.length })}
                    description={uiText('m_c2f013f15c', { v0: String(checkedWorkflowNamesLabel) })}
                    confirmLabel={uiText('m_1dcbb38149')}
                    onConfirm={() => void handleBulkAssignToBrand()}
                  />
                ) : null}

                <Button variant="ghost" size="sm" onClick={clearCheckedWorkflows}>
                  {uiText('clear_83b12c2')}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </TabsContent>

      <TabsContent
        value="audit"
        className="min-h-0 space-y-3 overflow-y-auto"
        data-testid="admin-audit-panel"
      >
        <div className="flex flex-col gap-3 rounded-lg border border-subtle bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {uiText('admin_audit_log_1ede0f9')}
            </h2>
            <p className="text-xs text-muted-foreground">
              {uiText('immutable_trail_of_service_role_admin_actions_96f64e2')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-[200px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={uiText('search_action_or_target_b9c2cfc')}
                value={auditSearch}
                onChange={(event) => setAuditSearch(event.target.value)}
                className="h-9 pl-9"
                aria-label={uiText('search_the_audit_log_eb31f4b')}
              />
            </div>
            <div className="relative w-full sm:w-[180px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={uiText('filter_by_actor_7c3b90e')}
                value={auditActorQuery}
                onChange={(event) => setAuditActorQuery(event.target.value)}
                className="h-9 pl-9"
                aria-label={uiText('filter_the_audit_log_by_actor_af40e61')}
              />
            </div>
            <div className="w-full sm:w-[240px]">
              <BrandTransferCombobox
                id="audit-brand-filter"
                brands={auditBrandFilterOptions}
                value={auditBrandFilter}
                onChange={handleAuditBrandChange}
                placeholder={uiText('filter_by_brand_6be6143')}
              />
            </div>
            <Select value={auditActionFilter} onValueChange={handleAuditActionChange}>
              <SelectTrigger
                className="h-9 w-[220px]"
                aria-label={uiText('filter_by_action_ef58fba')}
              >
                <SelectValue placeholder={uiText('all_actions_83140cf')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUDIT_ACTION_ALL}>{uiText('all_actions_83140cf')}</SelectItem>
                {ADMIN_AUDIT_ACTIONS.map((action) => (
                  <SelectItem key={action} value={action}>
                    {formatAuditActionLabel(action, uiText)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadAuditEntries(auditPage, auditFilters)}
              disabled={isAuditLoading}
            >
              {uiText.rich('sentence_33ac68602e96', {
                v0: () =>
                  isAuditLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  ),
              })}
            </Button>
          </div>
        </div>
        <div className="rounded-lg border border-subtle bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>{uiText('action_64cff13')}</TableHead>
                <TableHead>{uiText('target_978354d')}</TableHead>
                <TableHead>{uiText('status_920e413')}</TableHead>
                <TableHead>{uiText('when_cf9c7aa')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isAuditLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    {uiText('loading_audit_log_76ac988')}
                  </TableCell>
                </TableRow>
              ) : auditEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    {uiText('no_audit_entries_for_this_filter_7d3c04e')}
                  </TableCell>
                </TableRow>
              ) : (
                auditEntries.map((entry) => {
                  const isExpanded = expandedAuditId === entry.id;
                  const beforeJson = formatAuditJson(entry.before);
                  const afterJson = formatAuditJson(entry.after);
                  const metadataJson = formatAuditJson(entry.metadata);
                  const actorLabel = auditActorLabel(entry, uiText);
                  const actorEmailSecondary =
                    entry.actor_email && entry.actor_email !== actorLabel
                      ? entry.actor_email
                      : null;
                  return (
                    <Fragment key={entry.id}>
                      <TableRow
                        className="cursor-pointer"
                        data-testid="admin-audit-row"
                        onClick={() => toggleAuditExpanded(entry.id)}
                      >
                        <TableCell className="align-top">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-6"
                            aria-expanded={isExpanded}
                            aria-label={
                              isExpanded
                                ? uiText('collapse_details_0b65585')
                                : uiText('expand_details_957d5d5')
                            }
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleAuditExpanded(entry.id);
                            }}
                          >
                            {isExpanded ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronRight className="size-4" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="text-sm font-medium text-foreground">
                            {formatAuditActionLabel(entry.action, uiText)}
                          </div>
                          <p className="max-w-[220px] truncate text-xs text-muted-foreground">
                            {actorLabel}
                          </p>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="text-sm text-foreground">{entry.target_type}</div>
                          <p className="max-w-[320px] truncate font-mono text-xs text-muted-foreground">
                            {entry.target_id ?? uiText('none_140bedb')}
                          </p>
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge
                            variant={entry.status === 'success' ? 'secondary' : 'destructive'}
                            className="gap-1"
                          >
                            {entry.status === 'success' ? (
                              <CheckCircle2 className="size-3" />
                            ) : (
                              <ShieldAlert className="size-3" />
                            )}
                            {entry.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="align-top text-xs text-muted-foreground">
                          {formatDate(entry.created_at, uiLocale, uiText)}
                        </TableCell>
                      </TableRow>
                      {isExpanded ? (
                        <TableRow
                          className="bg-muted/40 hover:bg-muted/40"
                          data-testid="admin-audit-detail"
                        >
                          <TableCell colSpan={5} className="space-y-3 py-3">
                            <dl className="grid gap-2 text-xs sm:grid-cols-2">
                              <div>
                                <dt className="text-muted-foreground">{uiText('actor_449995c')}</dt>
                                <dd className="break-all text-foreground">{actorLabel}</dd>
                                {actorEmailSecondary ? (
                                  <dd className="break-all text-xs text-muted-foreground">
                                    {actorEmailSecondary}
                                  </dd>
                                ) : null}
                              </div>
                              <div>
                                <dt className="text-muted-foreground">
                                  {uiText('request_id_d561f52')}
                                </dt>
                                <dd className="font-mono break-all text-foreground">
                                  {entry.request_id ?? uiText('none_140bedb')}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">
                                  {uiText('target_978354d')}
                                </dt>
                                <dd className="font-mono break-all text-foreground">
                                  {entry.target_type}
                                  {entry.target_id ? <> · {entry.target_id}</> : null}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">
                                  {uiText('brand_profile_7230926')}
                                </dt>
                                <dd className="font-mono break-all text-foreground">
                                  {entry.brand_profile_id ?? uiText('none_140bedb')}
                                </dd>
                              </div>
                            </dl>
                            <div className="grid gap-3 lg:grid-cols-2">
                              <div>
                                <p className="mb-1 text-xs font-medium text-muted-foreground">
                                  {uiText('before_9bb7250')}
                                </p>
                                <pre className="max-h-64 overflow-auto rounded-md border border-subtle bg-background p-2 text-xs">
                                  {beforeJson ?? '—'}
                                </pre>
                              </div>
                              <div>
                                <p className="mb-1 text-xs font-medium text-muted-foreground">
                                  {uiText('after_7b68fe5')}
                                </p>
                                <pre className="max-h-64 overflow-auto rounded-md border border-subtle bg-background p-2 text-xs">
                                  {afterJson ?? '—'}
                                </pre>
                              </div>
                            </div>
                            {metadataJson ? (
                              <div>
                                <p className="mb-1 text-xs font-medium text-muted-foreground">
                                  {uiText('metadata_9eddf57')}
                                </p>
                                <pre className="max-h-64 overflow-auto rounded-md border border-subtle bg-background p-2 text-xs">
                                  {metadataJson}
                                </pre>
                              </div>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
          {auditPagination && auditTotalPages > 1 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-subtle p-3">
              <p className="text-xs text-muted-foreground">
                {uiText('m_108d9ea56d')}
                {auditPagination.page}
                {uiText('m_607f2de6ce')}
                {auditTotalPages} · {auditPagination.totalCount} {uiText('m_c2e311d614')}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToAuditPage(Math.max(1, auditPage - 1))}
                  disabled={!auditPagination.hasPrevPage || isAuditLoading}
                >
                  {uiText('previous_a57b08a')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToAuditPage(auditPage + 1)}
                  disabled={!auditPagination.hasNextPage || isAuditLoading}
                >
                  {uiText('next_1ff57a2')}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </TabsContent>

      <TabsContent value="reports" className="min-h-0 space-y-4 overflow-y-auto">
        <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <Card className="border-subtle bg-surface shadow-sm">
            <CardContent className="space-y-4 p-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  {uiText('first_value_report_smoke_test_61ffb99')}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {uiText('validate_or_send_the_onboarding_follow_up_ema_73178ab')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="first-value-brand-select">{uiText('brand_090ed43')}</Label>
                <Select value={reportBrandId || undefined} onValueChange={setReportBrandId}>
                  <SelectTrigger id="first-value-brand-select">
                    <SelectValue placeholder={uiText('choose_a_loaded_brand_c68e8b5')} />
                  </SelectTrigger>
                  <SelectContent>
                    {brands.map((brand) => (
                      <SelectItem key={brand.id} value={brand.id}>
                        {brand.brand_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="first-value-brand-id">{uiText('brand_id_4452264')}</Label>
                <Input
                  id="first-value-brand-id"
                  value={reportBrandId}
                  onChange={(event) => setReportBrandId(event.target.value)}
                  placeholder={uiText('paste_a_brand_profile_uuid_cd8eb82')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="first-value-recipient">
                  {uiText('recipient_override_0071f03')}
                </Label>
                <Input
                  id="first-value-recipient"
                  type="email"
                  value={reportRecipientEmail}
                  onChange={(event) => setReportRecipientEmail(event.target.value)}
                  placeholder={uiText('optional_send_smoke_email_to_this_address_92c69d3')}
                />
                <p className="text-xs text-muted-foreground">
                  {uiText('leave_blank_to_send_to_the_brand_owner_email__fa30b45')}
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={isReportSmokeLoading}
                  onClick={() => void handleFirstValueReportSmoke(false)}
                >
                  {uiText.rich('sentence_d3d8d23c6043', {
                    v0: () =>
                      isReportSmokeLoading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <PlayCircle className="size-4" />
                      ),
                  })}
                </Button>
                <Button
                  className="flex-1"
                  disabled={isReportSmokeLoading}
                  onClick={() => void handleFirstValueReportSmoke(true)}
                >
                  {uiText.rich('sentence_ad906f311213', {
                    v0: () =>
                      isReportSmokeLoading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Mail className="size-4" />
                      ),
                  })}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-subtle bg-surface shadow-sm">
            <CardContent className="space-y-4 p-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  {uiText('smoke_result_6f9273a')}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {uiText('the_report_can_send_with_any_section_that_has_548a568')}
                </p>
              </div>

              {!reportSmokeResult ? (
                <div className="rounded-lg border border-dashed border-subtle p-6 text-sm text-muted-foreground">
                  {uiText('run_validation_to_see_section_readiness_and_t_7b900ab')}
                </div>
              ) : reportSmokeResult.ok === false ? (
                <Alert variant="destructive">
                  <ShieldAlert className="size-4" />
                  <AlertTitle>
                    {reportSmokeResult.status ?? uiText('report_smoke_test_failed_0c5e576')}
                  </AlertTitle>
                  <AlertDescription>
                    {reportSmokeResult.error ??
                      reportSmokeResult.missing?.reason ??
                      uiText('required_report_data_is_missing_b916849')}
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert className="border-emerald-200 bg-emerald-50/60 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                  <CheckCircle2 className="size-4" />
                  <AlertTitle>
                    {reportSmokeResult.sent
                      ? uiText('smoke_email_sent_0bea2a1')
                      : uiText('report_ready_99e3bb0')}
                  </AlertTitle>
                  <AlertDescription>
                    {reportSmokeResult.resendMessageId
                      ? uiText('m_3a1d7edc7d', { v0: String(reportSmokeResult.resendMessageId) })
                      : uiText('one_or_more_report_sections_are_available_e726a3c')}
                  </AlertDescription>
                </Alert>
              )}

              {reportSmokeResult?.snapshot ? (
                <pre className="max-h-[460px] overflow-auto rounded-lg border border-subtle bg-default/60 p-3 text-xs text-muted-foreground">
                  {JSON.stringify(reportSmokeResult.snapshot, null, 2)}
                </pre>
              ) : reportSmokeResult?.missing ? (
                <pre className="max-h-[280px] overflow-auto rounded-lg border border-subtle bg-default/60 p-3 text-xs text-muted-foreground">
                  {JSON.stringify(reportSmokeResult.missing, null, 2)}
                </pre>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <Dialog
        open={Boolean(impersonationDialog)}
        onOpenChange={(open) => !open && setImpersonationDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{uiText('copy_impersonation_link_cb5229d')}</DialogTitle>
            <DialogDescription>
              {uiText.rich('sentence_4a2e69df7ef4', {
                v0: () => impersonationDialog?.email ?? uiText('this_user_0913f7b'),
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="impersonation-link">{uiText('impersonation_link_9378436')}</Label>
            <Input
              id="impersonation-link"
              value={impersonationDialog?.link ?? ''}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={async () => {
                if (!impersonationDialog?.link) return;
                const copied = await copyImpersonationLinkToClipboard(impersonationDialog.link);
                show({
                  title: copied ? uiText('m_c2e98476ef') : uiText('m_1d219e2bb8'),
                  description: copied ? uiText('m_7a38ec30aa') : uiText('m_bf97125940'),
                  variant: copied ? 'success' : 'warning',
                });
              }}
            >
              {uiText('copy_link_dbf362d')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}
