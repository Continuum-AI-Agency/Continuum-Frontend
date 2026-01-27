"use client";

import React, { useRef, useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Upload, X, Loader2 } from "lucide-react";
import { uploadCreativeAsset, createSignedAssetUrl } from "@/lib/creative-assets/storageClient";
import { updateBrandLogoAction } from "@/app/(post-auth)/settings/actions";
import { useToast } from "@/components/ui/ToastProvider";
import { useRouter } from "next/navigation";

type SettingsLogoUploaderProps = {
  brandId: string;
  brandName: string;
  initialLogoPath?: string | null;
};

export function SettingsLogoUploader({ brandId, brandName, initialLogoPath }: SettingsLogoUploaderProps) {
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
    createSignedAssetUrl(logoPath, 3600).then((url) => {
      if (isActive) setPreviewUrl(url);
    }).catch(() => {
      if (isActive) setPreviewUrl(null);
    });
    return () => { isActive = false; };
  }, [logoPath]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      show({ title: "File too large", description: "Logo must be under 2MB", variant: "error" });
      return;
    }

    setIsUploading(true);
    try {
      const extension = file.name.split(".").pop() || "png";
      const namedFile = new File([file], `logo.${extension}`, { type: file.type });
      
      const { asset } = await uploadCreativeAsset(brandId, "branding", namedFile);
      
      await updateBrandLogoAction(brandId, asset.fullPath);
      
      setLogoPath(asset.fullPath);
      show({ title: "Logo uploaded", description: "Brand logo updated.", variant: "success" });
      router.refresh();
    } catch (error) {
      console.error(error);
      show({ title: "Upload failed", description: "Could not upload logo.", variant: "error" });
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
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
      show({ title: "Logo removed", description: "Brand logo removed.", variant: "success" });
      router.refresh();
    } catch (error) {
      console.error(error);
      show({ title: "Remove failed", description: "Could not remove logo.", variant: "error" });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="relative group w-24 h-24">
      <input
        type="file"
        ref={inputRef}
        className="hidden"
        accept="image/png,image/jpeg,image/svg+xml"
        onChange={handleFileChange}
        disabled={isUploading}
      />
      
      <Avatar 
        className="w-24 h-24 cursor-pointer border-4 border-muted-foreground/10 hover:border-primary/50 transition-all shadow-sm" 
        onClick={() => !isUploading && inputRef.current?.click()}
      >
        <AvatarImage src={previewUrl ?? undefined} alt="Brand Logo" className="object-cover" />
        <AvatarFallback className="text-2xl font-semibold bg-muted text-muted-foreground">
          {isUploading ? <Loader2 className="w-6 h-6 animate-spin" /> : initials}
        </AvatarFallback>
      </Avatar>

      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 rounded-full cursor-pointer pointer-events-none">
        <Upload className="w-6 h-6 text-white" />
      </div>

      {logoPath && !isUploading && (
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
