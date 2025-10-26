"use client";

import { useRouter } from "next/navigation";
import React, { useMemo, useState, useTransition } from "react";
import {
  Badge,
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
import type { BrandInvite, BrandMember, BrandRole } from "@/lib/onboarding/state";
import type { BrandSummary } from "@/components/DashboardLayoutShell";
import {
  createBrandProfileAction,
  createMagicLinkAction,
  removeMemberAction,
  renameBrandProfileAction,
  revokeInviteAction,
  switchActiveBrandAction,
} from "@/app/(post-auth)/settings/actions";
import { useToast } from "@/components/ui/ToastProvider";

type BrandSettingsPanelProps = {
  data: {
    activeBrandId: string;
    brandSummaries: BrandSummary[];
    brandName: string;
    members: BrandMember[];
    invites: BrandInvite[];
  };
};

const INVITE_ROLES: BrandRole[] = ["admin", "operator", "viewer"];

export default function BrandSettingsPanel({ data }: BrandSettingsPanelProps) {
  const router = useRouter();
  const { show } = useToast();
  const [isPending, startTransition] = useTransition();
  const [brandName, setBrandName] = useState(data.brandName);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<BrandRole>("operator");
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [newBrandName, setNewBrandName] = useState("");

  const ownerEmails = useMemo(
    () => data.members.filter(member => member.role === "owner").map(member => member.email),
    [data.members]
  );

  function handleRenameBrand(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!brandName.trim()) {
      show({ title: "Name required", description: "Please enter a brand name.", variant: "error" });
      return;
    }
    startTransition(async () => {
      try {
        await renameBrandProfileAction(data.activeBrandId, brandName.trim());
        setBrandName(prev => prev.trim());
        show({ title: "Brand updated", description: "Brand name saved.", variant: "success" });
        router.refresh();
      } catch (error) {
        show({
          title: "Rename failed",
          description: error instanceof Error ? error.message : "Unable to rename brand.",
          variant: "error",
        });
      }
    });
  }

  function handleCreateMagicLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inviteEmail.trim()) {
      show({ title: "Email required", description: "Add an email to send an invite.", variant: "error" });
      return;
    }
    startTransition(async () => {
      try {
        const { link } = await createMagicLinkAction(data.activeBrandId, inviteEmail.trim(), inviteRole);
        setGeneratedLink(link);
        setInviteEmail("");
        show({ title: "Invite generated", description: "Share the magic link to grant access.", variant: "success" });
        router.refresh();
      } catch (error) {
        show({
          title: "Invite failed",
          description: error instanceof Error ? error.message : "Unable to create invite.",
          variant: "error",
        });
      }
    });
  }

  function handleRemoveMember(email: string) {
    startTransition(async () => {
      try {
        await removeMemberAction(data.activeBrandId, email);
        show({ title: "Member removed", description: `${email} no longer has access.`, variant: "success" });
        router.refresh();
      } catch (error) {
        show({
          title: "Action failed",
          description: error instanceof Error ? error.message : "Unable to remove member.",
          variant: "error",
        });
      }
    });
  }

  function handleRevokeInvite(inviteId: string) {
    startTransition(async () => {
      try {
        await revokeInviteAction(data.activeBrandId, inviteId);
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
  }

  function handleSwitchBrand(brandId: string) {
    if (brandId === data.activeBrandId) return;
    startTransition(async () => {
      try {
        await switchActiveBrandAction(brandId);
        router.refresh();
      } catch (error) {
        show({
          title: "Switch failed",
          description: error instanceof Error ? error.message : "Unable to switch brand.",
          variant: "error",
        });
      }
    });
  }

  function handleCreateBrand(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      try {
        await createBrandProfileAction(newBrandName.trim() || undefined);
      } catch (error) {
        show({
          title: "Creation failed",
          description: error instanceof Error ? error.message : "Unable to create brand profile.",
          variant: "error",
        });
      }
    });
  }

  return (
    <Flex direction="column" gap="6">
      <form onSubmit={handleRenameBrand}>
        <CardSection title="Brand profile" description="Rename your brand profile and update workspace identity.">
          <Flex align="center" gap="3" wrap="wrap">
            <TextField.Root
              value={brandName}
              onChange={event => setBrandName(event.target.value)}
              placeholder="Brand name"
              className="min-w-[260px]"
            />
            <Button type="submit" disabled={isPending}>
              Save name
            </Button>
          </Flex>
        </CardSection>
      </form>

      <form onSubmit={handleCreateMagicLink}>
        <CardSection
          title="Team invitations"
          description="Generate shareable magic links to invite teammates to this brand profile."
        >
          <Grid columns={{ initial: "1", sm: "2", md: "3" }} gap="3" align="end">
            <Flex direction="column" gap="1">
              <Text size="1" color="gray">
                Email
              </Text>
              <TextField.Root
                placeholder="teammate@example.com"
                value={inviteEmail}
                onChange={event => setInviteEmail(event.target.value)}
              />
            </Flex>
            <Flex direction="column" gap="1">
              <Text size="1" color="gray">
                Role
              </Text>
              <Select.Root value={inviteRole} onValueChange={value => setInviteRole(value as BrandRole)}>
                <Select.Trigger placeholder="Role" />
                <Select.Content>
                  {INVITE_ROLES.map(role => (
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
          {generatedLink && (
            <Flex direction="column" gap="2">
              <Callout.Root color="green">
                <Callout.Text>Invite link generated. Share it directly with your teammate.</Callout.Text>
              </Callout.Root>
              <TextArea readOnly value={generatedLink} className="font-mono text-sm" />
            </Flex>
          )}
          <Box>
            <Heading size="3">Pending invites</Heading>
            {data.invites.length === 0 ? (
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
                  {data.invites.map(invite => (
                    <Table.Row key={invite.id}>
                      <Table.Cell>{invite.email}</Table.Cell>
                      <Table.Cell>{invite.role}</Table.Cell>
                      <Table.Cell>{new Date(invite.createdAt).toLocaleString()}</Table.Cell>
                      <Table.Cell className="text-right">
                        <Button
                          size="1"
                          variant="ghost"
                          color="red"
                          onClick={() => handleRevokeInvite(invite.id)}
                          disabled={isPending}
                        >
                          Revoke
                        </Button>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            )}
          </Box>
        </CardSection>
      </form>

      <CardSection
        title="Team members"
        description="Manage who can access this brand profile. Owners cannot be removed."
      >
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>Email</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Role</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.members.map(member => (
              <Table.Row key={member.id}>
                <Table.Cell>{member.email}</Table.Cell>
                <Table.Cell>
                  <Badge>{member.role}</Badge>
                </Table.Cell>
                <Table.Cell className="text-right">
                  <Button
                    size="1"
                    variant="ghost"
                    color="red"
                    disabled={member.role === "owner" || isPending}
                    onClick={() => handleRemoveMember(member.email)}
                  >
                    Remove
                  </Button>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
        {ownerEmails.length === 0 && (
          <Text size="1" color="amber">
            Warning: no owners detected. Ensure at least one owner remains.
          </Text>
        )}
      </CardSection>

      <CardSection
        title="Brand profiles"
        description="Switch between brands or create a new one to start onboarding again."
      >
        <Grid columns={{ initial: "1", sm: "2" }} gap="3">
          {data.brandSummaries.map(brand => (
            <Flex
              key={brand.id}
              direction="column"
              gap="2"
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-3"
            >
              <Flex justify="between" align="center">
                <Heading size="4">{brand.name || "Untitled brand"}</Heading>
                {brand.id === data.activeBrandId && <Badge color="violet">Active</Badge>}
              </Flex>
              <Flex justify="between" align="center">
                <Text color="gray" size="2">
                  {brand.completed ? "Ready for campaign operations" : "Finish onboarding"}
                </Text>
                <Button
                  size="2"
                  variant="soft"
                  onClick={() => handleSwitchBrand(brand.id)}
                  disabled={brand.id === data.activeBrandId || isPending}
                >
                  {brand.id === data.activeBrandId ? "Current" : "Switch"}
                </Button>
              </Flex>
            </Flex>
          ))}
        </Grid>
        <form onSubmit={handleCreateBrand}>
          <Flex gap="3" align="center" wrap="wrap">
            <TextField.Root
              placeholder="New brand name"
              value={newBrandName}
              onChange={event => setNewBrandName(event.target.value)}
              className="min-w-[260px]"
            />
            <Button type="submit" disabled={isPending}>
              Create new brand
            </Button>
          </Flex>
          <Text size="1" color="gray">
            Creating a brand launches onboarding so you can configure integrations and brand assets.
          </Text>
        </form>
      </CardSection>
    </Flex>
  );
}

type CardSectionProps = {
  title: string;
  description: string;
  children: React.ReactNode;
};

function CardSection({ title, description, children }: CardSectionProps) {
  return (
    <Box className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-4">
      <div>
        <Heading size="4">{title}</Heading>
        <Text color="gray" size="2">
          {description}
        </Text>
      </div>
      {children}
    </Box>
  );
}
