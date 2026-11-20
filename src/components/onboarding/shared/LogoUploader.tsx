'use client';

import { Upload, X } from 'lucide-react';

import { useTranslations } from 'next-intl';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useOnboarding } from '@/components/onboarding/providers/OnboardingContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/ToastProvider';
import { useUiErrorMessage } from '@/i18n/errors';
import { createSignedAssetUrl, uploadCreativeAsset } from '@/lib/creative-assets/storageClient';

export function LogoUploader() {
  const uiErrorMessage = useUiErrorMessage();

  const tUi = useTranslations('onboarding');

  const { brandId, state, updateState } = useOnboarding();
  const { show } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const logoPath = state.brand.logoPath;
  const brandName = state.brand.name || 'Brand';
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
      show({ title: tUi('m_a0704a4eaa'), description: tUi('m_8e5741d5c1'), variant: 'error' });
      return;
    }

    setIsUploading(true);
    try {
      const extension = file.name.split('.').pop() || 'png';
      const namedFile = new File([file], `logo.${extension}`, { type: file.type });
      const { asset } = await uploadCreativeAsset(brandId, 'branding', namedFile);

      await updateState({
        brand: {
          logoPath: asset.fullPath,
        },
      });
      show({ title: tUi('m_1a3b73c794'), description: tUi('m_56c798f5cd'), variant: 'success' });
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
    await updateState({
      brand: {
        logoPath: null,
      },
    });
    setPreviewUrl(null);
  };

  return (
    <div className="relative group w-32 h-32">
      <input
        type="file"
        ref={inputRef}
        className="hidden"
        accept="image/png,image/jpeg,image/svg+xml"
        onChange={handleFileChange}
      />

      <Avatar
        className="w-32 h-32 cursor-pointer border-4 border-muted-foreground/10 hover:border-primary/50 transition-all shadow-sm"
        onClick={() => inputRef.current?.click()}
      >
        <AvatarImage
          src={previewUrl ?? undefined}
          alt={tUi('m_25dd48f3a2')}
          className="object-cover"
        />
        <AvatarFallback className="text-3xl font-semibold bg-transparent text-muted-foreground">
          {isUploading ? '...' : initials}
        </AvatarFallback>
      </Avatar>

      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 rounded-full cursor-pointer pointer-events-none">
        <Upload className="w-8 h-8 text-white" />
      </div>

      {logoPath && (
        <Button
          variant="destructive"
          size="icon"
          className="absolute -top-1 -right-1 h-7 w-7 rounded-full shadow-md border-2 border-background"
          onClick={handleRemove}
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
