"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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
import * as Accordion from "@radix-ui/react-accordion";
import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { useToast } from "@/components/ui/ToastProvider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AdminPagination, AdminUser, PermissionRow } from "@/components/admin/adminUserTypes";
import { filterAndSortAdminUsers, groupPermissionsByUserId } from "@/components/admin/adminUserListUtils";

type Props = {
  users: AdminUser[];
  permissions: PermissionRow[];
  pagination: AdminPagination;
  searchQuery: string;
};

export function AdminUserList({ users, permissions, pagination, searchQuery }: Props) {
  const { show } = useToast();
  const [isPending, startTransition] = useTransition();
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const [query, setQuery] = useState(searchQuery);

  useEffect(() => {
    setQuery(searchQuery);
  }, [searchQuery]);

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
  const totalCountLabel = pagination.totalCount.toLocaleString();
  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length > 0;
  const serverQueryActive = searchQuery.trim().length > 0;
  const visibleUsers = useMemo(() => filterAndSortAdminUsers(users, trimmedQuery), [users, trimmedQuery]);
  const pageSummary = `Showing ${visibleUsers.length} on this page`;
  const totalLabelSuffix = serverQueryActive ? "matches" : "total";

  function updatePage(nextPage: number) {
    if (nextPage === pagination.page) return;
    const params = new URLSearchParams(searchParamsString);
    params.set("page", String(nextPage));
    params.set("pageSize", String(pagination.pageSize));
    router.push(`?${params.toString()}`);
  }

  useEffect(() => {
    const currentQuery = new URLSearchParams(searchParamsString).get("query") ?? "";
    if (trimmedQuery === currentQuery.trim()) return;

    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParamsString);
      if (trimmedQuery) {
        params.set("query", trimmedQuery);
      } else {
        params.delete("query");
      }
      params.set("page", "1");
      params.set("pageSize", String(pagination.pageSize));
      router.push(`?${params.toString()}`);
    }, 300);

    return () => clearTimeout(timeout);
  }, [trimmedQuery, pagination.pageSize, router, searchParamsString]);

  return (
    <Flex direction="column" gap="5">
      <Flex align="center" justify="between" gap="3" wrap="wrap">
        <div>
          <Heading size="5">Users</Heading>
          <Text color="gray" size="2">
            {pageSummary} · {totalCountLabel} {totalLabelSuffix}
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

      <div className="w-full rounded-xl border border-[var(--gray-6)] bg-[var(--color-panel)] shadow-[0_12px_50px_-24px_rgba(0,0,0,0.35)]">
        <ScrollArea type="auto" scrollbars="both" style={{ maxHeight: "70vh" }}>
          <div className="min-w-[940px]">
            <div className="sticky top-0 z-10 grid grid-cols-[minmax(240px,1.4fr)_minmax(220px,1fr)_minmax(220px,1fr)_120px] gap-3 px-5 py-3 border-b border-[var(--gray-6)] bg-[var(--color-panel)] text-sm text-[var(--gray-11)] uppercase tracking-[0.04em]">
              <span>Users</span>
              <span>Brands</span>
              <span>Tier</span>
              <span className="text-right pr-2">Actions</span>
            </div>
            <div className="divide-y divide-[var(--gray-6)]">
              {visibleUsers.length === 0 ? (
                <div className="px-5 py-6">
                  <Text size="2" color="gray">
                    {hasQuery ? "No users match this search." : "No users found."}
                  </Text>
                </div>
              ) : (
                visibleUsers.map((user) => {
                  const memberships = permissionsByUserId.get(user.id) ?? [];
                  const tierLabel =
                    memberships
                      .map((m) => m.tier)
                      .filter((t) => t !== null && t !== undefined)
                      .map((t) => String(t))
                      .join(", ") || "None";

                  return (
                    <div key={user.id} className="px-5 py-4 hover:bg-[var(--gray-3)] transition-colors">
                      <div className="grid grid-cols-[minmax(240px,1.4fr)_minmax(220px,1fr)_minmax(220px,1fr)_120px] gap-3 items-center">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-[var(--gray-4)] text-[var(--gray-12)] grid place-items-center text-sm font-semibold">
                            {(user.name ?? user.email).slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <Heading size="4">{user.name ?? user.email}</Heading>
                            <Text size="2" color="gray">
                              {user.email}
                            </Text>
                          </div>
                        </div>
                        <div>
                          {memberships.length === 0 ? (
                            <Text size="2" color="gray">
                              No brand memberships
                            </Text>
                          ) : (
                            <Accordion.Root type="single" collapsible>
                              <Accordion.Item value="brands">
                                <Accordion.Trigger>
                                  <Text size="2" weight="medium">
                                    {memberships.length} brand{memberships.length > 1 ? "s" : ""} • expand
                                  </Text>
                                </Accordion.Trigger>
                                <Accordion.Content>
                                  <Flex direction="column" gap="2" className="pt-2">
                                    {memberships.map((m) => (
                                      <Flex
                                        key={`${m.user_id}-${m.brand_profile_id}`}
                                        justify="between"
                                        align="center"
                                        className="rounded-lg border border-[var(--gray-6)] bg-[var(--gray-3)] px-3 py-2"
                                        gap="3"
                                        wrap="wrap"
                                      >
                                        <div>
                                          <Text weight="medium">{m.brand_name ?? m.brand_profile_id}</Text>
                                          <Text color="gray" size="2">
                                            Role: {m.role ?? "unknown"}
                                          </Text>
                                        </div>
                                        <Flex gap="2" align="center">
                                          <Text size="2" color="gray">
                                            Tier
                                          </Text>
                                          <select
                                            className="bg-[var(--color-panel)] border border-[var(--gray-6)] rounded px-2 py-1 text-sm"
                                            defaultValue={m.tier ?? ""}
                                            onChange={(e) =>
                                              startTransition(async () => {
                                                const value = e.target.value === "" ? null : Number(e.target.value);
                                                try {
                                                  const { error } = await supabase.functions.invoke("admin-update-tier", {
                                                    method: "POST",
                                                    body: { userId: m.user_id, brandProfileId: m.brand_profile_id, tier: value },
                                                  });
                                                  if (error) throw new Error(error.message);
                                                  show({ title: "Tier updated", variant: "success" });
                                                } catch (error) {
                                                  show({
                                                    title: "Failed to update tier",
                                                    description: error instanceof Error ? error.message : "Unable to save tier.",
                                                    variant: "error",
                                                  });
                                                }
                                              })
                                            }
                                          >
                                            <option value="">None</option>
                                            <option value="1">1 — Studio+</option>
                                            <option value="2">2 — Social+</option>
                                            <option value="3">3 — Creative+</option>
                                          </select>
                                        </Flex>
                                      </Flex>
                                    ))}
                                  </Flex>
                                </Accordion.Content>
                              </Accordion.Item>
                            </Accordion.Root>
                          )}
                        </div>
                        <div>
                          <Text size="2" color="gray">
                            {tierLabel}
                          </Text>
                        </div>
                        <Flex gap="2" justify="end" wrap="wrap">
                          {user.isAdmin && <Badge color="green">Admin</Badge>}
                          <Button
                            size="1"
                            variant="soft"
                            disabled={isPending}
                            onClick={() =>
                              startTransition(async () => {
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
                            disabled={isPending}
                            onClick={() =>
                              startTransition(async () => {
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
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </ScrollArea>
      </div>
      <Flex align="center" justify="between" gap="3" wrap="wrap">
        <Text size="2" color="gray">
          Page {safePage} of {Math.max(pagination.totalPages, 1)}
        </Text>
        <Flex gap="2" align="center" wrap="wrap">
          <Button
            size="1"
            variant="soft"
            disabled={!pagination.hasPrevPage}
            onClick={() => updatePage(1)}
          >
            First
          </Button>
          <Button
            size="1"
            variant="soft"
            disabled={!pagination.hasPrevPage}
            onClick={() => updatePage(Math.max(1, pagination.page - 1))}
          >
            Previous
          </Button>
          <Button
            size="1"
            variant="soft"
            disabled={!pagination.hasNextPage}
            onClick={() => updatePage(pagination.page + 1)}
          >
            Next
          </Button>
          <Button
            size="1"
            variant="soft"
            disabled={!pagination.hasNextPage || pagination.totalPages <= 1}
            onClick={() => updatePage(Math.max(1, pagination.totalPages))}
          >
            Last
          </Button>
        </Flex>
      </Flex>
      <Callout.Root color="amber">
        <Callout.Text>Admin actions use service-role access; changes apply immediately.</Callout.Text>
      </Callout.Root>
    </Flex>
  );
}
