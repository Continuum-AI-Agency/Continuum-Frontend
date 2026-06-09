"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2,
  CheckCircle2,
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
} from "lucide-react";

import { useToast } from "@/components/ui/ToastProvider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  AdminAuditLogEntry,
  AdminBrandOption,
  AdminPagination,
  AdminUser,
  AdminWorkflowLibraryRow,
  PermissionRow,
} from "@/components/admin/adminUserTypes";
import {
  buildAdminPaginationRange,
  buildAdminUserListPaginationParams,
  buildAdminUserListSearchParams,
  groupPermissionsByUserId,
} from "@/components/admin/adminUserListUtils";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

type AdminAuditResponse = {
  entries?: AdminAuditLogEntry[];
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

function formatDate(value: string | null | undefined) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function roleVariant(role: string | null) {
  if (role === "owner") return "default";
  if (role === "admin") return "secondary";
  return "outline";
}

export function AdminUserList({ users, permissions, pagination, searchQuery }: Props) {
  const { show } = useToast();
  const [isNavPending, startNavTransition] = useTransition();
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();

  const [query, setQuery] = useState(searchQuery);
  const [selectedUserId, setSelectedUserId] = useState(users[0]?.id ?? null);
  const [pendingActions, setPendingActions] = useState<PendingActions>({});
  const [tierOverrides, setTierOverrides] = useState<Record<string, string>>({});
  const [impersonationDialog, setImpersonationDialog] = useState<ImpersonationDialogState | null>(null);

  const [brands, setBrands] = useState<AdminBrandOption[]>([]);
  const [brandQuery, setBrandQuery] = useState("");
  const [sourceBrandId, setSourceBrandId] = useState("global");
  const [targetBrandId, setTargetBrandId] = useState("");
  const [workflowQuery, setWorkflowQuery] = useState("");
  const [workflows, setWorkflows] = useState<AdminWorkflowLibraryRow[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [isWorkflowLoading, setIsWorkflowLoading] = useState(false);
  const [auditEntries, setAuditEntries] = useState<AdminAuditLogEntry[]>([]);
  const [isAuditLoading, setIsAuditLoading] = useState(false);
  const [reportBrandId, setReportBrandId] = useState("");
  const [reportRecipientEmail, setReportRecipientEmail] = useState("");
  const [reportSmokeResult, setReportSmokeResult] = useState<FirstValueReportSmokeResponse | null>(null);
  const [isReportSmokeLoading, setIsReportSmokeLoading] = useState(false);

  useEffect(() => {
    setQuery(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    setSelectedUserId(users[0]?.id ?? null);
  }, [pagination.page, searchQuery, users]);

  useEffect(() => {
    setTierOverrides({});
  }, [permissions]);

  const permissionsByUserId = useMemo(() => groupPermissionsByUserId(permissions), [permissions]);
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? users[0] ?? null;
  const selectedMemberships = selectedUser ? permissionsByUserId.get(selectedUser.id) ?? [] : [];
  const selectedWorkflow = workflows.find((workflow) => workflow.id === selectedWorkflowId) ?? null;

  const safePage = pagination.totalPages > 0 ? Math.min(pagination.page, pagination.totalPages) : pagination.page;
  const totalPages = Math.max(pagination.totalPages, 1);
  const totalCountLabel = pagination.totalCount.toLocaleString();
  const trimmedQuery = query.trim();
  const serverQueryActive = searchQuery.trim().length > 0;
  const totalLabelSuffix = serverQueryActive ? "matches" : "total";
  const paginationItems = useMemo(
    () => buildAdminPaginationRange({ currentPage: safePage, totalPages, siblingCount: 1 }),
    [safePage, totalPages]
  );

  const adminCount = useMemo(() => users.filter((user) => user.isAdmin).length, [users]);
  const ownerMemberships = useMemo(() => permissions.filter((permission) => permission.role === "owner").length, [permissions]);
  const uniqueBrandCount = useMemo(
    () => new Set(permissions.map((permission) => permission.brand_profile_id)).size,
    [permissions]
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
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    startNavTransition(() => {
      const params = buildAdminUserListPaginationParams(searchParamsString, nextPage, pagination.pageSize);
      router.push(`?${params}`);
    });
  }

  function getPageHref(nextPage: number) {
    const params = buildAdminUserListPaginationParams(searchParamsString, nextPage, pagination.pageSize);
    return `?${params}`;
  }

  useEffect(() => {
    const currentQuery = new URLSearchParams(searchParamsString).get("query") ?? "";
    if (trimmedQuery === currentQuery.trim()) return;

    const timeout = setTimeout(() => {
      startNavTransition(() => {
        const params = buildAdminUserListSearchParams(searchParamsString, trimmedQuery, pagination.pageSize);
        router.push(`?${params}`);
      });
    }, 300);

    return () => clearTimeout(timeout);
  }, [trimmedQuery, pagination.pageSize, router, searchParamsString, startNavTransition]);

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
      const { data, error } = await supabase.functions.invoke("impersonate-user", {
        body: { target_id: user.id },
      });
      if (error || !data?.signInLink) throw new Error(error?.message ?? "Failed to generate link");
      const copied = await copyImpersonationLinkToClipboard(data.signInLink);
      if (!copied) setImpersonationDialog({ email: user.email, link: data.signInLink });
      show({
        title: "Impersonation link ready",
        description: copied ? "Link copied to clipboard." : "Copy blocked by the browser. Use the manual copy dialog.",
        variant: copied ? "success" : "warning",
      });
    } catch (error) {
      show({
        title: "Failed to impersonate",
        description: error instanceof Error ? error.message : "Unable to generate link.",
        variant: "error",
      });
    } finally {
      setActionPending(actionId, false);
    }
  }

  async function handleAdminToggle(user: AdminUser) {
    const actionId = `admin:${user.id}`;
    setActionPending(actionId, true);
    try {
      const { error } = await supabase.functions.invoke("admin-set-admin", {
        method: "POST",
        body: { userId: user.id, isAdmin: !user.isAdmin },
      });
      if (error) throw new Error(error.message);
      show({ title: user.isAdmin ? "Admin revoked" : "Admin granted", variant: "success" });
      router.refresh();
    } catch (error) {
      show({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Unable to update admin flag.",
        variant: "error",
      });
    } finally {
      setActionPending(actionId, false);
    }
  }

  async function handleTierChange(input: { membership: PermissionRow; nextTier: string; previousTier: string }) {
    const actionId = `tier:${input.membership.user_id}:${input.membership.brand_profile_id}`;
    setTierOverrides((prev) => ({ ...prev, [actionId]: input.nextTier }));
    setActionPending(actionId, true);
    try {
      const nextTierValue = Number(input.nextTier);
      if (!Number.isFinite(nextTierValue)) return;
      const { error } = await supabase.functions.invoke("admin-update-tier", {
        method: "POST",
        body: { brandProfileId: input.membership.brand_profile_id, tier: nextTierValue },
      });
      if (error) throw new Error(error.message);
      show({ title: "Brand tier updated", variant: "success" });
      router.refresh();
    } catch (error) {
      setTierOverrides((prev) => ({ ...prev, [actionId]: input.previousTier }));
      show({
        title: "Failed to update brand tier",
        description: error instanceof Error ? error.message : "Unable to save brand tier.",
        variant: "error",
      });
    } finally {
      setActionPending(actionId, false);
    }
  }

  async function handleRemoveMember(membership: PermissionRow) {
    if (membership.role === "owner") return;
    const actionId = `remove:${membership.user_id}:${membership.brand_profile_id}`;
    setActionPending(actionId, true);
    try {
      const { error } = await supabase.functions.invoke("admin-access-actions", {
        method: "POST",
        body: {
          action: "remove_member",
          brandProfileId: membership.brand_profile_id,
          userId: membership.user_id,
        },
      });
      if (error) throw new Error(error.message);
      show({ title: "Member removed", variant: "success" });
      router.refresh();
    } catch (error) {
      show({
        title: "Removal failed",
        description: error instanceof Error ? error.message : "Unable to remove member.",
        variant: "error",
      });
    } finally {
      setActionPending(actionId, false);
    }
  }

  async function loadBrands() {
    const { data, error } = await supabase.functions.invoke<AdminWorkflowResponse>("admin-workflow-library", {
      method: "POST",
      body: { action: "list_brands", query: brandQuery, limit: 100 },
    });
    if (error) {
      show({ title: "Unable to load brands", description: error.message, variant: "error" });
      return;
    }
    setBrands(data?.brands ?? []);
  }

  async function loadWorkflows() {
    setIsWorkflowLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<AdminWorkflowResponse>("admin-workflow-library", {
        method: "POST",
        body: {
          action: "list",
          query: workflowQuery,
          ...(sourceBrandId !== "global" ? { brandProfileId: sourceBrandId } : {}),
        },
      });
      if (error) throw new Error(error.message);
      setWorkflows(data?.workflows ?? []);
      setSelectedWorkflowId((current) => {
        if (current && data?.workflows?.some((workflow) => workflow.id === current)) return current;
        return data?.workflows?.[0]?.id ?? null;
      });
    } catch (error) {
      show({
        title: "Unable to load workflows",
        description: error instanceof Error ? error.message : "Workflow library request failed.",
        variant: "error",
      });
    } finally {
      setIsWorkflowLoading(false);
    }
  }

  async function loadAuditEntries() {
    setIsAuditLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<AdminAuditResponse>("admin-audit-log", {
        method: "POST",
        body: { page: 1, pageSize: 50 },
      });
      if (error) throw new Error(error.message);
      setAuditEntries(data?.entries ?? []);
    } catch (error) {
      show({
        title: "Unable to load audit log",
        description: error instanceof Error ? error.message : "Audit request failed.",
        variant: "error",
      });
    } finally {
      setIsAuditLoading(false);
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
    void loadAuditEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleWorkflowAction(action: "migrate_global_to_brand" | "duplicate_to_brand" | "promote_to_global") {
    if (!selectedWorkflow) return;
    if (action !== "promote_to_global" && !targetBrandId) {
      show({ title: "Choose a destination brand", variant: "warning" });
      return;
    }

    const actionId = `workflow:${action}:${selectedWorkflow.id}`;
    setActionPending(actionId, true);
    try {
      const { error } = await supabase.functions.invoke("admin-workflow-library", {
        method: "POST",
        body: {
          action,
          workflowId: selectedWorkflow.id,
          ...(action !== "promote_to_global" ? { targetBrandProfileId: targetBrandId } : {}),
        },
      });
      if (error) throw new Error(error.message);
      show({ title: "Workflow action complete", variant: "success" });
      await loadWorkflows();
      await loadAuditEntries();
    } catch (error) {
      show({
        title: "Workflow action failed",
        description: error instanceof Error ? error.message : "Unable to update workflow library.",
        variant: "error",
      });
    } finally {
      setActionPending(actionId, false);
    }
  }

  async function handleFirstValueReportSmoke(send: boolean) {
    const brandId = reportBrandId.trim();
    if (!brandId) {
      show({ title: "Brand ID required", description: "Select or paste a brand ID first.", variant: "warning" });
      return;
    }

    setIsReportSmokeLoading(true);
    setReportSmokeResult(null);
    try {
      const { data, error } = await supabase.functions.invoke<FirstValueReportSmokeResponse>(
        "send-first-value-report",
        {
          method: "POST",
          body: {
            action: "smoke_test",
            brandId,
            send,
            ...(reportRecipientEmail.trim() ? { recipientEmail: reportRecipientEmail.trim() } : {}),
          },
        }
      );
      if (error) throw new Error(error.message);
      const result = data ?? { status: "unknown" };
      setReportSmokeResult(result);
      show({
        title: send ? "Smoke email sent" : "Report is ready",
        description: send
          ? result.resendMessageId
            ? `Resend message ${result.resendMessageId}`
            : "Resend accepted the message."
          : "One or more report sections are available.",
        variant: "success",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to run first value report smoke test.";
      setReportSmokeResult({ status: "failed", ok: false, error: message });
      show({
        title: send ? "Smoke send failed" : "Smoke validation failed",
        description: message,
        variant: "error",
      });
    } finally {
      setIsReportSmokeLoading(false);
    }
  }

  return (
    <Tabs defaultValue="users" className="space-y-5">
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
            <span className="block text-[11px] uppercase tracking-[0.16em]">Users</span>
            <strong className="text-base text-primary">{users.length}</strong> / {totalCountLabel}
          </div>
          <div className="rounded-md border border-subtle bg-surface px-3 py-2">
            <span className="block text-[11px] uppercase tracking-[0.16em]">Admins</span>
            <strong className="text-base text-primary">{adminCount}</strong> page
          </div>
          <div className="rounded-md border border-subtle bg-surface px-3 py-2">
            <span className="block text-[11px] uppercase tracking-[0.16em]">Brands</span>
            <strong className="text-base text-primary">{uniqueBrandCount}</strong> in view
          </div>
          <div className="rounded-md border border-subtle bg-surface px-3 py-2">
            <span className="block text-[11px] uppercase tracking-[0.16em]">Owners</span>
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
                <p className="text-xs text-muted-foreground">
                  Showing {users.length} on this page · {totalCountLabel} {totalLabelSuffix}
                  {isNavPending ? " · Updating..." : null}
                </p>
              </div>
              <div className="w-full lg:w-[320px]">
                <Label htmlFor="admin-user-search" className="sr-only">
                  Search users
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="admin-user-search"
                    placeholder="Search users by name or email"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>

            <Alert className="border-amber-200 bg-amber-50/60 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <ShieldAlert className="size-4" />
              <AlertTitle>Immediate audited changes</AlertTitle>
              <AlertDescription>
                Service-role actions apply immediately. Owner memberships are locked and cannot be removed in this panel.
              </AlertDescription>
            </Alert>

            <div className="rounded-lg border border-subtle bg-surface">
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
                          <TableCell colSpan={4} className="px-5 py-6 text-sm text-muted-foreground">
                            {serverQueryActive ? "No users match this search." : "No users found."}
                          </TableCell>
                        </TableRow>
                      ) : (
                        users.map((user) => {
                          const memberships = permissionsByUserId.get(user.id) ?? [];
                          const isSelected = selectedUser?.id === user.id;
                          const ownerCount = memberships.filter((membership) => membership.role === "owner").length;
                          const brandSummary =
                            memberships.length === 0
                              ? "No brand memberships"
                              : memberships
                                  .slice(0, 2)
                                  .map((membership) => membership.brand_name ?? membership.brand_profile_id)
                                  .join(", ");

                          return (
                            <TableRow
                              key={user.id}
                              data-state={isSelected ? "selected" : undefined}
                              className="cursor-pointer"
                              onClick={() => setSelectedUserId(user.id)}
                            >
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <div className="grid h-9 w-9 place-items-center rounded-full bg-muted text-sm font-semibold text-primary">
                                    {getUserInitials(user)}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-primary">{user.name ?? user.email}</div>
                                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm text-primary">{memberships.length} memberships</div>
                                <p className="max-w-[360px] truncate text-xs text-muted-foreground">{brandSummary}</p>
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
                                  {memberships.length === 0 && <Badge variant="outline">No brands</Badge>}
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
                                  {pendingActions[`impersonate:${user.id}`] ? <Loader2 className="size-4 animate-spin" /> : null}
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
                      onClick={(event) => handlePageNavigation(event, Math.max(1, pagination.page - 1))}
                      disabled={!pagination.hasPrevPage || isNavPending}
                    />
                  </PaginationItem>
                  {paginationItems.map((item, index) =>
                    item === "ellipsis" ? (
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
                    )
                  )}
                  <PaginationItem>
                    <PaginationNext
                      href={getPageHref(Math.min(totalPages, pagination.page + 1))}
                      onClick={(event) => handlePageNavigation(event, Math.min(totalPages, pagination.page + 1))}
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
                      <h3 className="truncate text-base font-semibold text-primary">{selectedUser.name ?? selectedUser.email}</h3>
                      <p className="truncate text-xs text-muted-foreground">{selectedUser.email}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Created {formatDate(selectedUser.createdAt)}</p>
                    </div>
                    {selectedUser.isAdmin ? <Badge variant="secondary">Admin</Badge> : <Badge variant="outline">User</Badge>}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={Boolean(pendingActions[`impersonate:${selectedUser.id}`])}
                      onClick={() => void handleImpersonate(selectedUser)}
                    >
                      {pendingActions[`impersonate:${selectedUser.id}`] ? <Loader2 className="size-4 animate-spin" /> : null}
                      Impersonate
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant={selectedUser.isAdmin ? "destructive" : "outline"}
                          disabled={Boolean(pendingActions[`admin:${selectedUser.id}`])}
                        >
                          {pendingActions[`admin:${selectedUser.id}`] ? <Loader2 className="size-4 animate-spin" /> : null}
                          {selectedUser.isAdmin ? "Revoke admin" : "Make admin"}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{selectedUser.isAdmin ? "Revoke admin access?" : "Grant admin access?"}</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action is immediate and will be written to the admin audit log.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => void handleAdminToggle(selectedUser)}>Confirm</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Brand access</h4>
                  {selectedMemberships.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No memberships for this user.</p>
                  ) : (
                    selectedMemberships.map((membership) => {
                      const tierValue = String(membership.brand_tier);
                      const tierActionId = `tier:${membership.user_id}:${membership.brand_profile_id}`;
                      const currentTier = tierOverrides[tierActionId] ?? tierValue;
                      const removeActionId = `remove:${membership.user_id}:${membership.brand_profile_id}`;
                      const isOwner = membership.role === "owner";

                      return (
                        <div key={`${membership.user_id}-${membership.brand_profile_id}`} className="rounded-md border border-subtle bg-default/40 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-primary">
                                {membership.brand_name ?? membership.brand_profile_id}
                              </p>
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                <Badge variant={roleVariant(membership.role)}>{membership.role ?? "unknown"}</Badge>
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
                                void handleTierChange({ membership, nextTier: value, previousTier: currentTier });
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
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="sm" variant="destructive" disabled={Boolean(pendingActions[removeActionId])}>
                                    {pendingActions[removeActionId] ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                                    Remove access
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Remove this brand membership?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This removes the user from {membership.brand_name ?? "this brand"} and writes an audit log entry.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => void handleRemoveMember(membership)}>Remove</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4 text-sm text-muted-foreground">Select a user to inspect access.</div>
            )}
          </aside>
        </div>
      </TabsContent>

      <TabsContent value="workflows" className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_380px]">
          <Card className="border-subtle bg-surface shadow-sm">
            <CardContent className="space-y-4 p-4">
              <div>
                <h2 className="text-base font-semibold text-primary">Source</h2>
                <p className="text-xs text-muted-foreground">Global workflow library or brand canvas workflows.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="workflow-brand-search">Brand search</Label>
                <Input
                  id="workflow-brand-search"
                  placeholder="Search brands"
                  value={brandQuery}
                  onChange={(event) => setBrandQuery(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Source</Label>
                <Select value={sourceBrandId} onValueChange={setSourceBrandId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Global workflow library</SelectItem>
                    {brands.map((brand) => (
                      <SelectItem key={brand.id} value={brand.id}>
                        {brand.brand_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Destination brand</Label>
                <Select value={targetBrandId || undefined} onValueChange={setTargetBrandId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose destination" />
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
              <Button variant="outline" size="sm" onClick={() => void loadWorkflows()} className="w-full">
                <RefreshCw className="size-4" />
                Refresh workflows
              </Button>
            </CardContent>
          </Card>

          <div className="rounded-lg border border-subtle bg-surface">
            <div className="flex items-center justify-between gap-3 border-b border-subtle p-3">
              <div>
                <h2 className="text-base font-semibold text-primary">Workflow Assignments</h2>
                <p className="text-xs text-muted-foreground">Assign global workflows to brands, duplicate canvas workflows, and promote brand workflows globally.</p>
              </div>
              <div className="relative w-[280px]">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search workflows"
                  value={workflowQuery}
                  onChange={(event) => setWorkflowQuery(event.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="max-h-[620px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-surface">
                  <TableRow>
                    <TableHead>Workflow</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isWorkflowLoading ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                        Loading workflows...
                      </TableCell>
                    </TableRow>
                  ) : workflows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                        No workflows found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    workflows.map((workflow) => (
                      <TableRow
                        key={workflow.id}
                        data-state={workflow.id === selectedWorkflowId ? "selected" : undefined}
                        className="cursor-pointer"
                        onClick={() => setSelectedWorkflowId(workflow.id)}
                      >
                        <TableCell>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-primary">{workflow.name}</div>
                            <p className="line-clamp-1 text-xs text-muted-foreground">{workflow.description ?? "No description"}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {workflow.visibility === "global" ? (
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
                        <TableCell className="text-xs text-muted-foreground">{formatDate(workflow.updated_at)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <aside className="rounded-lg border border-subtle bg-surface p-4">
            {selectedWorkflow ? (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2">
                    {selectedWorkflow.visibility === "global" ? <Globe2 className="size-4 text-brand-primary" /> : <Library className="size-4 text-brand-primary" />}
                    <h3 className="min-w-0 truncate text-base font-semibold text-primary">{selectedWorkflow.name}</h3>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{selectedWorkflow.description ?? "No description"}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border border-subtle bg-default/40 p-2">
                    <span className="block text-muted-foreground">Scope</span>
                    <strong className="text-primary">{selectedWorkflow.visibility}</strong>
                  </div>
                  <div className="rounded-md border border-subtle bg-default/40 p-2">
                    <span className="block text-muted-foreground">Nodes</span>
                    <strong className="text-primary">
                      {Array.isArray((selectedWorkflow.content as { nodes?: unknown[] } | undefined)?.nodes)
                        ? (selectedWorkflow.content as { nodes?: unknown[] }).nodes?.length
                        : 0}
                    </strong>
                  </div>
                </div>
                <Alert className="border-subtle">
                  <Copy className="size-4" />
                  <AlertTitle>Duplicate policy</AlertTitle>
                  <AlertDescription>Conflicting names are saved as renamed copies.</AlertDescription>
                </Alert>
                <div className="space-y-2">
                  {selectedWorkflow.visibility === "global" ? (
                    <Button
                      className="w-full"
                      disabled={!targetBrandId || Boolean(pendingActions[`workflow:migrate_global_to_brand:${selectedWorkflow.id}`])}
                      onClick={() => void handleWorkflowAction("migrate_global_to_brand")}
                    >
                      {pendingActions[`workflow:migrate_global_to_brand:${selectedWorkflow.id}`] ? <Loader2 className="size-4 animate-spin" /> : <Building2 className="size-4" />}
                      Assign to brand canvas
                    </Button>
                  ) : (
                    <Fragment>
                      <Button
                        className="w-full"
                        disabled={!targetBrandId || Boolean(pendingActions[`workflow:duplicate_to_brand:${selectedWorkflow.id}`])}
                        onClick={() => void handleWorkflowAction("duplicate_to_brand")}
                      >
                        {pendingActions[`workflow:duplicate_to_brand:${selectedWorkflow.id}`] ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />}
                        Duplicate canvas workflow
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={Boolean(pendingActions[`workflow:promote_to_global:${selectedWorkflow.id}`])}
                        onClick={() => void handleWorkflowAction("promote_to_global")}
                      >
                        {pendingActions[`workflow:promote_to_global:${selectedWorkflow.id}`] ? <Loader2 className="size-4 animate-spin" /> : <Globe2 className="size-4" />}
                        Promote to global library
                      </Button>
                    </Fragment>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Select a workflow to manage it.</p>
            )}
          </aside>
        </div>
      </TabsContent>

      <TabsContent value="audit" className="space-y-3">
        <div className="flex items-center justify-between rounded-lg border border-subtle bg-surface p-3">
          <div>
            <h2 className="text-base font-semibold text-primary">Admin Audit Log</h2>
            <p className="text-xs text-muted-foreground">Latest service-role admin actions.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadAuditEntries()} disabled={isAuditLoading}>
            {isAuditLoading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Refresh
          </Button>
        </div>
        <div className="rounded-lg border border-subtle bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isAuditLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    Loading audit log...
                  </TableCell>
                </TableRow>
              ) : auditEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    No audit entries yet.
                  </TableCell>
                </TableRow>
              ) : (
                auditEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <div className="text-sm font-medium text-primary">{entry.action}</div>
                      <p className="text-xs text-muted-foreground">Actor {entry.actor_user_id ?? "unknown"}</p>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-primary">{entry.target_type}</div>
                      <p className="max-w-[320px] truncate text-xs text-muted-foreground">{entry.target_id ?? "none"}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={entry.status === "success" ? "secondary" : "destructive"} className="gap-1">
                        {entry.status === "success" ? <CheckCircle2 className="size-3" /> : <ShieldAlert className="size-3" />}
                        {entry.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(entry.created_at)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      <TabsContent value="reports" className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <Card className="border-subtle bg-surface shadow-sm">
            <CardContent className="space-y-4 p-4">
              <div>
                <h2 className="text-base font-semibold text-primary">First Value Report Smoke Test</h2>
                <p className="text-xs text-muted-foreground">
                  Validate or send the onboarding follow-up email for a specific brand without waiting for cron.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="first-value-brand-select">Brand</Label>
                <Select
                  value={reportBrandId || undefined}
                  onValueChange={setReportBrandId}
                >
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
                  {isReportSmokeLoading ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
                  Validate
                </Button>
                <Button
                  className="flex-1"
                  disabled={isReportSmokeLoading}
                  onClick={() => void handleFirstValueReportSmoke(true)}
                >
                  {isReportSmokeLoading ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
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
                  The report can send with any section that has renderable email content. The snapshot shows ready sections, rendered insight counts, and chart points.
                </p>
              </div>

              {!reportSmokeResult ? (
                <div className="rounded-lg border border-dashed border-subtle p-6 text-sm text-muted-foreground">
                  Run validation to see section readiness and the report snapshot.
                </div>
              ) : reportSmokeResult.ok === false ? (
                <Alert variant="destructive">
                  <ShieldAlert className="size-4" />
                  <AlertTitle>{reportSmokeResult.status ?? "Report smoke test failed"}</AlertTitle>
                  <AlertDescription>
                    {reportSmokeResult.error ??
                      reportSmokeResult.missing?.reason ??
                      "Required report data is missing."}
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert className="border-emerald-200 bg-emerald-50/60 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                  <CheckCircle2 className="size-4" />
                  <AlertTitle>{reportSmokeResult.sent ? "Smoke email sent" : "Report ready"}</AlertTitle>
                  <AlertDescription>
                    {reportSmokeResult.resendMessageId
                      ? `Resend message ID: ${reportSmokeResult.resendMessageId}`
                      : "One or more report sections are available."}
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

      <Dialog open={Boolean(impersonationDialog)} onOpenChange={(open) => !open && setImpersonationDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy impersonation link</DialogTitle>
            <DialogDescription>
              Paste this link into a browser to impersonate {impersonationDialog?.email ?? "this user"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="impersonation-link">Impersonation link</Label>
            <Input
              id="impersonation-link"
              value={impersonationDialog?.link ?? ""}
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
                  title: copied ? "Link copied" : "Copy blocked",
                  description: copied
                    ? "The impersonation link is on your clipboard."
                    : "Copy blocked by the browser. Use a different browser or allow clipboard permissions.",
                  variant: copied ? "success" : "warning",
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
