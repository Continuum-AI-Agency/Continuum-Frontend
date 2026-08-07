'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STALE_PROCESSING_MS } from '@/components/documents/useDocuments';
import { useToast } from '@/components/ui/ToastProvider';
import { uploadEphemeralChatDocument } from '@/lib/documents/uploadEphemeralChatDocument';
import {
  ACCEPTED_DOCUMENT_EXTENSIONS,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_MB,
} from '@/lib/documents/uploadLimits';
import { uploadMediaAsset } from '@/lib/library/uploadMediaAsset';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { classifyChatAttachment } from './attachmentRouting';
import type { Attachment } from './attachments';

// Media types the composer accepts, plus every document extension. Extension-driven
// for documents because browsers report an empty MIME for .md and mis-report .docx —
// a MIME-only accept list silently omits formats the pipeline handles fine.
export const ACCEPTED_ATTACHMENT_TYPES = `image/*,video/*,${ACCEPTED_DOCUMENT_EXTENSIONS}`;

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export type ChatAttachmentsController = {
  files: Attachment[];
  add: (incoming: FileList | File[]) => void;
  remove: (id: string) => void;
  clear: () => void;
  retry: (id: string) => Promise<void>;
  isUploading: boolean;
  hasErrors: boolean;
  /**
   * Session key that scopes any one-off document uploaded from this composer. Send it
   * with the turn so the Backend can resolve those documents — and only those.
   */
  scopeKey: string;
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
  const { show } = useToast();

  // A brand-new conversation has no sessionId until the first turn lands, but a
  // document dropped before then still needs a scope. Fall back to a stable
  // composer-lifetime key and send that with the turn.
  const fallbackScopeRef = useRef<string>('');
  if (!fallbackScopeRef.current) fallbackScopeRef.current = `composer:${crypto.randomUUID()}`;
  const scopeKey = sessionId ?? fallbackScopeRef.current;

  const patch = useCallback((id: string, next: Partial<Attachment>) => {
    setFiles((previous) => previous.map((file) => (file.id === id ? { ...file, ...next } : file)));
  }, []);

  const uploadMedia = useCallback(
    async (id: string, file: File) => {
      if (!brandId) {
        patch(id, { status: 'error', error: 'No brand selected' });
        return;
      }
      try {
        const result = await uploadMediaAsset({ brandId, file });
        patch(id, {
          status: 'ready',
          assetId: result.assetId,
          versionId: result.versionId,
          url: result.signedUrl,
          storagePath: result.storagePath,
          error: undefined,
        });
      } catch (error) {
        patch(id, {
          status: 'error',
          error: error instanceof Error ? error.message : 'Upload failed',
        });
      }
    },
    [brandId, patch],
  );

  const uploadDocument = useCallback(
    async (id: string, file: File) => {
      if (!brandId) {
        patch(id, { status: 'error', error: 'No brand selected' });
        return;
      }
      try {
        const result = await uploadEphemeralChatDocument({ brandId, file, scopeKey });
        // Uploaded, but NOT yet usable — ingest runs in the background. The chip stays
        // in a blocking state until the row reaches a terminal step.
        patch(id, {
          status: 'indexing',
          documentId: result.documentId,
          storagePath: result.storagePath,
          retention: 'ephemeral',
          expiresAt: result.expiresAt,
          error: undefined,
        });
      } catch (error) {
        patch(id, {
          status: 'error',
          error: error instanceof Error ? error.message : 'Upload failed',
        });
      }
    },
    [brandId, patch, scopeKey],
  );

  const upload = useCallback(
    (id: string, file: File, kind: Attachment['kind']) =>
      kind === 'document' ? uploadDocument(id, file) : uploadMedia(id, file),
    [uploadDocument, uploadMedia],
  );

  const add = useCallback(
    (incoming: FileList | File[]) => {
      const accepted: Array<{ attachment: Attachment; file: File }> = [];

      for (const file of Array.from(incoming)) {
        const kind = classifyChatAttachment(file);
        // Two different backing limits that happen to share a value today. Keep them
        // separate — the media bucket and the brand-docs bucket move independently.
        const limit = kind === 'document' ? MAX_DOCUMENT_BYTES : MAX_ATTACHMENT_BYTES;
        const tooLarge = file.size > limit;

        accepted.push({
          file,
          attachment: {
            id: crypto.randomUUID(),
            kind,
            name: file.name,
            type: file.type,
            size: formatAttachmentSize(file.size),
            file,
            status: tooLarge ? 'error' : 'uploading',
            error: tooLarge
              ? kind === 'document'
                ? `Larger than ${MAX_DOCUMENT_MB} MB`
                : `Larger than ${formatAttachmentSize(MAX_ATTACHMENT_BYTES)}`
              : undefined,
          },
        });
      }

      if (accepted.length === 0) return;

      setFiles((previous) => [...previous, ...accepted.map((entry) => entry.attachment)]);

      // Fired at classification time, not after ingest: the user needs to know the file
      // is temporary before they hit send, and the notice must not depend on how long
      // indexing takes. dedupeKey suppresses duplicates while one is still on screen,
      // so dragging three files yields one toast.
      const documents = accepted.filter((entry) => entry.attachment.kind === 'document');
      if (documents.length > 0) {
        const description =
          documents.length === 1
            ? `"${documents[0].attachment.name}" is available to the agent for 14 days. Save it to Knowledge in Settings to keep it permanently.`
            : `${documents.length} documents are available to the agent for 14 days. Save them to Knowledge in Settings to keep them permanently.`;
        show({
          title: 'Added for this conversation',
          description,
          variant: 'info',
          durationMs: 10_000,
          dedupeKey: 'chat-ephemeral-doc-notice',
          action: {
            label: 'Open Knowledge',
            onClick: () => window.open('/settings?section=knowledge', '_blank', 'noopener'),
          },
        });
      }

      for (const { attachment, file } of accepted) {
        if (attachment.status === 'uploading') {
          void upload(attachment.id, file, attachment.kind);
        }
      }
    },
    [show, upload],
  );

  // Watch ingest for documents still indexing. Without this the chip would never leave
  // the blocking state and the composer would stay disabled forever.
  const indexingIds = useMemo(
    () =>
      files
        .filter((file) => file.status === 'indexing' && file.documentId)
        .map((file) => file.documentId as string),
    [files],
  );
  const indexingKey = indexingIds.join(',');

  useEffect(() => {
    if (!brandId || indexingIds.length === 0) return;
    const supabase = createSupabaseBrowserClient();

    const channel = supabase
      .channel(`chat-documents-${brandId}-${indexingKey}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'brand_profiles',
          table: 'brand_documents',
          filter: `brand_id=eq.${brandId}`,
        },
        (payload) => {
          const row = payload.new as {
            id?: string;
            progress_step?: string;
            error_message?: string;
          };
          if (!row.id || !indexingIds.includes(row.id)) return;
          if (row.progress_step === 'ready') {
            setFiles((previous) =>
              previous.map((file) =>
                file.documentId === row.id ? { ...file, status: 'ready' } : file,
              ),
            );
          } else if (row.progress_step === 'error') {
            setFiles((previous) =>
              previous.map((file) =>
                file.documentId === row.id
                  ? { ...file, status: 'error', error: row.error_message ?? 'Indexing failed' }
                  : file,
              ),
            );
          }
        },
      )
      .subscribe();

    // Same ceiling the settings list uses. An isolate that dies before writing a
    // terminal row must not leave the composer permanently un-sendable.
    const timeout = setTimeout(() => {
      setFiles((previous) =>
        previous.map((file) =>
          file.status === 'indexing' && file.documentId && indexingIds.includes(file.documentId)
            ? { ...file, status: 'error', error: 'Indexing timed out' }
            : file,
        ),
      );
    }, STALE_PROCESSING_MS);

    return () => {
      clearTimeout(timeout);
      supabase.removeChannel(channel);
    };
  }, [brandId, indexingKey, indexingIds]);

  const remove = useCallback((id: string) => {
    setFiles((previous) => previous.filter((file) => file.id !== id));
  }, []);

  const clear = useCallback(() => {
    setFiles([]);
  }, []);

  const retry = useCallback(
    async (id: string) => {
      const target = files.find((file) => file.id === id);
      if (!target?.file || target.status !== 'error') return;
      patch(id, { status: 'uploading', error: undefined });
      await upload(id, target.file, target.kind);
    },
    [files, patch, upload],
  );

  // 'indexing' counts as in-flight on purpose. canSubmit gates on this, and a document
  // that has landed in storage but has no chunks yet would reach the model as nothing.
  const isUploading = useMemo(
    () => files.some((file) => file.status === 'uploading' || file.status === 'indexing'),
    [files],
  );
  const hasErrors = useMemo(() => files.some((file) => file.status === 'error'), [files]);

  return { files, add, remove, clear, retry, isUploading, hasErrors, scopeKey };
}
