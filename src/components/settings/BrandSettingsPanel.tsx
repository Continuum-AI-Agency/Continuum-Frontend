"use client";

import { useRouter } from "next/navigation";
import React, { useMemo, useState, useTransition } from "react";
import {
  Badge,
  Box,
  Button,
  Callout,
  Dialog,
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
import {
  createMagicLinkAction,
  deleteBrandProfileAction,
  removeMemberAction,
  renameBrandProfileAction,
  revokeInviteAction,
} from "@/app/(post-auth)/settings/actions";
import { useToast } from "@/components/ui/ToastProvider";
import { useActiveBrandContext } from "@/components/providers/ActiveBrandProvider";
import { SettingsLogoUploader } from "./SettingsLogoUploader";

type BrandSettingsPanelProps = {
  data: {
    brandName: string;
    logoPath?: string | null;
    members: BrandMember[];
    invites: BrandInvite[];
    profile?: {
      id: string;
      createdAt: string;
      updatedAt: string;
      createdBy: string;
    };
    currentUserRole?: BrandRole | null;
  };
};

const INVITE_ROLES: BrandRole[] = ["admin", "operator", "viewer"];

export default function BrandSettingsPanel({ data }: BrandSettingsPanelProps) {
  const router = useRouter();
  const { show } = useToast();
  const { activeBrandId, updateBrandName } = useActiveBrandContext();
  const [isPending, startTransition] = useTransition();
  const [brandName, setBrandName] = useState(data.brandName);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<BrandRole>("operator");
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");

  const ownerEmails = useMemo(
    () => data.members.filter(member => member.role === "owner").map(member => member.email),
    [data.members]
  );

  const formattedProfileDates = useMemo(() => {
    if (!data.profile) return null;
    return {
      createdAt: new Date(data.profile.createdAt).toLocaleString(),
      updatedAt: new Date(data.profile.updatedAt).toLocaleString(),
    };
  }, [data.profile]);

  const canDelete = data.currentUserRole === "owner" || data.currentUserRole === "admin";

  function handleRenameBrand(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!brandName.trim()) {
      show({ title: "Name required", description: "Please enter a brand name.", variant: "error" });
      return;
    }
    startTransition(async () => {
      try {
        await renameBrandProfileAction(activeBrandId, brandName.trim());
        setBrandName(prev => prev.trim());
        updateBrandName(activeBrandId, brandName.trim());
        show({ title: "Brand updated", description: "Brand name saved.", variant: "success" });
      } catch (error) {
        show({
          title: "Rename failed",
          description: error instanceof Error ? error.message : "Unable to rename brand.",
          variant: "error",
        });
      }
    });
  }

  function handleDeleteBrandProfile() {
    if (!data.profile) {
      show({ title: "No brand profile", description: "Nothing to delete for this brand.", variant: "error" });
      return;
    }

    if (confirmName.trim() !== brandName.trim()) {
      show({
        title: "Confirmation required",
        description: "Type the brand name exactly to confirm deletion.",
        variant: "error",
      });
      return;
    }

    startTransition(async () => {
      try {
        const { nextBrandId } = await deleteBrandProfileAction(activeBrandId);
        show({
          title: "Brand profile deleted",
          description: "Related reports and analyses were deactivated.",
          variant: "success",
        });
        setConfirmOpen(false);
        setConfirmName("");
        if (nextBrandId) {
          router.refresh();
        } else {
          router.push("/onboarding");
        }
      } catch (error) {
        show({
          title: "Delete failed",
          description: error instanceof Error ? error.message : "Unable to delete brand profile.",
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
        const result = await createMagicLinkAction(activeBrandId, inviteEmail.trim(), inviteRole);
        setGeneratedLink(result.link);
        setInviteEmail("");
        if (result.warning) {
          show({
            title: "Invite ready",
            description: result.warning,
            variant: "warning",
          });
        } else if (result.emailSent) {
          show({
            title: result.resent ? "Magic link resent" : "Magic link sent",
            description: `Invite emailed to ${inviteEmail.trim()}.`,
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
  }

  function handleRemoveMember(email: string) {
    startTransition(async () => {
      try {
        await removeMemberAction(activeBrandId, email);
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
  }

  return (
    <Flex direction="column" gap="6">
      <form onSubmit={handleRenameBrand}>
        <CardSection title="Brand profile" description="Rename your brand profile and update workspace identity.">
          <Flex align="start" gap="6" wrap="wrap">
            <SettingsLogoUploader 
              brandId={activeBrandId} 
              brandName={brandName} 
              initialLogoPath={data.logoPath} 
            />
            <Flex direction="column" gap="3" className="flex-1">
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
              {data.profile && (
                <Grid columns={{ initial: "1", sm: "2" }} gap="3">
                  <Detail label="Brand ID" value={data.profile.id} monospace />
                  <Detail label="Created" value={formattedProfileDates?.createdAt ?? "—"} />
                  <Detail label="Last updated" value={formattedProfileDates?.updatedAt ?? "—"} />
                </Grid>
              )}
            </Flex>
          </Flex>
          {canDelete && (
            <Box className="border border-red-6/60 bg-red-3/40 dark:bg-red-3/10 rounded-md p-4">
              <Flex align="center" justify="between" gap="4" wrap="wrap">
                <div className="space-y-1">
                  <Heading size="3">Delete brand profile</Heading>
                  <Text size="2" color="red">
                    Permanently removes this brand profile and deactivates linked reports and analyses.
                  </Text>
                </div>
                <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
                  <Dialog.Trigger>
                    <Button color="red" variant="solid" disabled={isPending || !data.profile}>
                      Delete brand profile
                    </Button>
                  </Dialog.Trigger>
                  <Dialog.Content maxWidth="420px">
                    <Dialog.Title>Delete this brand profile?</Dialog.Title>
                    <Dialog.Description>
                      Type the brand name below to confirm. Related reports and strategic analyses will be deactivated.
                    </Dialog.Description>
                    <Flex direction="column" gap="2" className="mt-3">
                      <Text size="2" color="gray">
                        Brand name
                      </Text>
                      <TextField.Root
                        placeholder={brandName}
                        value={confirmName}
                        onChange={event => setConfirmName(event.target.value)}
                      />
                    </Flex>
                    <Flex justify="end" gap="3" className="mt-4">
                      <Button variant="soft" onClick={() => setConfirmOpen(false)}>
                        Cancel
                      </Button>
                      <Button color="red" onClick={handleDeleteBrandProfile} disabled={isPending}>
                        Confirm delete
                      </Button>
                    </Flex>
                  </Dialog.Content>
                </Dialog.Root>
              </Flex>
            </Box>
          )}
          {!canDelete && (
            <Callout.Root color="amber">
              <Callout.Text>
                Only brand owners or admins can delete this brand profile. Ask an owner to perform this action.
              </Callout.Text>
            </Callout.Root>
          )}
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

    </Flex>
  );
}

type CardSectionProps = {
  title: string;
  description: string;
  children: React.ReactNode;
};

type DetailProps = {
  label: string;
  value: string;
  monospace?: boolean;
};

function Detail({ label, value, monospace }: DetailProps) {
  return (
    <Box>
      <Text size="1" color="gray">
        {label}
      </Text>
      <Text className={monospace ? "font-mono break-all" : undefined}>{value}</Text>
    </Box>
  );
}

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
