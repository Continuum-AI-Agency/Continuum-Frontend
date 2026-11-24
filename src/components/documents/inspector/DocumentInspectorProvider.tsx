'use client';

// Opens the DocumentInspector from anywhere under it: a Knowledge row, a chat attachment chip,
// later a Jaina citation (`focusPassage`). The surface that mounts the provider knows the brand
// and, in a chat, the session that owns one-off uploads; the opener only names the document.
// The layout is parsed on the first open and cached by the Backend, and by React Query here.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { createContext, type ReactNode, useContext, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { readDocumentLayout } from '@/lib/documents/documentLayout.client';
import { DocumentInspector, type DocumentInspectorState } from './DocumentInspector';

export type DocumentInspectorRequest = {
  documentId: string;
  name: string;
  focusPassage?: string;
};

const OpenInspectorContext = createContext<((request: DocumentInspectorRequest) => void) | null>(
  null,
);

/** null outside a provider, so a surface without one simply offers no Inspect. */
export function useOpenDocumentInspector() {
  return useContext(OpenInspectorContext);
}

export function DocumentInspectorProvider({
  brandId,
  scopeKey,
  children,
}: {
  brandId: string | null | undefined;
  scopeKey?: string;
  children: ReactNode;
}) {
  const [request, setRequest] = useState<DocumentInspectorRequest | null>(null);
  if (!brandId) return <>{children}</>;
  return (
    <OpenInspectorContext.Provider value={setRequest}>
      {children}
      {request ? (
        <DocumentInspectorDialog
          key={`${request.documentId}:${request.focusPassage ?? ''}`}
          brandId={brandId}
          scopeKey={scopeKey}
          request={request}
          onClose={() => setRequest(null)}
        />
      ) : null}
    </OpenInspectorContext.Provider>
  );
}

// The signed file URL lives 15 minutes on the Backend; a layout older than that is asked for
// again (a stored layout costs no model call).
const LAYOUT_STALE_MS = 10 * 60_000;

function DocumentInspectorDialog({
  brandId,
  scopeKey,
  request,
  onClose,
}: {
  brandId: string;
  scopeKey?: string;
  request: DocumentInspectorRequest;
  onClose: () => void;
}) {
  const uiText = useTranslations('common');
  const queryClient = useQueryClient();
  const key = ['document-layout', brandId, request.documentId, scopeKey ?? null];
  const input = { brandId, documentId: request.documentId, scopeKey };
  const layout = useQuery({
    queryKey: key,
    queryFn: () => readDocumentLayout(input),
    staleTime: LAYOUT_STALE_MS,
    retry: false,
  });
  const rerun = useMutation({
    mutationFn: () => readDocumentLayout({ ...input, refresh: true }),
    onSuccess: (data) => queryClient.setQueryData(key, data),
  });

  const state: DocumentInspectorState =
    rerun.isPending || layout.isPending || (layout.isError && layout.isFetching)
      ? { status: 'parsing' }
      : rerun.isError || layout.isError || !layout.data
        ? { status: 'error' }
        : layout.data.status === 'unsupported'
          ? { status: 'unsupported' }
          : { ...layout.data, status: 'parsed' };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="flex h-[min(90dvh,56rem)] w-[min(96vw,80rem)] max-w-none flex-col gap-3 sm:max-w-none">
        <DialogTitle className="pr-8">
          {uiText('inspectorTitle', { name: request.name })}
        </DialogTitle>
        <DocumentInspector
          state={state}
          name={request.name}
          focusPassage={request.focusPassage}
          onRerun={() => (layout.isError ? void layout.refetch() : rerun.mutate())}
          className="min-h-0 flex-1"
        />
      </DialogContent>
    </Dialog>
  );
}
