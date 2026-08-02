'use client';

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
import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { AdminActionConfirmation } from '@/components/admin/AdminActionConfirmation';
import {
  ADMIN_AUDIT_ACTIONS,
  auditActorLabel,
  buildAdminAuditRequestBody,
  buildAdminPaginationRange,
  buildAdminTabParams,
  buildAdminUserListPaginationParams,
  buildAdminUserListSearchParams,
  canBulkTransfer,
  describeWorkflowNames,
  formatAuditActionLabel,
  formatBrandDisambiguationLabel,
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
import { BrandTransferCombobox } from '@/components/admin/BrandTransferCombobox';
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
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type Props = {
  users: AdminUser[];
  permissions: PermissionRow[];
  pagination: AdminPagination;
  searchQuery: string;
};

type PendingActions = Record<string, boolean>;

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
};

const GLOBAL_LIBRARY_BRAND_OPTION: AdminBrandOption = {
  id: 'global',
  brand_name: 'Global workflow library',
  tier: 0,
  active: true,
  ownerEmail: null,
};
const SEARCH_DEBOUNCE_MS = 300;

type AdminAuditResponse = {
  entries?: AdminAuditLogEntry[];
  pagination?: AdminAuditPagination;
};

const AUDIT_PAGE_SIZE = 50;
const AUDIT_ACTION_ALL = 'all';

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

function formatDate(value: string | null | undefined) {
  if (!value) return 'Unknown';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
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

export function AdminUserList({ users, permissions, pagination, searchQuery }: Props) {
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
  const [impersonationDialog, setImpersonationDialog] = useState<ImpersonationDialogState | null>(
    null,
  );

  const [brands, setBrands] = useState<AdminBrandOption[]>([]);
  const [brandQuery, setBrandQuery] = useState('');
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
  }, [permissions]);

  const permissionsByUserId = useMemo(() => groupPermissionsByUserId(permissions), [permissions]);
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? users[0] ?? null;
  const selectedMemberships = selectedUser ? (permissionsByUserId.get(selectedUser.id) ?? []) : [];
  const focusedWorkflow = workflows.find((workflow) => workflow.id === focusedWorkflowId) ?? null;
  const checkedWorkflows = useMemo(
    () => workflows.filter((workflow) => checkedWorkflowIds.has(workflow.id)),
    [workflows, checkedWorkflowIds],
  );
  const bulkEligibility = useMemo(() => canBulkTransfer(checkedWorkflows), [checkedWorkflows]);
  const checkedWorkflowNamesLabel = useMemo(
    () => describeWorkflowNames(checkedWorkflows.map((workflow) => workflow.name)),
    [checkedWorkflows],
  );
  const allCheckedAreBrandScoped =
    checkedWorkflows.length > 0 &&
    checkedWorkflows.every((workflow) => workflow.visibility === 'brand');
  const allCheckedAreGlobalScoped =
    checkedWorkflows.length > 0 &&
    checkedWorkflows.every((workflow) => workflow.visibility === 'global');
  const brandFilterOptions = useMemo(() => [GLOBAL_LIBRARY_BRAND_OPTION, ...brands], [brands]);
  const allVisibleWorkflowsChecked =
    workflows.length > 0 && workflows.every((workflow) => checkedWorkflowIds.has(workflow.id));

  const safePage =
    pagination.totalPages > 0 ? Math.min(pagination.page, pagination.totalPages) : pagination.page;
  const totalPages = Math.max(pagination.totalPages, 1);
  const totalCountLabel = pagination.totalCount.toLocaleString();
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
      if (error || !data?.signInLink) throw new Error(error?.message ?? 'Failed to generate link');
      const copied = await copyImpersonationLinkToClipboard(data.signInLink);
      if (!copied) setImpersonationDialog({ email: user.email, link: data.signInLink });
      show({
        title: 'Impersonation link ready',
        description: copied
          ? 'Link copied to clipboard.'
          : 'Copy blocked by the browser. Use the manual copy dialog.',
        variant: copied ? 'success' : 'warning',
      });
    } catch (error) {
      show({
        title: 'Failed to impersonate',
        description: error instanceof Error ? error.message : 'Unable to generate link.',
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
      if (error) throw new Error(error.message);
      show({ title: user.isAdmin ? 'Admin revoked' : 'Admin granted', variant: 'success' });
      router.refresh();
    } catch (error) {
      show({
        title: 'Update failed',
        description: error instanceof Error ? error.message : 'Unable to update admin flag.',
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
      if (error) throw new Error(error.message);
      show({ title: 'Brand tier updated', variant: 'success' });
      router.refresh();
    } catch (error) {
      setTierOverrides((prev) => ({ ...prev, [actionId]: input.previousTier }));
      show({
        title: 'Failed to update brand tier',
        description: error instanceof Error ? error.message : 'Unable to save brand tier.',
        variant: 'error',
      });
    } finally {
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
      if (error) throw new Error(error.message);
      show({ title: 'Member removed', variant: 'success' });
      router.refresh();
    } catch (error) {
      show({
        title: 'Removal failed',
        description: error instanceof Error ? error.message : 'Unable to remove member.',
        variant: 'error',
      });
    } finally {
      setActionPending(actionId, false);
    }
  }

  async function loadBrands() {
    const { data, error } = await supabase.functions.invoke<AdminWorkflowResponse>(
      'admin-workflow-library',
      {
        method: 'POST',
        body: { action: 'list_brands', query: brandQuery, limit: 100 },
      },
    );
    if (error) {
      show({ title: 'Unable to load brands', description: error.message, variant: 'error' });
      return;
    }
    setBrands(data?.brands ?? []);
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
            query: workflowQuery,
            ...(sourceBrandId !== 'global' ? { brandProfileId: sourceBrandId } : {}),
          },
        },
      );
      if (error) throw new Error(error.message);
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
        title: 'Unable to load workflows',
        description: error instanceof Error ? error.message : 'Workflow library request failed.',
        variant: 'error',
      });
    } finally {
      setIsWorkflowLoading(false);
    }
  }

  async function loadAuditEntries(page: number, action: string) {
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
            action: action === AUDIT_ACTION_ALL ? null : action,
          }),
        },
      );
      if (error) throw new Error(error.message);
      if (!isCurrent()) return;
      setAuditEntries(data?.entries ?? []);
      setAuditPagination(data?.pagination ?? null);
    } catch (error) {
      if (!isCurrent()) return;
      show({
        title: 'Unable to load audit log',
        description: error instanceof Error ? error.message : 'Audit request failed.',
        variant: 'error',
      });
    } finally {
      if (isCurrent()) setIsAuditLoading(false);
    }
  }

  useEffect(() => {
    void loadBrands();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandQuery]);

  useEffect(() => {
    void loadWorkflows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceBrandId, workflowQuery]);

  useEffect(() => {
    void loadAuditEntries(auditPage, auditActionFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditPage, auditActionFilter]);

  function handleAuditActionChange(value: string) {
    setExpandedAuditId(null);
    setAuditPage(1);
    setAuditActionFilter(value);
  }

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
      if (workflows.length > 0 && workflows.every((workflow) => current.has(workflow.id))) {
        return new Set();
      }
      return new Set(workflows.map((workflow) => workflow.id));
    });
  }

  async function runBulkTransfer(args: {
    actionId: string;
    successVerb: string;
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
            ? `${outcomes.length} workflow${outcomes.length === 1 ? '' : 's'} ${args.successVerb}`
            : `${outcomes.length - failed.length}/${outcomes.length} ${args.successVerb}`,
        description:
          failed.length === 0 ? undefined : `${failed.length} failed — see details below.`,
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
      await loadAuditEntries(auditPage, auditActionFilter);
    } catch (error) {
      show({
        title: 'Bulk action failed',
        description: error instanceof Error ? error.message : 'Unable to complete the bulk action.',
        variant: 'error',
      });
    } finally {
      setActionPending(args.actionId, false);
    }
  }

  async function runSingleItemBulk(args: {
    actionId: string;
    successVerb: string;
    ids: string[];
    buildBody: (workflowId: string) => Record<string, unknown>;
  }) {
    const nameById = new Map(workflows.map((workflow) => [workflow.id, workflow.name]));
    await runBulkTransfer({
      actionId: args.actionId,
      successVerb: args.successVerb,
      run: async () => {
        return Promise.all(
          args.ids.map(async (workflowId) => {
            const { error } = await supabase.functions.invoke('admin-workflow-library', {
              method: 'POST',
              body: args.buildBody(workflowId),
            });
            return {
              workflowId,
              workflowName: nameById.get(workflowId) ?? workflowId,
              status: error ? ('failed' as const) : ('success' as const),
              message: error?.message,
            };
          }),
        );
      },
    });
  }

  async function handleBulkMove() {
    if (!targetBrandId) {
      show({ title: 'Choose a destination brand', variant: 'warning' });
      return;
    }
    const ids = Array.from(checkedWorkflowIds);
    const nameById = new Map(workflows.map((workflow) => [workflow.id, workflow.name]));
    await runBulkTransfer({
      actionId: 'workflow-bulk:move',
      successVerb: 'moved',
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
        if (error) throw new Error(error.message);
        return (data?.results ?? []).map((result) => ({
          workflowId: result.workflowId,
          workflowName: nameById.get(result.workflowId) ?? result.workflowId,
          status: result.status === 'moved' ? ('success' as const) : ('failed' as const),
          message: result.error,
        }));
      },
    });
  }

  async function handleBulkCopy() {
    if (!targetBrandId) {
      show({ title: 'Choose a destination brand', variant: 'warning' });
      return;
    }
    await runSingleItemBulk({
      actionId: 'workflow-bulk:copy',
      successVerb: 'copied',
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
      successVerb: 'promoted to the global library',
      ids: Array.from(checkedWorkflowIds),
      buildBody: (workflowId) => ({ action: 'promote_to_global', workflowId }),
    });
  }

  async function handleBulkAssignToBrand() {
    if (!targetBrandId) {
      show({ title: 'Choose a destination brand', variant: 'warning' });
      return;
    }
    await runSingleItemBulk({
      actionId: 'workflow-bulk:assign',
      successVerb: 'assigned to the brand canvas',
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
        title: 'Brand ID required',
        description: 'Select or paste a brand ID first.',
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
      if (error) throw new Error(error.message);
      const result = data ?? { status: 'unknown' };
      setReportSmokeResult(result);
      show({
        title: send ? 'Smoke email sent' : 'Report is ready',
        description: send
          ? result.resendMessageId
            ? `Resend message ${result.resendMessageId}`
            : 'Resend accepted the message.'
          : 'One or more report sections are available.',
        variant: 'success',
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to run first value report smoke test.';
      setReportSmokeResult({ status: 'failed', ok: false, error: message });
      show({
        title: send ? 'Smoke send failed' : 'Smoke validation failed',
        description: message,
        variant: 'error',
      });
    } finally {
      setIsReportSmokeLoading(false);
    }
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <TabsList className="w-full justify-start overflow-x-auto rounded-md bg-surface p-1 xl:w-auto">
          <TabsTrigger value="users" className="gap-2">
            <UserCog className="size-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="workflows" className="gap-2">
            <Library className="size-4" />
            Workflows
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2">
            <History className="size-4" />
            Audit
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-2">
            <Mail className="size-4" />
            Reports
          </TabsTrigger>
        </TabsList>
        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-4 xl:min-w-[560px]">
          <div className="rounded-md border border-subtle bg-surface px-3 py-2">
            <span className="block text-xs uppercase tracking-[0.16em]">Users</span>
            <strong className="text-base text-primary">{users.length}</strong> / {totalCountLabel}
          </div>
          <div className="rounded-md border border-subtle bg-surface px-3 py-2">
            <span className="block text-xs uppercase tracking-[0.16em]">Admins</span>
            <strong className="text-base text-primary">{adminCount}</strong> page
          </div>
          <div className="rounded-md border border-subtle bg-surface px-3 py-2">
            <span className="block text-xs uppercase tracking-[0.16em]">Brands</span>
            <strong className="text-base text-primary">{uniqueBrandCount}</strong> in view
          </div>
          <div className="rounded-md border border-subtle bg-surface px-3 py-2">
            <span className="block text-xs uppercase tracking-[0.16em]">Owners</span>
            <strong className="text-base text-primary">{ownerMemberships}</strong> locked
          </div>
        </div>
      </div>

      <TabsContent value="users" className="space-y-4">
        <div className="grid min-h-[640px] gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-4">
            <div className="flex flex-col gap-3 rounded-lg border border-subtle bg-surface p-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-base font-semibold text-primary">User Directory</h2>
                <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
                  Showing {users.length} on this page · {totalCountLabel} {totalLabelSuffix}
                  {isDirectoryUpdating ? ' · Updating...' : null}
                </p>
              </div>
              <div className="w-full lg:w-[320px]">
                <Label htmlFor="admin-user-search" className="sr-only">
                  Search users
                </Label>
                <div className="relative">
                  {isDirectoryUpdating ? (
                    <Loader2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  ) : (
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  )}
                  <Input
                    id="admin-user-search"
                    placeholder="Search users by name or email"
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
                      aria-label="Clear search"
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
              <AlertTitle>Immediate audited changes</AlertTitle>
              <AlertDescription>
                Service-role actions apply immediately. Owner memberships are locked and cannot be
                removed in this panel.
              </AlertDescription>
            </Alert>

            <div
              data-testid="admin-user-directory-results"
              aria-busy={isDirectoryUpdating}
              className={`rounded-lg border border-subtle bg-surface transition-opacity ${
                isDirectoryUpdating ? 'opacity-70' : ''
              }`}
            >
              <div className="max-h-[64vh] overflow-auto">
                <div className="min-w-[900px]">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-surface">
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Brands</TableHead>
                        <TableHead>Role state</TableHead>
                        <TableHead className="text-right">Primary action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className="px-5 py-6 text-sm text-muted-foreground"
                          >
                            {serverQueryActive ? 'No users match this search.' : 'No users found.'}
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
                              ? 'No brand memberships'
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
                                  <div className="grid h-9 w-9 place-items-center rounded-full bg-muted text-sm font-semibold text-primary">
                                    {getUserInitials(user)}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-primary">
                                      {user.name ?? user.email}
                                    </div>
                                    <p className="truncate text-xs text-muted-foreground">
                                      {user.email}
                                    </p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm text-primary">
                                  {membershipLabel(memberships.length)}
                                </div>
                                <p className="max-w-[360px] truncate text-xs text-muted-foreground">
                                  {brandSummary}
                                </p>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {user.isAdmin ? <Badge variant="secondary">Admin</Badge> : null}
                                  {ownerCount > 0 ? (
                                    <Badge variant="outline" className="gap-1">
                                      <Lock className="size-3" />
                                      {ownerCount} owner
                                    </Badge>
                                  ) : null}
                                  {memberships.length === 0 && (
                                    <Badge variant="outline">No brands</Badge>
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
                                  {pendingActions[`impersonate:${user.id}`] ? (
                                    <Loader2 className="size-4 animate-spin" />
                                  ) : null}
                                  Impersonate
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

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Page {safePage} of {totalPages}
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
                      First
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
                      Last
                    </PaginationLink>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </div>

          <aside className="min-w-0 rounded-lg border border-subtle bg-surface">
            {selectedUser ? (
              <div className="flex h-full flex-col">
                <div className="border-b border-subtle p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold text-primary">
                        {selectedUser.name ?? selectedUser.email}
                      </h3>
                      <p className="truncate text-xs text-muted-foreground">{selectedUser.email}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Created {formatDate(selectedUser.createdAt)}
                      </p>
                    </div>
                    {selectedUser.isAdmin ? (
                      <Badge variant="secondary">Admin</Badge>
                    ) : (
                      <Badge variant="outline">User</Badge>
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={Boolean(pendingActions[`impersonate:${selectedUser.id}`])}
                      onClick={() => void handleImpersonate(selectedUser)}
                    >
                      {pendingActions[`impersonate:${selectedUser.id}`] ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : null}
                      Impersonate
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
                          {selectedUser.isAdmin ? 'Revoke admin' : 'Make admin'}
                        </Button>
                      }
                      title={selectedUser.isAdmin ? 'Revoke admin access?' : 'Grant admin access?'}
                      description="This action is immediate and will be written to the admin audit log."
                      confirmLabel={selectedUser.isAdmin ? 'Revoke admin' : 'Make admin'}
                      targetEmail={selectedUser.email}
                      requireTypedEmail={!selectedUser.isAdmin}
                      onConfirm={() => void handleAdminToggle(selectedUser)}
                    />
                  </div>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Brand access
                  </h4>
                  {selectedMemberships.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No memberships for this user.</p>
                  ) : (
                    selectedMemberships.map((membership) => {
                      const tierValue = String(membership.brand_tier);
                      const tierActionId = `tier:${membership.user_id}:${membership.brand_profile_id}`;
                      const currentTier = tierOverrides[tierActionId] ?? tierValue;
                      const removeActionId = `remove:${membership.user_id}:${membership.brand_profile_id}`;
                      const isOwner = membership.role === 'owner';

                      return (
                        <div
                          key={`${membership.user_id}-${membership.brand_profile_id}`}
                          className="rounded-md border border-subtle bg-default/40 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-primary">
                                {membership.brand_name ?? membership.brand_profile_id}
                              </p>
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                <Badge variant={roleVariant(membership.role)}>
                                  {membership.role ?? 'unknown'}
                                </Badge>
                                <Badge variant="outline">Tier {currentTier}</Badge>
                                {isOwner ? (
                                  <Badge variant="outline" className="gap-1">
                                    <Lock className="size-3" />
                                    locked
                                  </Badge>
                                ) : null}
                              </div>
                            </div>
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
                                <SelectItem value="0">Tier 0</SelectItem>
                                <SelectItem value="1">Tier 1</SelectItem>
                                <SelectItem value="2">Tier 2</SelectItem>
                                <SelectItem value="3">Tier 3</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="mt-3 flex justify-end">
                            {isOwner ? (
                              <Button size="sm" variant="outline" disabled className="gap-2">
                                <Lock className="size-4" />
                                Owner locked
                              </Button>
                            ) : (
                              <AdminActionConfirmation
                                trigger={
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    disabled={Boolean(pendingActions[removeActionId])}
                                  >
                                    {pendingActions[removeActionId] ? (
                                      <Loader2 className="size-4 animate-spin" />
                                    ) : (
                                      <Trash2 className="size-4" />
                                    )}
                                    Remove access
                                  </Button>
                                }
                                title="Remove this brand membership?"
                                description={`This removes ${selectedUser.email} from ${membership.brand_name ?? 'this brand'} and writes an audit log entry.`}
                                confirmLabel="Remove access"
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
                Select a user to inspect access.
              </div>
            )}
          </aside>
        </div>
      </TabsContent>

      <TabsContent value="workflows" className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-col gap-3 rounded-lg border border-subtle bg-surface p-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-primary">Workflow Library</h2>
                <p className="truncate text-xs text-muted-foreground">
                  Viewing{' '}
                  {formatBrandDisambiguationLabel(
                    brandFilterOptions.find((brand) => brand.id === sourceBrandId) ??
                      GLOBAL_LIBRARY_BRAND_OPTION,
                  )}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative w-full sm:w-[220px]">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search workflows"
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
                    placeholder="Filter by brand"
                  />
                </div>
                <Button variant="outline" size="sm" onClick={() => void loadWorkflows()}>
                  <RefreshCw className="size-4" />
                  Refresh
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
                          disabled={workflows.length === 0}
                          aria-label="Select all visible workflows"
                        />
                      </TableHead>
                      <TableHead>Workflow</TableHead>
                      <TableHead>Scope</TableHead>
                      <TableHead>Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isWorkflowLoading ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="py-8 text-center text-sm text-muted-foreground"
                        >
                          Loading workflows...
                        </TableCell>
                      </TableRow>
                    ) : workflows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="py-8 text-center text-sm text-muted-foreground"
                        >
                          No workflows found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      workflows.map((workflow) => (
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
                              aria-label={`Select ${workflow.name}`}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-primary">
                                {workflow.name}
                              </div>
                              <p className="line-clamp-1 text-xs text-muted-foreground">
                                {workflow.description ?? 'No description'}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            {workflow.visibility === 'global' ? (
                              <Badge variant="secondary" className="gap-1">
                                <Globe2 className="size-3" />
                                Global
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1">
                                <Building2 className="size-3" />
                                Brand
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDate(workflow.updated_at)}
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
                      <h3 className="min-w-0 truncate text-base font-semibold text-primary">
                        {focusedWorkflow.name}
                      </h3>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {focusedWorkflow.description ?? 'No description'}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md border border-subtle bg-default/40 p-2">
                      <span className="block text-muted-foreground">Scope</span>
                      <strong className="text-primary">{focusedWorkflow.visibility}</strong>
                    </div>
                    <div className="rounded-md border border-subtle bg-default/40 p-2">
                      <span className="block text-muted-foreground">Nodes</span>
                      <strong className="text-primary">
                        {Array.isArray(
                          (focusedWorkflow.content as { nodes?: unknown[] } | undefined)?.nodes,
                        )
                          ? (focusedWorkflow.content as { nodes?: unknown[] }).nodes?.length
                          : 0}
                      </strong>
                    </div>
                  </div>
                  <Alert className="border-subtle">
                    <Copy className="size-4" />
                    <AlertTitle>Duplicate policy</AlertTitle>
                    <AlertDescription>
                      Copy and assign actions save conflicting names as renamed copies. Move
                      re-creates the workflow under the destination brand and removes the original.
                    </AlertDescription>
                  </Alert>
                  <p className="text-xs text-muted-foreground">
                    Check this workflow (and any others) in the table to transfer it — the transfer
                    bar appears at the bottom once at least one is selected.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Select a workflow to preview it.</p>
              )}
            </div>

            {transferResults && transferResults.length > 0 ? (
              <div className="rounded-lg border border-subtle bg-surface p-4">
                <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Last transfer
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
                        <p className="truncate text-primary">{result.workflowName}</p>
                        {result.message ? (
                          <p className="text-muted-foreground">{result.message}</p>
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
              <div className="text-sm text-primary">
                <strong>{checkedWorkflowIds.size}</strong>{' '}
                {checkedWorkflowIds.size === 1 ? 'workflow' : 'workflows'} selected
                {!bulkEligibility.allowed ? (
                  <span className="ml-2 text-xs text-destructive">{bulkEligibility.reason}</span>
                ) : null}
              </div>
              <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
                {bulkEligibility.allowed ? (
                  <div className="w-full sm:w-[300px]">
                    <BrandTransferCombobox
                      id="workflow-target-brand"
                      brands={brands}
                      value={targetBrandId}
                      onChange={setTargetBrandId}
                      placeholder="Choose destination brand"
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
                          {pendingActions['workflow-bulk:move'] ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <ArrowRightLeft className="size-4" />
                          )}
                          Move to brand
                        </Button>
                      }
                      title={`Move ${checkedWorkflows.length} workflow${checkedWorkflows.length === 1 ? '' : 's'}?`}
                      description={`${checkedWorkflowNamesLabel} will be removed from the current brand and re-created under the destination brand. This is logged.`}
                      confirmLabel="Move to brand"
                      onConfirm={() => void handleBulkMove()}
                    />
                    <AdminActionConfirmation
                      trigger={
                        <Button
                          variant="outline"
                          disabled={!targetBrandId || Boolean(pendingActions['workflow-bulk:copy'])}
                        >
                          {pendingActions['workflow-bulk:copy'] ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Copy className="size-4" />
                          )}
                          Copy to brand
                        </Button>
                      }
                      title={`Copy ${checkedWorkflows.length} workflow${checkedWorkflows.length === 1 ? '' : 's'}?`}
                      description={`${checkedWorkflowNamesLabel} will be duplicated under the destination brand. Originals are unaffected.`}
                      confirmLabel="Copy to brand"
                      onConfirm={() => void handleBulkCopy()}
                    />
                    <AdminActionConfirmation
                      trigger={
                        <Button
                          variant="outline"
                          disabled={Boolean(pendingActions['workflow-bulk:promote'])}
                        >
                          {pendingActions['workflow-bulk:promote'] ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Globe2 className="size-4" />
                          )}
                          Promote to global
                        </Button>
                      }
                      title={`Promote ${checkedWorkflows.length} workflow${checkedWorkflows.length === 1 ? '' : 's'}?`}
                      description={`${checkedWorkflowNamesLabel} will be added to the global workflow library.`}
                      confirmLabel="Promote to global"
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
                        {pendingActions['workflow-bulk:assign'] ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Building2 className="size-4" />
                        )}
                        Assign to brand canvas
                      </Button>
                    }
                    title={`Assign ${checkedWorkflows.length} workflow${checkedWorkflows.length === 1 ? '' : 's'}?`}
                    description={`${checkedWorkflowNamesLabel} will be copied into the destination brand's canvas workflows.`}
                    confirmLabel="Assign to brand canvas"
                    onConfirm={() => void handleBulkAssignToBrand()}
                  />
                ) : null}

                <Button variant="ghost" size="sm" onClick={clearCheckedWorkflows}>
                  Clear
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </TabsContent>

      <TabsContent value="audit" className="space-y-3" data-testid="admin-audit-panel">
        <div className="flex flex-col gap-3 rounded-lg border border-subtle bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-primary">Admin Audit Log</h2>
            <p className="text-xs text-muted-foreground">
              Immutable trail of service-role admin actions. Expand a row for the before/after
              change.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={auditActionFilter} onValueChange={handleAuditActionChange}>
              <SelectTrigger className="h-9 w-[220px]" aria-label="Filter by action">
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUDIT_ACTION_ALL}>All actions</SelectItem>
                {ADMIN_AUDIT_ACTIONS.map((action) => (
                  <SelectItem key={action} value={action}>
                    {formatAuditActionLabel(action)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadAuditEntries(auditPage, auditActionFilter)}
              disabled={isAuditLoading}
            >
              {isAuditLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Refresh
            </Button>
          </div>
        </div>
        <div className="rounded-lg border border-subtle bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isAuditLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    Loading audit log...
                  </TableCell>
                </TableRow>
              ) : auditEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    No audit entries for this filter.
                  </TableCell>
                </TableRow>
              ) : (
                auditEntries.map((entry) => {
                  const isExpanded = expandedAuditId === entry.id;
                  const beforeJson = formatAuditJson(entry.before);
                  const afterJson = formatAuditJson(entry.after);
                  const metadataJson = formatAuditJson(entry.metadata);
                  const actorLabel = auditActorLabel(entry);
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
                            aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
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
                          <div className="text-sm font-medium text-primary">
                            {formatAuditActionLabel(entry.action)}
                          </div>
                          <p className="max-w-[220px] truncate text-xs text-muted-foreground">
                            {actorLabel}
                          </p>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="text-sm text-primary">{entry.target_type}</div>
                          <p className="max-w-[320px] truncate font-mono text-xs text-muted-foreground">
                            {entry.target_id ?? 'none'}
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
                          {formatDate(entry.created_at)}
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
                                <dt className="text-muted-foreground">Actor</dt>
                                <dd className="break-all text-primary">{actorLabel}</dd>
                                {actorEmailSecondary ? (
                                  <dd className="break-all text-xs text-muted-foreground">
                                    {actorEmailSecondary}
                                  </dd>
                                ) : null}
                              </div>
                              <div>
                                <dt className="text-muted-foreground">Request ID</dt>
                                <dd className="font-mono break-all text-primary">
                                  {entry.request_id ?? 'none'}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">Target</dt>
                                <dd className="font-mono break-all text-primary">
                                  {entry.target_type}
                                  {entry.target_id ? ` · ${entry.target_id}` : ''}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">Brand profile</dt>
                                <dd className="font-mono break-all text-primary">
                                  {entry.brand_profile_id ?? 'none'}
                                </dd>
                              </div>
                            </dl>
                            <div className="grid gap-3 lg:grid-cols-2">
                              <div>
                                <p className="mb-1 text-xs font-medium text-muted-foreground">
                                  Before
                                </p>
                                <pre className="max-h-64 overflow-auto rounded-md border border-subtle bg-background p-2 text-xs">
                                  {beforeJson ?? '—'}
                                </pre>
                              </div>
                              <div>
                                <p className="mb-1 text-xs font-medium text-muted-foreground">
                                  After
                                </p>
                                <pre className="max-h-64 overflow-auto rounded-md border border-subtle bg-background p-2 text-xs">
                                  {afterJson ?? '—'}
                                </pre>
                              </div>
                            </div>
                            {metadataJson ? (
                              <div>
                                <p className="mb-1 text-xs font-medium text-muted-foreground">
                                  Metadata
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
                Page {auditPagination.page} of {auditTotalPages} · {auditPagination.totalCount}{' '}
                entries
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToAuditPage(Math.max(1, auditPage - 1))}
                  disabled={!auditPagination.hasPrevPage || isAuditLoading}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToAuditPage(auditPage + 1)}
                  disabled={!auditPagination.hasNextPage || isAuditLoading}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </TabsContent>

      <TabsContent value="reports" className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <Card className="border-subtle bg-surface shadow-sm">
            <CardContent className="space-y-4 p-4">
              <div>
                <h2 className="text-base font-semibold text-primary">
                  First Value Report Smoke Test
                </h2>
                <p className="text-xs text-muted-foreground">
                  Validate or send the onboarding follow-up email for a specific brand without
                  waiting for cron.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="first-value-brand-select">Brand</Label>
                <Select value={reportBrandId || undefined} onValueChange={setReportBrandId}>
                  <SelectTrigger id="first-value-brand-select">
                    <SelectValue placeholder="Choose a loaded brand" />
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
                <Label htmlFor="first-value-brand-id">Brand ID</Label>
                <Input
                  id="first-value-brand-id"
                  value={reportBrandId}
                  onChange={(event) => setReportBrandId(event.target.value)}
                  placeholder="Paste a brand profile UUID"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="first-value-recipient">Recipient override</Label>
                <Input
                  id="first-value-recipient"
                  type="email"
                  value={reportRecipientEmail}
                  onChange={(event) => setReportRecipientEmail(event.target.value)}
                  placeholder="Optional: send smoke email to this address"
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to send to the brand owner email stored in permissions.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={isReportSmokeLoading}
                  onClick={() => void handleFirstValueReportSmoke(false)}
                >
                  {isReportSmokeLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <PlayCircle className="size-4" />
                  )}
                  Validate
                </Button>
                <Button
                  className="flex-1"
                  disabled={isReportSmokeLoading}
                  onClick={() => void handleFirstValueReportSmoke(true)}
                >
                  {isReportSmokeLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Mail className="size-4" />
                  )}
                  Send smoke email
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-subtle bg-surface shadow-sm">
            <CardContent className="space-y-4 p-4">
              <div>
                <h2 className="text-base font-semibold text-primary">Smoke Result</h2>
                <p className="text-xs text-muted-foreground">
                  The report can send with any section that has renderable email content. The
                  snapshot shows ready sections, rendered insight counts, and chart points.
                </p>
              </div>

              {!reportSmokeResult ? (
                <div className="rounded-lg border border-dashed border-subtle p-6 text-sm text-muted-foreground">
                  Run validation to see section readiness and the report snapshot.
                </div>
              ) : reportSmokeResult.ok === false ? (
                <Alert variant="destructive">
                  <ShieldAlert className="size-4" />
                  <AlertTitle>{reportSmokeResult.status ?? 'Report smoke test failed'}</AlertTitle>
                  <AlertDescription>
                    {reportSmokeResult.error ??
                      reportSmokeResult.missing?.reason ??
                      'Required report data is missing.'}
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert className="border-emerald-200 bg-emerald-50/60 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                  <CheckCircle2 className="size-4" />
                  <AlertTitle>
                    {reportSmokeResult.sent ? 'Smoke email sent' : 'Report ready'}
                  </AlertTitle>
                  <AlertDescription>
                    {reportSmokeResult.resendMessageId
                      ? `Resend message ID: ${reportSmokeResult.resendMessageId}`
                      : 'One or more report sections are available.'}
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
            <DialogTitle>Copy impersonation link</DialogTitle>
            <DialogDescription>
              Paste this link into a browser to impersonate{' '}
              {impersonationDialog?.email ?? 'this user'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="impersonation-link">Impersonation link</Label>
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
                  title: copied ? 'Link copied' : 'Copy blocked',
                  description: copied
                    ? 'The impersonation link is on your clipboard.'
                    : 'Copy blocked by the browser. Use a different browser or allow clipboard permissions.',
                  variant: copied ? 'success' : 'warning',
                });
              }}
            >
              Copy link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}
