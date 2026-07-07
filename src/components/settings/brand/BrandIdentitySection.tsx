'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { renameBrandProfileAction } from '@/app/(post-auth)/settings/actions';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/ToastProvider';
import { SettingsLogoUploader } from '../SettingsLogoUploader';

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
      show({ title: 'Name required', description: 'Enter a brand name.', variant: 'error' });
      return;
    }
    startTransition(async () => {
      try {
        await renameBrandProfileAction(activeBrandId, trimmed);
        setBrandName(trimmed);
        updateBrandName(activeBrandId, trimmed);
        show({ title: 'Brand updated', description: 'Brand name saved.', variant: 'success' });
      } catch (error) {
        show({
          title: 'Rename failed',
          description: error instanceof Error ? error.message : 'Unable to rename brand.',
          variant: 'error',
        });
      }
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={handleRename}>
        <div className="flex flex-wrap items-start gap-8">
          <SettingsLogoUploader
            brandId={activeBrandId}
            brandName={brandName}
            initialLogoPath={logoPath}
            disabled={!canEdit}
          />
          <div className="flex flex-1 flex-col gap-3">
            <span className="text-xs font-medium text-muted-foreground">
              BRAND ID: {activeBrandId}
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <Input
                value={brandName}
                onChange={(event) => setBrandName(event.target.value)}
                placeholder="Brand name"
                className="min-w-[260px]"
                disabled={!canEdit}
              />
              <Button type="submit" disabled={isPending || !canEdit}>
                Save name
              </Button>
            </div>
            {profile ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Detail label="Created" value={dates?.createdAt ?? '—'} />
                <Detail label="Last updated" value={dates?.updatedAt ?? '—'} />
              </div>
            ) : null}
          </div>
        </div>
      </form>

      {!canEdit ? (
        <Alert className="border-warning/30 bg-warning/10">
          <AlertDescription className="text-warning">
            Only brand owners or admins can edit this brand profile.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}
