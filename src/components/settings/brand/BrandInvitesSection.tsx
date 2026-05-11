"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Button,
  Callout,
  Flex,
  Grid,
  Heading,
  Select,
  Table,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import type { BrandInvite, BrandRole } from "@/lib/onboarding/state";
import {
  createMagicLinkAction,
  revokeInviteAction,
} from "@/app/(post-auth)/settings/actions";
import { useToast } from "@/components/ui/ToastProvider";
import { useActiveBrandContext } from "@/components/providers/ActiveBrandProvider";

type BrandInvitesSectionProps = {
  invites: BrandInvite[];
  canEdit: boolean;
};

const INVITE_ROLES: BrandRole[] = ["admin", "operator", "viewer"];

export function BrandInvitesSection({ invites, canEdit }: BrandInvitesSectionProps) {
  const router = useRouter();
  const { show } = useToast();
  const { activeBrandId } = useActiveBrandContext();
  const [isPending, startTransition] = useTransition();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<BrandRole>("operator");
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const formatDate = (value: string) => (mounted ? new Date(value).toLocaleString() : "—");

  const handleCreateMagicLink = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = inviteEmail.trim();
    if (!trimmed) {
      show({ title: "Email required", description: "Add an email to send an invite.", variant: "error" });
      return;
    }
    startTransition(async () => {
      try {
        const result = await createMagicLinkAction(activeBrandId, trimmed, inviteRole);
        setGeneratedLink(result.link);
        setInviteEmail("");
        if (result.warning) {
          show({ title: "Invite ready", description: result.warning, variant: "warning" });
        } else if (result.emailSent) {
          show({
            title: result.resent ? "Magic link resent" : "Magic link sent",
            description: `Invite emailed to ${trimmed}.`,
            variant: "success",
          });
        } else {
          show({
            title: "Invite ready",
            description: "Invite link created. Share it manually.",
            variant: "warning",
          });
        }
        router.refresh();
      } catch (error) {
        show({
          title: "Invite failed",
          description: error instanceof Error ? error.message : "Unable to create invite.",
          variant: "error",
        });
      }
    });
  };

  const handleRevoke = (inviteId: string) => {
    startTransition(async () => {
      try {
        await revokeInviteAction(activeBrandId, inviteId);
        show({ title: "Invite revoked", description: "This invite link is no longer valid.", variant: "success" });
        router.refresh();
      } catch (error) {
        show({
          title: "Revoke failed",
          description: error instanceof Error ? error.message : "Unable to revoke invite.",
          variant: "error",
        });
      }
    });
  };

  return (
    <Flex direction="column" gap="4">
      {canEdit ? (
        <form onSubmit={handleCreateMagicLink}>
          <Flex direction="column" gap="3">
            <Grid columns={{ initial: "1", sm: "2", md: "3" }} gap="3" align="end">
              <Flex direction="column" gap="1">
                <Text size="1" color="gray">Email</Text>
                <TextField.Root
                  placeholder="teammate@example.com"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                />
              </Flex>
              <Flex direction="column" gap="1">
                <Text size="1" color="gray">Role</Text>
                <Select.Root value={inviteRole} onValueChange={(value) => setInviteRole(value as BrandRole)}>
                  <Select.Trigger placeholder="Role" />
                  <Select.Content>
                    {INVITE_ROLES.map((role) => (
                      <Select.Item key={role} value={role}>
                        {role.charAt(0).toUpperCase() + role.slice(1)}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </Flex>
              <Button type="submit" disabled={isPending}>
                Generate magic link
              </Button>
            </Grid>
            {generatedLink ? (
              <Flex direction="column" gap="2">
                <Callout.Root color="green">
                  <Callout.Text>Invite link generated. Share it directly with your teammate.</Callout.Text>
                </Callout.Root>
                <TextArea readOnly value={generatedLink} className="font-mono text-sm" />
              </Flex>
            ) : null}
          </Flex>
        </form>
      ) : null}

      <Box>
        <Heading size="3" mb="2">Pending invites</Heading>
        {invites.length === 0 ? (
          <Text color="gray">No pending invitations.</Text>
        ) : (
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>Email</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Role</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Created</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {invites.map((invite) => (
                <Table.Row key={invite.id}>
                  <Table.Cell>{invite.email}</Table.Cell>
                  <Table.Cell>{invite.role}</Table.Cell>
                  <Table.Cell>{formatDate(invite.createdAt)}</Table.Cell>
                  <Table.Cell className="text-right">
                    {canEdit ? (
                      <Button
                        size="1"
                        variant="ghost"
                        color="red"
                        onClick={() => handleRevoke(invite.id)}
                        disabled={isPending}
                      >
                        Revoke
                      </Button>
                    ) : null}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        )}
      </Box>
    </Flex>
  );
}
