"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Button,
  Dialog,
  Flex,
  Heading,
  Text,
  TextField,
} from "@radix-ui/themes";
import { deleteBrandProfileAction } from "@/app/(post-auth)/settings/actions";
import { useToast } from "@/components/ui/ToastProvider";
import { useActiveBrandContext } from "@/components/providers/ActiveBrandProvider";

type BrandDangerZoneProps = {
  brandName: string;
  hasProfile: boolean;
  canDelete: boolean;
};

export function BrandDangerZone({ brandName, hasProfile, canDelete }: BrandDangerZoneProps) {
  const router = useRouter();
  const { show } = useToast();
  const { activeBrandId } = useActiveBrandContext();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");

  if (!canDelete) return null;

  const handleDelete = () => {
    if (!hasProfile) {
      show({ title: "No brand profile", description: "Nothing to delete.", variant: "error" });
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
        setOpen(false);
        setConfirmName("");
        if (nextBrandId) router.refresh();
        else router.push("/onboarding");
      } catch (error) {
        show({
          title: "Delete failed",
          description: error instanceof Error ? error.message : "Unable to delete brand profile.",
          variant: "error",
        });
      }
    });
  };

  return (
    <Box className="rounded-md border border-red-6/60 bg-red-3/40 p-4 dark:bg-red-3/10">
      <Flex align="center" justify="between" gap="4" wrap="wrap">
        <div className="space-y-1">
          <Heading size="3">Delete brand profile</Heading>
          <Text size="2" color="red">
            Permanently removes this brand profile and deactivates linked reports and analyses.
          </Text>
        </div>
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger>
            <Button color="red" variant="solid" disabled={isPending || !hasProfile}>
              Delete brand profile
            </Button>
          </Dialog.Trigger>
          <Dialog.Content maxWidth="420px">
            <Dialog.Title>Delete this brand profile?</Dialog.Title>
            <Dialog.Description>
              Type the brand name below to confirm. Related reports and strategic analyses will be deactivated.
            </Dialog.Description>
            <Flex direction="column" gap="2" className="mt-3">
              <Text size="2" color="gray">Brand name</Text>
              <TextField.Root
                placeholder={brandName}
                value={confirmName}
                onChange={(event) => setConfirmName(event.target.value)}
              />
            </Flex>
            <Flex justify="end" gap="3" className="mt-4">
              <Button variant="soft" onClick={() => setOpen(false)}>Cancel</Button>
              <Button color="red" onClick={handleDelete} disabled={isPending}>
                Confirm delete
              </Button>
            </Flex>
          </Dialog.Content>
        </Dialog.Root>
      </Flex>
    </Box>
  );
}
