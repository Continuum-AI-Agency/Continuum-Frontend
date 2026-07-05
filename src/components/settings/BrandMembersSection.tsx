"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Badge, Box, Button, Flex, Select, Table, Text } from "@radix-ui/themes";
import type { BrandRole } from "@/lib/onboarding/state";
import {
  changeMemberRoleAction,
  removeMemberAction,
} from "@/app/(post-auth)/settings/actions";
import { useToast } from "@/components/ui/ToastProvider";
import { formatMemberEmail } from "@/lib/brands/memberDisplay";

export type BrandMemberRow = {
  id: string;
  email: string | null;
  role: string;
  isRecentlyAccepted?: boolean;
};

type BrandMembersSectionProps = {
  brandId: string;
  members: BrandMemberRow[];
  canEdit: boolean;
};

export function BrandMembersSection({ brandId, members, canEdit }: BrandMembersSectionProps) {
  const router = useRouter();
  const { show } = useToast();
  const [isPending, startTransition] = useTransition();
  const ownerEmails = members.filter((m) => m.role === "owner").map((m) => m.email);

  const handleRoleChange = (memberId: string, email: string | null, next: string) => {
    startTransition(async () => {
      try {
        await changeMemberRoleAction(
          brandId,
          memberId,
          next as Exclude<BrandRole, "owner">,
        );
        show({
          title: "Role updated",
          description: `${formatMemberEmail(email)} is now ${next}.`,
          variant: "success",
        });
        router.refresh();
      } catch (error) {
        show({
          title: "Could not change role",
          description: error instanceof Error ? error.message : "Unknown error.",
          variant: "error",
        });
      }
    });
  };

  const handleRemove = (memberId: string, email: string | null) => {
    startTransition(async () => {
      try {
        await removeMemberAction(brandId, memberId, email ?? undefined);
        show({
          title: "Member removed",
          description: `${formatMemberEmail(email)} no longer has access.`,
          variant: "success",
        });
        router.refresh();
      } catch (error) {
        show({
          title: "Action failed",
          description: error instanceof Error ? error.message : "Unable to remove member.",
          variant: "error",
        });
      }
    });
  };

  return (
    <Box>
      <div className="space-y-2 md:hidden">
        {members.map((member) => {
          const isOwnerRow = member.role === "owner";
          return (
            <div
              key={member.id}
              className="rounded-lg border border-border/60 bg-card/20 p-3"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <Text as="p" size="2" weight="medium" className="break-all">
                    {formatMemberEmail(member.email)}
                  </Text>
                  {member.isRecentlyAccepted ? (
                    <Badge color="green" variant="soft" className="mt-1">
                      New
                    </Badge>
                  ) : null}
                </div>
                {!canEdit || isOwnerRow ? <Badge>{member.role}</Badge> : null}
              </div>
              {canEdit ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {!isOwnerRow ? (
                    <Select.Root
                      size="2"
                      value={member.role}
                      disabled={isPending}
                      onValueChange={(next) => {
                        if (next === member.role) return;
                        handleRoleChange(member.id, member.email, next);
                      }}
                    >
                      <Select.Trigger className="min-h-10 min-w-32" />
                      <Select.Content>
                        <Select.Item value="admin">admin</Select.Item>
                        <Select.Item value="operator">operator</Select.Item>
                        <Select.Item value="viewer">viewer</Select.Item>
                      </Select.Content>
                    </Select.Root>
                  ) : null}
                  <Button
                    size="2"
                    variant="ghost"
                    color="red"
                    disabled={isOwnerRow || isPending}
                    onClick={() => handleRemove(member.id, member.email)}
                    className="min-h-10"
                  >
                    Remove
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <Table.Root className="min-w-[36rem]">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>Email</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Role</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {members.map((member) => {
              const isOwnerRow = member.role === "owner";
              return (
                <Table.Row key={member.id}>
                  <Table.Cell>
                    <Flex align="center" gap="2">
                      <span>{formatMemberEmail(member.email)}</span>
                      {member.isRecentlyAccepted ? (
                        <Badge color="green" variant="soft">
                          New
                        </Badge>
                      ) : null}
                    </Flex>
                  </Table.Cell>
                  <Table.Cell>
                    {canEdit && !isOwnerRow ? (
                      <Select.Root
                        size="1"
                        value={member.role}
                        disabled={isPending}
                        onValueChange={(next) => {
                          if (next === member.role) return;
                          handleRoleChange(member.id, member.email, next);
                        }}
                      >
                        <Select.Trigger />
                        <Select.Content>
                          <Select.Item value="admin">admin</Select.Item>
                          <Select.Item value="operator">operator</Select.Item>
                          <Select.Item value="viewer">viewer</Select.Item>
                        </Select.Content>
                      </Select.Root>
                    ) : (
                      <Badge>{member.role}</Badge>
                    )}
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    {canEdit && (
                      <Button
                        size="1"
                        variant="ghost"
                        color="red"
                        disabled={isOwnerRow || isPending}
                        onClick={() => handleRemove(member.id, member.email)}
                      >
                        Remove
                      </Button>
                    )}
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Root>
      </div>
      {ownerEmails.length === 0 && (
        <Text size="1" color="amber">
          Warning: no owners detected. Ensure at least one owner remains.
        </Text>
      )}
    </Box>
  );
}
