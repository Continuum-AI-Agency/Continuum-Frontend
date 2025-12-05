"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge, Box, Button, Callout, Card, Flex, Grid, Heading, Separator, Text, TextField, ScrollArea } from "@radix-ui/themes";
import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { useToast } from "@/components/ui/ToastProvider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
  createdAt: string | null;
};

export type PermissionRow = {
  user_id: string;
  brand_profile_id: string;
  role: string | null;
  tier: number | null;
  brand_name: string | null;
};

type Props = {
  users: AdminUser[];
  permissions: PermissionRow[];
};

export function AdminUserList({ users, permissions }: Props) {
  const { show } = useToast();
  const [isPending, startTransition] = useTransition();
  const supabase = createSupabaseBrowserClient();
  const [query, setQuery] = useState("");

  function openUrlInIncognito(url: string) {
    window.open(url, "_blank", "noopener,noreferrer,incognito=yes");
  }

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const name = u.name?.toLowerCase() ?? "";
      const email = u.email.toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [query, users]);

  return (
    <Flex direction="column" gap="4">
      <Flex align="center" justify="between" gap="3" wrap="wrap">
        <div>
          <Heading size="4">Users</Heading>
          <Text color="gray" size="2">
            Showing {filteredUsers.length} of {users.length}
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

      <ScrollArea style={{ maxHeight: "70vh" }}>
        <Grid columns={{ initial: "1", md: "2" }} gap="4">
          {filteredUsers.map((user) => {
            const memberships = permissions.filter((p) => p.user_id === user.id);
            return (
              <Card key={user.id} className="border border-white/10 bg-slate-950/60 group">
                <Flex direction="column" gap="3">
                  <Flex align="center" justify="between">
                    <div>
                      <Heading size="4">{user.name ?? user.email}</Heading>
                      <Text size="2" color="gray">
                        {user.email}
                      </Text>
                    </div>
                    <Flex gap="2" align="center" className="opacity-0 group-hover:opacity-100 transition-opacity">
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
                              openUrlInIncognito(data.signInLink);
                              show({ title: "Impersonation link opened", description: "Check the new window.", variant: "success" });
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
                  </Flex>
                  <Separator orientation="horizontal" />
                  {memberships.length === 0 ? (
                    <Text size="2" color="gray">
                      No brand memberships.
                    </Text>
                  ) : (
                    <Flex direction="column" gap="2">
                      {memberships.map((m) => (
                        <Box
                          key={`${m.user_id}-${m.brand_profile_id}`}
                          className="rounded-md border border-white/10 bg-white/5 p-3"
                        >
                          <Flex justify="between" align="center" gap="3" wrap="wrap">
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
                                className="bg-slate-900 border border-white/15 rounded px-2 py-1 text-sm"
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
                        </Box>
                      ))}
                    </Flex>
                  )}
                </Flex>
              </Card>
            );
          })}
        </Grid>
      </ScrollArea>
      <Callout.Root color="amber">
        <Callout.Text>Admin actions use service-role access; changes apply immediately.</Callout.Text>
      </Callout.Root>
    </Flex>
  );
}
