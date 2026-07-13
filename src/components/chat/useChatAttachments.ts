'use client';

import { useCallback, useMemo, useState } from 'react';
import { uploadChatAttachment } from '@/lib/chat/uploadChatAttachment';
import { uploadMediaAsset } from '@/lib/library/uploadMediaAsset';
import type { Attachment } from './attachments';

export const ACCEPTED_ATTACHMENT_TYPES = 'image/*,video/*,application/pdf';

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

// The agent reads the URL within seconds of the send, but the transcript re-renders it for as long
// as the session is open. A week keeps history intact without minting effectively-permanent links;
// `storagePath` is retained so an expired URL can be re-signed rather than lost.
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

export type ChatAttachmentsController = {
  files: Attachment[];
  add: (incoming: FileList | File[]) => void;
  remove: (id: string) => void;
  clear: () => void;
  saveToLibrary: (id: string) => Promise<void>;
  isUploading: boolean;
};

type UseChatAttachmentsParams = {
  brandId: string | null | undefined;
  sessionId: string | null | undefined;
};

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function useChatAttachments({
  brandId,
  sessionId,
}: UseChatAttachmentsParams): ChatAttachmentsController {
  const [files, setFiles] = useState<Attachment[]>([]);

  const patch = useCallback((id: string, next: Partial<Attachment>) => {
    setFiles((previous) => previous.map((file) => (file.id === id ? { ...file, ...next } : file)));
  }, []);

  const upload = useCallback(
    async (id: string, file: File) => {
      if (!brandId) {
        patch(id, { status: 'error', error: 'No brand selected' });
        return;
      }

      try {
        const { storagePath, signedUrl } = await uploadChatAttachment({
          brandId,
          sessionId: sessionId ?? 'unsaved',
          attachmentId: id,
          file,
          expiresInSeconds: SIGNED_URL_TTL_SECONDS,
        });
        patch(id, { status: 'ready', url: signedUrl, storagePath });
      } catch (error) {
        patch(id, {
          status: 'error',
          error: error instanceof Error ? error.message : 'Upload failed',
        });
      }
    },
    [brandId, patch, sessionId],
  );

  const add = useCallback(
    (incoming: FileList | File[]) => {
      const accepted: Array<{ attachment: Attachment; file: File }> = [];

      for (const file of Array.from(incoming)) {
        const id = crypto.randomUUID();
        const tooLarge = file.size > MAX_ATTACHMENT_BYTES;

        accepted.push({
          file,
          attachment: {
            id,
            name: file.name,
            type: file.type,
            size: formatAttachmentSize(file.size),
            file,
            status: tooLarge ? 'error' : 'uploading',
            error: tooLarge
              ? `Larger than ${formatAttachmentSize(MAX_ATTACHMENT_BYTES)}`
              : undefined,
          },
        });
      }

      if (accepted.length === 0) return;

      setFiles((previous) => [...previous, ...accepted.map((entry) => entry.attachment)]);

      for (const { attachment, file } of accepted) {
        if (attachment.status === 'uploading') {
          void upload(attachment.id, file);
        }
      }
    },
    [upload],
  );

  const remove = useCallback((id: string) => {
    setFiles((previous) => previous.filter((file) => file.id !== id));
  }, []);

  const clear = useCallback(() => {
    setFiles([]);
  }, []);

  const saveToLibrary = useCallback(
    async (id: string) => {
      const target = files.find((file) => file.id === id);
      if (!brandId || !target?.file || target.savedAssetId) return;

      patch(id, { saving: true });
      try {
        const result = await uploadMediaAsset({ file: target.file, brandId });
        patch(id, { saving: false, savedAssetId: result.assetId });
      } catch (error) {
        patch(id, {
          saving: false,
          error: error instanceof Error ? error.message : 'Could not save to library',
        });
      }
    },
    [brandId, files, patch],
  );

  const isUploading = useMemo(() => files.some((file) => file.status === 'uploading'), [files]);

  return { files, add, remove, clear, saveToLibrary, isUploading };
}
