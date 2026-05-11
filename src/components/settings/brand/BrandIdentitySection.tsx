"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Box,
  Button,
  Callout,
  Flex,
  Grid,
  Text,
  TextField,
} from "@radix-ui/themes";
import { renameBrandProfileAction } from "@/app/(post-auth)/settings/actions";
import { useToast } from "@/components/ui/ToastProvider";
import { useActiveBrandContext } from "@/components/providers/ActiveBrandProvider";
import { SettingsLogoUploader } from "../SettingsLogoUploader";

type BrandProfileMeta = {
  id: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

type BrandIdentitySectionProps = {
  brandName: string;
  logoPath: string | null;
  profile?: BrandProfileMeta;
  canEdit: boolean;
};

export function BrandIdentitySection({
  brandName: initialName,
  logoPath,
  profile,
  canEdit,
}: BrandIdentitySectionProps) {
  const { show } = useToast();
  const { activeBrandId, updateBrandName } = useActiveBrandContext();
  const [isPending, startTransition] = useTransition();
  const [brandName, setBrandName] = useState(initialName);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setBrandName(initialName);
  }, [initialName]);

  const dates = useMemo(() => {
    if (!profile || !mounted) return null;
    return {
      createdAt: new Date(profile.createdAt).toLocaleString(),
      updatedAt: new Date(profile.updatedAt).toLocaleString(),
    };
  }, [profile, mounted]);

  const handleRename = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = brandName.trim();
    if (!trimmed) {
      show({ title: "Name required", description: "Enter a brand name.", variant: "error" });
      return;
    }
    startTransition(async () => {
      try {
        await renameBrandProfileAction(activeBrandId, trimmed);
        setBrandName(trimmed);
        updateBrandName(activeBrandId, trimmed);
        show({ title: "Brand updated", description: "Brand name saved.", variant: "success" });
      } catch (error) {
        show({
          title: "Rename failed",
          description: error instanceof Error ? error.message : "Unable to rename brand.",
          variant: "error",
        });
      }
    });
  };

  return (
    <Flex direction="column" gap="6">
      <form onSubmit={handleRename}>
        <Flex align="start" gap="6" wrap="wrap">
          <SettingsLogoUploader
            brandId={activeBrandId}
            brandName={brandName}
            initialLogoPath={logoPath}
            disabled={!canEdit}
          />
          <Flex direction="column" gap="3" className="flex-1">
            <Text size="1" color="gray" weight="medium">
              BRAND ID: {activeBrandId}
            </Text>
            <Flex align="center" gap="3" wrap="wrap">
              <TextField.Root
                value={brandName}
                onChange={(event) => setBrandName(event.target.value)}
                placeholder="Brand name"
                className="min-w-[260px]"
                disabled={!canEdit}
              />
              <Button type="submit" disabled={isPending || !canEdit}>
                Save name
              </Button>
            </Flex>
            {profile ? (
              <Grid columns={{ initial: "1", sm: "2" }} gap="3">
                <Detail label="Created" value={dates?.createdAt ?? "—"} />
                <Detail label="Last updated" value={dates?.updatedAt ?? "—"} />
              </Grid>
            ) : null}
          </Flex>
        </Flex>
      </form>

      {!canEdit ? (
        <Callout.Root color="amber">
          <Callout.Text>
            Only brand owners or admins can edit this brand profile.
          </Callout.Text>
        </Callout.Root>
      ) : null}
    </Flex>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Text size="1" color="gray">{label}</Text>
      <Text>{value}</Text>
    </Box>
  );
}
