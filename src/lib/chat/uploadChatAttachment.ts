'use client';

import { createSignedAssetUrl } from '@/lib/creative-assets/storageClient';
import { MEDIA_LIBRARY_BUCKET } from '@/lib/library/uploadMediaAsset';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

// Chat attachments land in the media-library BUCKET but are deliberately NOT registered as
// media.assets rows, so they stay out of the Library until the user explicitly saves them.
//
// The bucket choice is load-bearing: storage.objects only carries RLS policies for `media-library`
// and `media-source`. `brand-profile-assets` (the creative-assets bucket) has no policy, so an
// authenticated browser upload to it is denied outright.
export type ChatAttachmentUpload = {
  storagePath: string;
  signedUrl: string;
};

export type UploadChatAttachmentParams = {
  brandId: string;
  sessionId: string;
  attachmentId: string;
  file: File;
  expiresInSeconds: number;
};

// One folder per attachment id: two files with the same name in one session would otherwise
// collide, and the upload is deliberately non-upserting.
export function chatAttachmentPath({
  brandId,
  sessionId,
  attachmentId,
  fileName,
}: {
  brandId: string;
  sessionId: string;
  attachmentId: string;
  fileName: string;
}): string {
  return `${brandId}/chat-attachments/${sessionId}/${attachmentId}/${fileName}`;
}

export async function uploadChatAttachment({
  brandId,
  sessionId,
  attachmentId,
  file,
  expiresInSeconds,
}: UploadChatAttachmentParams): Promise<ChatAttachmentUpload> {
  const supabase = createSupabaseBrowserClient();
  const storagePath = chatAttachmentPath({
    brandId,
    sessionId,
    attachmentId,
    fileName: file.name,
  });

  const { error } = await supabase.storage
    .from(MEDIA_LIBRARY_BUCKET)
    .upload(storagePath, file, { upsert: false, cacheControl: '3600' });

  if (error) {
    throw error;
  }

  const signedUrl = await createSignedAssetUrl(storagePath, expiresInSeconds, MEDIA_LIBRARY_BUCKET);

  return { storagePath, signedUrl };
}
