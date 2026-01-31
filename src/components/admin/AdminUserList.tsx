"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Badge,
  Button,
  Callout,
  Flex,
  Heading,
  ScrollArea,
  Text,
  TextField,
} from "@radix-ui/themes";
import { ChevronDownIcon, MagnifyingGlassIcon } from "@radix-ui/react-icons";
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

type Props = {
  users: AdminUser[];
  permissions: PermissionRow[];
  pagination: AdminPagination;
  searchQuery: string;
};

export function AdminUserList({ users, permissions, pagination, searchQuery }: Props) {
  const { show } = useToast();
  const [isNavPending, startNavTransition] = useTransition();
  const [isActionPending, startActionTransition] = useTransition();
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const [query, setQuery] = useState(searchQuery);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  useEffect(() => {
    setQuery(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    setExpandedUserId(null);
  }, [pagination.page, searchQuery]);

  async function copyImpersonationLinkToClipboard(url: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  }

  const permissionsByUserId = useMemo(() => groupPermissionsByUserId(permissions), [permissions]);

  const safePage = pagination.totalPages > 0 ? Math.min(pagination.page, pagination.totalPages) : pagination.page;
  const totalPages = Math.max(pagination.totalPages, 1);
  const totalCountLabel = pagination.totalCount.toLocaleString();
  const trimmedQuery = query.trim();
  const serverQueryActive = searchQuery.trim().length > 0;
  const visibleUsers = users;
  const pageSummary = `Showing ${visibleUsers.length} on this page`;
  const totalLabelSuffix = serverQueryActive ? "matches" : "total";
  const paginationItems = useMemo(
    () => buildAdminPaginationRange({ currentPage: safePage, totalPages, siblingCount: 1 }),
    [safePage, totalPages]
  );

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

  return (
    <Flex direction="column" gap="5">
      <Flex align="center" justify="between" gap="3" wrap="wrap">
        <div>
          <Heading size="5">Users</Heading>
          <Text color="gray" size="2">
            {pageSummary} · {totalCountLabel} {totalLabelSuffix}
            {isNavPending ? " · Updating..." : null}
          </Text>
        </div>
        <TextField.Root
          placeholder="Search by name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          size="2"
          className="min-w-[220px]"
        >
          <TextField.Slot side="left">
            <MagnifyingGlassIcon />
          </TextField.Slot>
        </TextField.Root>
      </Flex>

      <div className="w-full rounded-xl border border-subtle bg-surface shadow-xl">
        <ScrollArea type="auto" scrollbars="both" style={{ maxHeight: "70vh" }}>
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
                {visibleUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="px-5 py-6">
                      <Text size="2" color="gray">
                        {serverQueryActive ? "No users match this search." : "No users found."}
                      </Text>
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleUsers.map((user) => {
                    const memberships = permissionsByUserId.get(user.id) ?? [];
                    const isExpanded = expandedUserId === user.id;
                    const detailId = `admin-user-${user.id}-brands`;
                    const tierLabel =
                      memberships.length > 0
                        ? memberships.map((m) => String(m.brand_tier)).join(", ")
                        : "None";
                    const brandNames = memberships.map((m) => m.brand_name ?? m.brand_profile_id).filter(Boolean);
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

                    return (
                      <Fragment key={user.id}>
                        <TableRow className="group/row hover:bg-accent/30">
                          <TableCell className="py-3">
                            <div className="flex items-center gap-3">
                              <div className="grid h-9 w-9 place-items-center rounded-full bg-muted text-sm font-semibold text-primary">
                                {(user.name ?? user.email).slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <Heading size="4">{user.name ?? user.email}</Heading>
                                <Text size="2" color="gray">
                                  {user.email}
                                </Text>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-3">
                            {memberships.length === 0 ? (
                              <Text size="2" color="gray">
                                No brand memberships
                              </Text>
                            ) : (
                              <button
                                type="button"
                                aria-expanded={isExpanded}
                                aria-controls={detailId}
                                onClick={() => setExpandedUserId(isExpanded ? null : user.id)}
                                className={cn(
                                  "flex w-full items-center justify-between gap-3 rounded-md px-2 py-1 text-left transition-colors",
                                  "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                                  "group-hover/row:bg-accent/30",
                                  isExpanded && "bg-accent/50"
                                )}
                              >
                                <span className="flex flex-col">
                                  <Text size="2" weight="medium">
                                    {summaryTitle}
                                  </Text>
                                  <Text size="1" color="gray">
                                    {summaryDetail}
                                  </Text>
                                </span>
                                <ChevronDownIcon
                                  className={cn(
                                    "size-4 text-secondary transition-transform",
                                    isExpanded && "rotate-180"
                                  )}
                                />
                              </button>
                            )}
                          </TableCell>
                          <TableCell className="py-3">
                            <Text size="2" color="gray">
                              {tierLabel}
                            </Text>
                          </TableCell>
                          <TableCell className="py-3">
                            <Flex gap="2" justify="end" wrap="wrap">
                              {user.isAdmin && <Badge color="green">Admin</Badge>}
                              <Button
                                size="1"
                                variant="soft"
                                disabled={isActionPending}
                                onClick={() =>
                                  startActionTransition(async () => {
                                    try {
                                      const { data, error } = await supabase.functions.invoke("impersonate-user", {
                                        body: { target_id: user.id },
                                      });
                                      if (error || !data?.signInLink) {
                                        throw new Error(error?.message ?? "Failed to generate link");
                                      }
                                      const copied = await copyImpersonationLinkToClipboard(data.signInLink);
                                      show({
                                        title: "Impersonation link ready",
                                        description: copied
                                          ? "Link copied to clipboard."
                                          : "Copy blocked by the browser. Use a different browser or allow clipboard permissions.",
                                        variant: copied ? "success" : "warning",
                                      });
                                    } catch (error) {
                                      show({
                                        title: "Failed to impersonate",
                                        description: error instanceof Error ? error.message : "Unable to generate link.",
                                        variant: "error",
                                      });
                                    }
                                  })
                                }
                              >
                                Impersonate
                              </Button>
                              <Button
                                size="1"
                                variant="outline"
                                color={user.isAdmin ? "red" : "green"}
                                disabled={isActionPending}
                                onClick={() =>
                                  startActionTransition(async () => {
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
                                    }
                                  })
                                }
                              >
                                {user.isAdmin ? "Revoke admin" : "Make admin"}
                              </Button>
                            </Flex>
                          </TableCell>
                        </TableRow>
                        {isExpanded ? (
                          <TableRow className="bg-accent/20">
                            <TableCell colSpan={4} className="px-5 pb-5 pt-2">
                              <div id={detailId} className="rounded-lg border border-subtle bg-default/60 p-4">
                                <div className="flex flex-col gap-3">
                                  {memberships.map((membership) => {
                                    const tierValue = String(membership.brand_tier);

                                    return (
                                      <div
                                        key={`${membership.user_id}-${membership.brand_profile_id}`}
                                        className="flex flex-col gap-3 rounded-md border border-subtle bg-surface px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                                      >
                                        <div>
                                          <Text weight="medium">
                                            {membership.brand_name ?? membership.brand_profile_id}
                                          </Text>
                                          <Text color="gray" size="2">
                                            Role: {membership.role ?? "unknown"}
                                          </Text>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Text size="1" color="gray">
                                            Brand tier
                                          </Text>
                                          <Select
                                            defaultValue={tierValue}
                                            onValueChange={(value) =>
                                              startActionTransition(async () => {
                                                const nextTier = Number(value);
                                                if (!Number.isFinite(nextTier)) return;
                                                try {
                                                  const { error } = await supabase.functions.invoke("admin-update-tier", {
                                                    method: "POST",
                                                    body: {
                                                      brandProfileId: membership.brand_profile_id,
                                                      tier: nextTier,
                                                    },
                                                  });
                                                  if (error) throw new Error(error.message);
                                                  show({ title: "Brand tier updated", variant: "success" });
                                                } catch (error) {
                                                  show({
                                        title: "Failed to update brand tier",
                                        description: error instanceof Error ? error.message : "Unable to save brand tier.",
                                                    variant: "error",
                                                  });
                                                }
                                              })
                                            }
                                            disabled={isActionPending}
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
        </ScrollArea>
      </div>
      <Flex align="center" justify="between" gap="3" wrap="wrap">
        <Text size="2" color="gray">
          Page {safePage} of {totalPages}
        </Text>
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
      </Flex>
      <Callout.Root color="amber">
        <Callout.Text>Admin actions use service-role access; changes apply immediately.</Callout.Text>
      </Callout.Root>
    </Flex>
  );
}
