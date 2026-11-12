'use client';

import { Loader2, Upload, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { updateBrandLogoAction } from '@/app/[locale]/(post-auth)/settings/actions';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/ToastProvider';
import { useUiErrorMessage } from '@/i18n/errors';
import { createSignedAssetUrl, uploadCreativeAsset } from '@/lib/creative-assets/storageClient';

type SettingsLogoUploaderProps = {
  brandId: string;
  brandName: string;
  initialLogoPath?: string | null;
  disabled?: boolean;
  disabledReason?: string;
};

export function SettingsLogoUploader({
  brandId,
  brandName,
  initialLogoPath,
  disabled,
  disabledReason,
}: SettingsLogoUploaderProps) {
  const uiErrorMessage = useUiErrorMessage();

  const tUi = useTranslations('settings');

  const { show } = useToast();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [logoPath, setLogoPath] = useState<string | null>(initialLogoPath ?? null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const initials = brandName.slice(0, 2).toUpperCase();

  useEffect(() => {
    if (!logoPath) {
      setPreviewUrl(null);
      return;
    }
    let isActive = true;
    createSignedAssetUrl(logoPath, 3600)
      .then((url) => {
        if (isActive) setPreviewUrl(url);
      })
      .catch(() => {
        if (isActive) setPreviewUrl(null);
      });
    return () => {
      isActive = false;
    };
  }, [logoPath]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      show({
        title: tUi('m_a0704a4eaa'),
        description: tUi('m_8e5741d5c1'),
        variant: 'error',
      });
      return;
    }

    setIsUploading(true);
    try {
      const extension = file.name.split('.').pop() || 'png';
      const namedFile = new File([file], `logo.${extension}`, {
        type: file.type,
      });

      const { asset } = await uploadCreativeAsset(brandId, 'branding', namedFile);

      await updateBrandLogoAction(brandId, asset.fullPath);

      setLogoPath(asset.fullPath);
      show({
        title: tUi('m_1a3b73c794'),
        description: tUi('m_56c798f5cd'),
        variant: 'success',
      });
      router.refresh();
    } catch (error) {
      console.error(error);
      const description =
        error instanceof Error && uiErrorMessage(error)
          ? uiErrorMessage(error)
          : tUi('m_4bb4dc5e7a');
      show({ title: tUi('m_ad0d0603e2'), description, variant: 'error' });
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!logoPath) return;

    setIsUploading(true);
    try {
      await updateBrandLogoAction(brandId, null);
      setLogoPath(null);
      setPreviewUrl(null);
      show({
        title: tUi('m_5ea3c45acf'),
        description: tUi('m_a0e645e284'),
        variant: 'success',
      });
      router.refresh();
    } catch (error) {
      console.error(error);
      const description =
        error instanceof Error && uiErrorMessage(error)
          ? uiErrorMessage(error)
          : tUi('m_fa60c69573');
      show({ title: tUi('m_debe01de25'), description, variant: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

  const disabledTitle = disabled ? (disabledReason ?? tUi('m_cc62b99cc5')) : undefined;

  return (
    <div className="relative group w-24 h-24" title={disabledTitle}>
      <input
        type="file"
        ref={inputRef}
        className="hidden"
        accept="image/png,image/jpeg,image/svg+xml"
        onChange={handleFileChange}
        disabled={isUploading || disabled}
      />

      <Avatar
        className={`w-24 h-24 border-4 border-muted-foreground/10 transition-all shadow-sm ${disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:border-primary/50'}`}
        onClick={() => !isUploading && !disabled && inputRef.current?.click()}
      >
        <AvatarImage
          src={previewUrl ?? undefined}
          alt={tUi('m_25dd48f3a2')}
          className="object-cover"
        />
        <AvatarFallback className="text-2xl font-semibold bg-transparent text-muted-foreground">
          {isUploading ? <Loader2 className="w-6 h-6 animate-spin" /> : initials}
        </AvatarFallback>
      </Avatar>

      {!disabled && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 rounded-full cursor-pointer pointer-events-none">
          <Upload className="w-6 h-6 text-white" />
        </div>
      )}

      {logoPath && !isUploading && !disabled && (
        <Button
          variant="destructive"
          size="icon"
          className="absolute -top-1 -right-1 h-6 w-6 rounded-full shadow-md border-2 border-background"
          onClick={handleRemove}
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
