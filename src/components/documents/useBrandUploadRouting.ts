'use client';

// A drop on Knowledge is routed, not questioned: documents are read here, images, logos and
// SVGs go to the Library, fonts go to the font review. One toast says where things went, and
// an image that was really a page of text (a price list, a menu) can be read instead.

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { bulkDeleteAssetsOperation } from '@/lib/library/creativeOperations';
import { uploadMediaAsset } from '@/lib/library/uploadMediaAsset';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  mayReadAsText,
  routeBrandUploads,
  withFontArchivesExpanded,
} from '@/lib/uploads/brandUploadRouting';

export type BrandUploadRoutingDeps = {
  sendToLibrary: (file: File, brandId: string) => Promise<{ assetId: string }>;
  removeFromLibrary: (brandId: string, assetIds: string[]) => Promise<unknown>;
};

const defaultDeps: BrandUploadRoutingDeps = {
  sendToLibrary: (file, brandId) => uploadMediaAsset({ file, brandId }),
  removeFromLibrary: (brandId, assetIds) =>
    bulkDeleteAssetsOperation(createSupabaseBrowserClient(), { brandId, assetIds }),
};

export function useBrandUploadRouting({
  brandId,
  uploadDocuments,
  deps = defaultDeps,
}: {
  brandId: string;
  uploadDocuments: (files: File[]) => Promise<void>;
  deps?: BrandUploadRoutingDeps;
}) {
  const uiText = useTranslations('common');
  const { show } = useToast();
  const [fontFiles, setFontFiles] = useState<File[]>([]);

  const sendToLibrary = async (files: File[]) => {
    if (files.length === 0) return;
    const results = await Promise.allSettled(
      files.map((file) => deps.sendToLibrary(file, brandId)),
    );
    const sent = files.flatMap((file, index) => {
      const result = results[index];
      return result?.status === 'fulfilled' ? [{ file, assetId: result.value.assetId }] : [];
    });
    const failed = files.filter((_, index) => results[index]?.status === 'rejected');
    if (failed.length > 0) {
      show({
        title: uiText('routedToLibraryFailed', {
          files: failed.map((file) => file.name).join(', '),
        }),
        variant: 'error',
      });
    }
    if (sent.length === 0) return;
    const readable = sent.filter(({ file }) => mayReadAsText(file));
    show({
      title: uiText('routedToLibraryTitle', { count: sent.length }),
      description: uiText('routedToLibraryBody'),
      variant: 'success',
      ...(readable.length > 0
        ? {
            action: {
              label: uiText('routedReadAsText', { count: readable.length }),
              onClick: () => void readAsText(readable),
            },
          }
        : {}),
    });
  };

  // The Library copy is soft-deleted (recoverable from Trash), then the image is read here.
  const readAsText = async (images: { file: File; assetId: string }[]) => {
    try {
      await deps.removeFromLibrary(
        brandId,
        images.map(({ assetId }) => assetId),
      );
    } catch (error) {
      console.error('[useBrandUploadRouting] Library copy not removed', error);
    }
    await uploadDocuments(images.map(({ file }) => file));
  };

  const route = async (dropped: File[]) => {
    const { knowledge, library, fonts } = routeBrandUploads(
      await withFontArchivesExpanded(dropped),
      'knowledge',
    );
    if (fonts.length > 0) setFontFiles((held) => [...held, ...fonts]);
    await Promise.all([uploadDocuments(knowledge), sendToLibrary(library)]);
  };

  return { route, fontFiles, clearFontFiles: () => setFontFiles([]) };
}
