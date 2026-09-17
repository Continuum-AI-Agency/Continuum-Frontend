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
import { subscribeToPostgresChanges } from '@/lib/supabase/realtime';
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
  const [heartbeatVersion, setHeartbeatVersion] = useState(0);
  const { show } = useToast();
  const indexingHeartbeatRef = useRef<Record<string, number>>({});
  const realtimeObservedAtRef = useRef<Record<string, number>>({});

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
        indexingHeartbeatRef.current[result.documentId] = Date.now();
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

  const reconcileDocumentRow = useCallback(
    (
      raw: Record<string, unknown>,
      options: { source: 'realtime' | 'backfill'; readStartedAt?: number },
    ) => {
      const id = typeof raw.id === 'string' ? raw.id : null;
      if (!id || !indexingIds.includes(id)) return;

      if (
        options.source === 'backfill' &&
        (realtimeObservedAtRef.current[id] ?? 0) > (options.readStartedAt ?? 0)
      ) {
        return;
      }

      const now = Date.now();
      if (options.source === 'realtime') {
        realtimeObservedAtRef.current[id] = now;
        indexingHeartbeatRef.current[id] = now;
      } else {
        const serverBeat = Date.parse(typeof raw.updated_at === 'string' ? raw.updated_at : '');
        indexingHeartbeatRef.current[id] = Number.isNaN(serverBeat) ? now : serverBeat;
      }

      const status = typeof raw.status === 'string' ? raw.status : null;
      const progressStep = typeof raw.progress_step === 'string' ? raw.progress_step : null;
      const errorMessage =
        typeof raw.error_message === 'string' ? raw.error_message : 'Indexing failed';

      if (status === 'ready' || progressStep === 'ready') {
        setFiles((previous) =>
          previous.map((file) =>
            file.documentId === id ? { ...file, status: 'ready', error: undefined } : file,
          ),
        );
        return;
      }
      if (status === 'error' || progressStep === 'error') {
        setFiles((previous) =>
          previous.map((file) =>
            file.documentId === id ? { ...file, status: 'error', error: errorMessage } : file,
          ),
        );
        return;
      }

      setHeartbeatVersion((version) => version + 1);
    },
    [indexingIds],
  );

  useEffect(() => {
    if (!brandId || indexingIds.length === 0) return;

    const unsubscribe = subscribeToPostgresChanges({
      label: `chat-documents-${brandId}-${indexingKey}`,
      bindings: [
        {
          event: 'UPDATE',
          schema: 'brand_profiles',
          table: 'brand_documents',
          filter: `brand_id=eq.${brandId}`,
          onRow: (row) => reconcileDocumentRow(row, { source: 'realtime' }),
        },
      ],
      onSubscribed: async () => {
        const readStartedAt = Date.now();
        try {
          const supabase = createSupabaseBrowserClient();
          const { data, error } = await supabase
            .schema('brand_profiles')
            .from('brand_documents')
            .select('id, status, progress_step, error_message, updated_at')
            .in('id', indexingIds);
          if (error) throw error;
          for (const row of data ?? []) {
            reconcileDocumentRow(row as Record<string, unknown>, {
              source: 'backfill',
              readStartedAt,
            });
          }
        } catch {
          // Realtime remains active; a later row update can still complete the attachment.
        }
      },
    });

    return () => {
      unsubscribe();
    };
  }, [brandId, indexingKey, indexingIds, reconcileDocumentRow]);

  useEffect(() => {
    if (indexingIds.length === 0) return;
    const now = Date.now();
    for (const id of indexingIds) {
      indexingHeartbeatRef.current[id] ??= now;
    }
    const delay = Math.max(
      0,
      Math.min(
        ...indexingIds.map((id) => indexingHeartbeatRef.current[id] + STALE_PROCESSING_MS - now),
      ),
    );
    const timeout = setTimeout(() => {
      const staleBefore = Date.now() - STALE_PROCESSING_MS;
      setFiles((previous) =>
        previous.map((file) =>
          file.status === 'indexing' &&
          file.documentId &&
          indexingIds.includes(file.documentId) &&
          indexingHeartbeatRef.current[file.documentId] <= staleBefore
            ? { ...file, status: 'error', error: 'Indexing timed out' }
            : file,
        ),
      );
      setHeartbeatVersion((version) => version + 1);
    }, delay);
    return () => clearTimeout(timeout);
  }, [heartbeatVersion, indexingKey, indexingIds]);

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
