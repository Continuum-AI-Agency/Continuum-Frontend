"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Loader2, Search, ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/ToastProvider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AdminPagination, AdminUser, PermissionRow } from "@/components/admin/adminUserTypes";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export function AdminUserList({ users, permissions, pagination, searchQuery }: Props) {
  const { show } = useToast();
  const [isNavPending, startNavTransition] = useTransition();
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const [query, setQuery] = useState(searchQuery);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [pendingActions, setPendingActions] = useState<PendingActions>({});
  const [tierOverrides, setTierOverrides] = useState<Record<string, string>>({});
  const [impersonationDialog, setImpersonationDialog] = useState<ImpersonationDialogState | null>(null);

  useEffect(() => {
    setQuery(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    setExpandedUserId(null);
  }, [pagination.page, searchQuery]);

  useEffect(() => {
    setTierOverrides({});
  }, [permissions]);

  async function copyImpersonationLinkToClipboard(url: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  }

  function setActionPending(actionId: string, pending: boolean) {
    setPendingActions((prev) => {
      if (pending) {
        return { ...prev, [actionId]: true };
      }
      if (!prev[actionId]) return prev;
      const { [actionId]: _, ...rest } = prev;
      return rest;
    });
  }

  const permissionsByUserId = useMemo(() => groupPermissionsByUserId(permissions), [permissions]);

  const safePage = pagination.totalPages > 0 ? Math.min(pagination.page, pagination.totalPages) : pagination.page;
  const totalPages = Math.max(pagination.totalPages, 1);
  const totalCountLabel = pagination.totalCount.toLocaleString();
  const trimmedQuery = query.trim();
  const serverQueryActive = searchQuery.trim().length > 0;
  const pageSummary = `Showing ${users.length} on this page`;
  const totalLabelSuffix = serverQueryActive ? "matches" : "total";
  const paginationItems = useMemo(
    () => buildAdminPaginationRange({ currentPage: safePage, totalPages, siblingCount: 1 }),
    [safePage, totalPages]
  );

  const adminCount = useMemo(() => users.filter((user) => user.isAdmin).length, [users]);
  const membershipCount = permissions.length;
  const uniqueBrandCount = useMemo(
    () => new Set(permissions.map((permission) => permission.brand_profile_id)).size,
    [permissions]
  );

  const kpis = [
    {
      label: "Users (page)",
      value: users.length.toLocaleString(),
      description: serverQueryActive ? "Matches current search" : "Visible on this page",
    },
    {
      label: "Admins (page)",
      value: adminCount.toLocaleString(),
      description: "Privileged accounts",
    },
    {
      label: "Memberships",
      value: membershipCount.toLocaleString(),
      description: "Brand memberships in view",
    },
    {
      label: "Brands",
      value: uniqueBrandCount.toLocaleString(),
      description: "Unique brands represented",
    },
  ];

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

  async function handleImpersonate(user: AdminUser) {
    const actionId = `impersonate:${user.id}`;
    setActionPending(actionId, true);
    try {
      const { data, error } = await supabase.functions.invoke("impersonate-user", {
        body: { target_id: user.id },
      });
      if (error || !data?.signInLink) {
        throw new Error(error?.message ?? "Failed to generate link");
      }
      const copied = await copyImpersonationLinkToClipboard(data.signInLink);
      if (!copied) {
        setImpersonationDialog({ email: user.email, link: data.signInLink });
      }
      show({
        title: "Impersonation link ready",
        description: copied
          ? "Link copied to clipboard."
          : "Copy blocked by the browser. Use the manual copy dialog.",
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

  async function handleTierChange({
    membership,
    nextTier,
    previousTier,
  }: {
    membership: PermissionRow;
    nextTier: string;
    previousTier: string;
  }) {
    const actionId = `tier:${membership.user_id}:${membership.brand_profile_id}`;
    setTierOverrides((prev) => ({ ...prev, [actionId]: nextTier }));
    setActionPending(actionId, true);
    try {
      const nextTierValue = Number(nextTier);
      if (!Number.isFinite(nextTierValue)) return;
      const { error } = await supabase.functions.invoke("admin-update-tier", {
        method: "POST",
        body: {
          brandProfileId: membership.brand_profile_id,
          tier: nextTierValue,
        },
      });
      if (error) throw new Error(error.message);
      show({ title: "Brand tier updated", variant: "success" });
    } catch (error) {
      setTierOverrides((prev) => ({ ...prev, [actionId]: previousTier }));
      show({
        title: "Failed to update brand tier",
        description: error instanceof Error ? error.message : "Unable to save brand tier.",
        variant: "error",
      });
    } finally {
      setActionPending(actionId, false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-primary">Users</h2>
          <p className="text-sm text-muted-foreground">
            {pageSummary} · {totalCountLabel} {totalLabelSuffix}
            {isNavPending ? " · Updating..." : null}
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          <div className="w-full sm:w-[260px]">
            <Label htmlFor="admin-user-search" className="sr-only">
              Search users
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="admin-user-search"
                placeholder="Search by name or email"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          {isNavPending ? (
            <Badge variant="outline" className="w-fit">
              Updating
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="bg-surface border-subtle shadow-sm">
            <CardHeader className="space-y-2 px-4 pb-0 pt-4">
              <CardTitle className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {kpi.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-2xl font-semibold text-primary">{kpi.value}</div>
              <p className="text-xs text-muted-foreground">{kpi.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Alert className="border-amber-200 bg-amber-50/60 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        <ShieldAlert className="size-4" />
        <AlertTitle>Immediate changes</AlertTitle>
        <AlertDescription>Admin actions use service-role access; changes apply immediately.</AlertDescription>
      </Alert>

      <div className="w-full rounded-xl border border-subtle bg-surface shadow-xl">
        <div className="max-h-[70vh] overflow-auto">
          <div className="min-w-[940px]">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-surface">
                <TableRow>
                  <TableHead>Users</TableHead>
                  <TableHead>Brands</TableHead>
                  <TableHead>Brand tier</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="px-5 py-6">
                      <p className="text-sm text-muted-foreground">
                        {serverQueryActive ? "No users match this search." : "No users found."}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => {
                    const memberships = permissionsByUserId.get(user.id) ?? [];
                    const isExpanded = expandedUserId === user.id;
                    const detailId = `admin-user-${user.id}-brands`;
                    const tierLabel =
                      memberships.length > 0
                        ? memberships.map((membership) => String(membership.brand_tier)).join(", ")
                        : "None";
                    const brandNames = memberships.map((membership) => membership.brand_name ?? membership.brand_profile_id).filter(Boolean);
                    const primaryBrands = brandNames.slice(0, 2);
                    const remainingBrandCount = Math.max(0, brandNames.length - primaryBrands.length);
                    const summaryTitle =
                      memberships.length === 0
                        ? "No brand memberships"
                        : `${memberships.length} brand${memberships.length > 1 ? "s" : ""}`;
                    const summaryDetail =
                      memberships.length === 0
                        ? "No memberships yet"
                        : `${primaryBrands.join(", ")}${remainingBrandCount > 0 ? ` +${remainingBrandCount} more` : ""}`;
                    const impersonateActionId = `impersonate:${user.id}`;
                    const adminActionId = `admin:${user.id}`;
                    const isImpersonatePending = Boolean(pendingActions[impersonateActionId]);
                    const isAdminPending = Boolean(pendingActions[adminActionId]);

                    return (
                      <Fragment key={user.id}>
                        <TableRow className="group/row hover:bg-accent/30">
                          <TableCell className="py-3">
                            <div className="flex items-center gap-3">
                              <div className="grid h-9 w-9 place-items-center rounded-full bg-muted text-sm font-semibold text-primary">
                                {(user.name ?? user.email).slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-primary">{user.name ?? user.email}</div>
                                <p className="text-xs text-muted-foreground">{user.email}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-3">
                            {memberships.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No brand memberships</p>
                            ) : (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-expanded={isExpanded}
                                aria-controls={detailId}
                                onClick={() => setExpandedUserId(isExpanded ? null : user.id)}
                                className={cn(
                                  "flex h-auto w-full items-center justify-between gap-3 rounded-md px-2 py-1 text-left",
                                  "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                                  "group-hover/row:bg-accent/30",
                                  isExpanded && "bg-accent/50"
                                )}
                              >
                                <span className="flex flex-col items-start">
                                  <span className="text-sm font-medium text-primary">{summaryTitle}</span>
                                  <span className="text-xs text-muted-foreground">{summaryDetail}</span>
                                </span>
                                <ChevronDown
                                  className={cn("size-4 text-muted-foreground transition-transform", isExpanded && "rotate-180")}
                                />
                              </Button>
                            )}
                          </TableCell>
                          <TableCell className="py-3">
                            <p className="text-sm text-muted-foreground">{tierLabel}</p>
                          </TableCell>
                          <TableCell className="py-3">
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              {user.isAdmin ? <Badge variant="secondary">Admin</Badge> : null}
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={isImpersonatePending}
                                onClick={() => void handleImpersonate(user)}
                              >
                                {isImpersonatePending ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : null}
                                Impersonate
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant={user.isAdmin ? "destructive" : "outline"}
                                    disabled={isAdminPending}
                                  >
                                    {isAdminPending ? (
                                      <Loader2 className="size-4 animate-spin" />
                                    ) : null}
                                    {user.isAdmin ? "Revoke admin" : "Make admin"}
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>
                                      {user.isAdmin ? "Revoke admin access?" : "Grant admin access?"}
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      {user.isAdmin
                                        ? "This user will lose admin privileges immediately."
                                        : "This user will gain admin privileges immediately."}
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => void handleAdminToggle(user)}>
                                      Confirm
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                        {isExpanded ? (
                          <TableRow className="bg-accent/20">
                            <TableCell colSpan={4} className="px-5 pb-5 pt-2">
                              <div id={detailId} className="rounded-lg border border-subtle bg-default/60 p-4">
                                <div className="flex flex-col gap-3">
                                  {memberships.map((membership) => {
                                    const tierValue = String(membership.brand_tier);
                                    const tierActionId = `tier:${membership.user_id}:${membership.brand_profile_id}`;
                                    const currentTier = tierOverrides[tierActionId] ?? tierValue;
                                    const isTierPending = Boolean(pendingActions[tierActionId]);

                                    return (
                                      <div
                                        key={`${membership.user_id}-${membership.brand_profile_id}`}
                                        className="flex flex-col gap-3 rounded-md border border-subtle bg-surface px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                                      >
                                        <div>
                                          <p className="text-sm font-medium text-primary">
                                            {membership.brand_name ?? membership.brand_profile_id}
                                          </p>
                                          <p className="text-xs text-muted-foreground">Role: {membership.role ?? "unknown"}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs text-muted-foreground">Brand tier</span>
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
                                            disabled={isTierPending}
                                          >
                                            <SelectTrigger size="sm" className="min-w-[160px]">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="0">0 — Restricted</SelectItem>
                                              <SelectItem value="1">1 — Studio+</SelectItem>
                                              <SelectItem value="2">2 — Social+</SelectItem>
                                              <SelectItem value="3">3 — Creative+</SelectItem>
                                            </SelectContent>
                                          </Select>
                                          {isTierPending ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
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

      <Dialog
        open={Boolean(impersonationDialog)}
        onOpenChange={(open) => {
          if (!open) setImpersonationDialog(null);
        }}
      >
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
    </div>
  );
}
