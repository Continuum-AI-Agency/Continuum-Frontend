import { Cross2Icon, FileTextIcon, LinkBreak2Icon, UploadIcon } from '@radix-ui/react-icons';
import {
  Handle,
  type NodeProps,
  NodeResizer,
  Position,
  type Node as ReactFlowNode,
  useEdges,
} from '@xyflow/react';
import { Copy, Library, Loader2, Trash2 } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import type { DocumentView } from '@/components/documents/types';
import { useDocuments } from '@/components/documents/useDocuments';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/ToastProvider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { resolveDroppedBase64 } from '@/lib/ai-studio/referenceDropClient';
import { CREATIVE_ASSET_DRAG_TYPE } from '@/lib/creative-assets/drag';
import { uploadBrandDocument } from '@/lib/documents/uploadBrandDocument';
import { isAcceptedDocumentMime } from '@/lib/documents/uploadLimits';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { useNodeSelection } from '../contexts/PresenceContext';
import { useStudioStore } from '../stores/useStudioStore';
import type { CanvasDocument, DocumentNodeData } from '../types';
import { resolveCreativeAssetDrop } from '../utils/resolveCreativeAssetDrop';

const RF_DRAG_MIME = 'application/reactflow-node-data';
const TEXT_MIME = 'text/plain';

// A minimal view of a brand_documents row as needed for the picker.
type PlatformDocRow = {
  id: string;
  name: string;
  kind: string | null;
  storage_path: string | null;
  status: string;
};

// Per-doc upload state — only held in memory; not persisted to canvas.
type DocUploadState = 'processing' | 'ready' | 'error';

function inferDocType(name: string, kind: string | null): 'pdf' | 'txt' {
  if (kind === 'pdf') return 'pdf';
  const ext = name.split('.').pop()?.toLowerCase();
  return ext === 'pdf' ? 'pdf' : 'txt';
}

// Resolves live status for a CanvasDocument entry: platform docs tracked via
// useDocuments realtime; local uploads tracked by in-memory upload state.
function resolveDocStatus(
  doc: CanvasDocument,
  uploadStates: Map<string, DocUploadState>,
  liveDocById: Map<string, DocumentView>,
): { status: DocUploadState; step?: string } {
  if (doc.sourceDocumentId) {
    const live = liveDocById.get(doc.sourceDocumentId);
    if (!live) return { status: 'processing' };
    if (live.status === 'ready') return { status: 'ready' };
    if (live.status === 'error') return { status: 'error' };
    return { status: 'processing', step: live.progressStep ?? undefined };
  }
  const state = uploadStates.get(doc.name);
  return { status: state ?? 'ready' };
}

// Ingests a file into the brand-docs library and kicks off embed_document.
// Returns the documentId on success; throws on failure.
//
// The upload sequence itself lives in uploadBrandDocument — this used to be a verbatim
// copy of the one in useDocumentMutations, and the two had already drifted.
// syncOnboardingState is false here: AI Studio ingest must never mutate an
// already-onboarded brand's intake state.
async function ingestDocumentFile(file: File, brandId: string): Promise<string> {
  const { documentId } = await uploadBrandDocument({
    brandId,
    file,
    syncOnboardingState: false,
  });
  return documentId;
}

export function DocumentNode({ id, data, selected }: NodeProps<ReactFlowNode<DocumentNodeData>>) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const triggerSave = useStudioStore((state) => state.triggerSave);
  const duplicateNode = useStudioStore((state) => state.duplicateNode);
  const deleteNode = useStudioStore((state) => state.deleteNode);
  const detachNodeConnections = useStudioStore((state) => state.detachNodeConnections);
  const getConnectedEdges = useStudioStore((state) => state.getConnectedEdges);
  const brandId = useStudioStore((state) => state.brandId);
  const edges = useEdges();
  const { show } = useToast();
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [platformDocs, setPlatformDocs] = useState<PlatformDocRow[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  // In-memory upload states keyed by doc name to show processing/error on chips.
  const [uploadStates, setUploadStates] = useState<Map<string, DocUploadState>>(new Map());

  const documents = data.documents ?? [];
  const docConnections = edges.filter(
    (edge) => edge.source === id && edge.sourceHandle === 'document',
  ).length;

  // Realtime status subscription for all documents in this node that have a
  // sourceDocumentId — covers both local uploads (assigned after ingest returns)
  // and platform picks.
  const liveDocuments = useDocuments(brandId ?? '', []);
  const liveDocById = useRef<Map<string, DocumentView>>(new Map());
  useEffect(() => {
    const map = new Map<string, DocumentView>();
    for (const doc of liveDocuments) map.set(doc.id, doc);
    liveDocById.current = map;
  }, [liveDocuments]);

  const addDocuments = useCallback(
    (newDocs: CanvasDocument[]) => {
      const current = data.documents ?? [];
      updateNodeData(id, { documents: [...current, ...newDocs] });
      triggerSave();
    },
    [data.documents, id, triggerSave, updateNodeData],
  );

  const removeDocument = useCallback(
    (index: number) => {
      const current = data.documents ?? [];
      const next = [...current];
      next.splice(index, 1);
      updateNodeData(id, { documents: next });
      triggerSave();
    },
    [data.documents, id, triggerSave, updateNodeData],
  );

  // Upload a local file through the embed_document pipeline, then patch the
  // canvas document entry with the returned documentId.
  const ingestFile = useCallback(
    async (file: File, docName: string, insertIndex: number) => {
      if (!brandId) return;

      setUploadStates((prev) => new Map(prev).set(docName, 'processing'));
      try {
        const documentId = await ingestDocumentFile(file, brandId);
        // Patch the canvas doc at insertIndex with the assigned documentId so
        // the realtime subscription and enrich route can resolve it.
        const current: CanvasDocument[] = useStudioStore.getState().nodes.find((n) => n.id === id)
          ? ((useStudioStore.getState().nodes.find((n) => n.id === id)?.data as DocumentNodeData)
              .documents ?? [])
          : (data.documents ?? []);
        const next = [...current];
        if (insertIndex < next.length) {
          next[insertIndex] = { ...next[insertIndex], sourceDocumentId: documentId };
        }
        updateNodeData(id, { documents: next });
        triggerSave();
        setUploadStates((prev) => {
          const m = new Map(prev);
          m.delete(docName);
          return m;
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : `Failed to ingest ${file.name}`;
        show({ title: 'Upload failed', description: msg, variant: 'error' });
        setUploadStates((prev) => new Map(prev).set(docName, 'error'));
      }
    },
    [brandId, data.documents, id, show, triggerSave, updateNodeData],
  );

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!brandId) {
        show({
          title: 'No brand selected',
          description: 'Select a brand before uploading documents.',
          variant: 'warning',
        });
        return;
      }
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const current = data.documents ?? [];
      const accepted: Array<{ file: File; doc: CanvasDocument }> = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!isAcceptedDocumentMime(file.type)) continue;
        accepted.push({ file, doc: { name: file.name, type: inferDocType(file.name, null) } });
      }

      if (accepted.length === 0) return;

      const startIndex = current.length;
      addDocuments(accepted.map(({ doc }) => doc));

      for (let i = 0; i < accepted.length; i++) {
        const { file, doc } = accepted[i];
        void ingestFile(file, doc.name, startIndex + i);
      }
    },
    [addDocuments, brandId, data.documents, ingestFile, show],
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const files = event.dataTransfer.files;
      if (files && files.length > 0) {
        if (!brandId) {
          show({
            title: 'No brand selected',
            description: 'Select a brand before uploading documents.',
            variant: 'warning',
          });
          return;
        }

        const current = data.documents ?? [];
        const accepted: Array<{ file: File; doc: CanvasDocument }> = [];
        let rejectedCount = 0;

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (!isAcceptedDocumentMime(file.type)) {
            rejectedCount++;
            continue;
          }
          accepted.push({ file, doc: { name: file.name, type: inferDocType(file.name, null) } });
        }

        if (rejectedCount > 0) {
          show({
            title: 'Some files ignored',
            description: `${rejectedCount} file(s) were not a supported document type.`,
            variant: 'warning',
          });
        }

        if (accepted.length > 0) {
          const startIndex = current.length;
          addDocuments(accepted.map(({ doc }) => doc));
          for (let i = 0; i < accepted.length; i++) {
            const { file, doc } = accepted[i];
            void ingestFile(file, doc.name, startIndex + i);
          }
        }
        return;
      }

      const rawPayload =
        event.dataTransfer.getData(CREATIVE_ASSET_DRAG_TYPE) ||
        event.dataTransfer.getData(RF_DRAG_MIME) ||
        event.dataTransfer.getData(TEXT_MIME);

      if (!rawPayload) return;

      const resolved = await resolveCreativeAssetDrop(rawPayload, resolveDroppedBase64);
      if (resolved.status === 'error') {
        show({
          title: resolved.title,
          description: resolved.description,
          variant: resolved.variant ?? 'error',
        });
        return;
      }

      if (resolved.nodeType !== 'document') {
        show({
          title: 'Unsupported asset',
          description: 'Only document assets can be dropped here.',
          variant: 'warning',
        });
        return;
      }

      const type = resolved.mimeType === 'application/pdf' ? 'pdf' : 'txt';
      if (resolved.sourceUrl || resolved.sourcePath) {
        addDocuments([
          {
            name: resolved.fileName || 'Document',
            type,
            sourceUrl: resolved.sourceUrl,
            storagePath: resolved.sourcePath,
            bucket: resolved.bucket,
            content: resolved.dataUrl,
          },
        ]);
      } else {
        addDocuments([{ name: resolved.fileName || 'Document', type, content: resolved.dataUrl }]);
      }
    },
    [addDocuments, brandId, data.documents, ingestFile, show],
  );

  const openPicker = useCallback(async () => {
    if (!brandId) {
      show({
        title: 'No brand selected',
        description: 'Select a brand first.',
        variant: 'warning',
      });
      return;
    }
    setPickerOpen(true);
    setPickerLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: rows, error } = await supabase
        .schema('brand_profiles')
        .from('brand_documents')
        .select('id, name, kind, storage_path, status')
        .eq('brand_id', brandId)
        .eq('status', 'ready')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPlatformDocs((rows ?? []) as PlatformDocRow[]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load documents';
      show({ title: 'Load failed', description: msg, variant: 'error' });
      setPickerOpen(false);
    } finally {
      setPickerLoading(false);
    }
  }, [brandId, show]);

  const selectPlatformDoc = useCallback(
    (row: PlatformDocRow) => {
      const alreadyAdded = (data.documents ?? []).some((d) => d.sourceDocumentId === row.id);
      if (alreadyAdded) {
        show({
          title: 'Already added',
          description: `"${row.name}" is already in this node.`,
          variant: 'warning',
        });
        return;
      }
      const type = inferDocType(row.name, row.kind);
      addDocuments([
        {
          name: row.name,
          type,
          sourceDocumentId: row.id,
          storagePath: row.storage_path ?? undefined,
        },
      ]);
      setPickerOpen(false);
    },
    [addDocuments, data.documents, show],
  );

  return (
    <TooltipProvider>
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select platform document</DialogTitle>
          </DialogHeader>
          {pickerLoading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Loading…</p>
          ) : platformDocs.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No ready documents found for this brand.
            </p>
          ) : (
            <ul className="nodrag nowheel max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
              {platformDocs.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => selectPlatformDoc(row)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
                  >
                    <div className="rounded bg-amber-500/10 p-1 text-amber-600">
                      <FileTextIcon className="h-4 w-4" />
                    </div>
                    <span className="min-w-0 flex-1 truncate font-medium">{row.name}</span>
                    <span className="shrink-0 text-2xs uppercase text-muted-foreground">
                      {inferDocType(row.name, row.kind)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <ContextMenu>
        <ContextMenuTrigger
          render={
            // biome-ignore lint/a11y/noStaticElementInteractions: drop zone for document files; no semantic role applies
            <div
              className={cn(
                'relative group w-full h-full min-w-[200px] min-h-[200px] rounded-xl transition-shadow',
                isSelectedByOther && 'selected-by-other',
              )}
              style={{ '--other-user-color': selectingUser?.color } as React.CSSProperties}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <NodeResizer
                minWidth={180}
                minHeight={180}
                isVisible={selected}
                lineClassName="border-brand-primary/60"
                handleClassName="h-3 w-3 bg-brand-primary border-2 border-background rounded-full"
              />
              <CanvasNode
                handles={{ target: false, source: false }}
                selected={selected}
                className="relative h-full w-full min-w-0 overflow-hidden border-border/60 bg-background p-0 shadow-sm transition-shadow hover:shadow-md"
              >
                <NodeContent className="relative flex-1 min-h-0 p-0 flex flex-col bg-muted/30 group/preview">
                  <Label
                    htmlFor={`doc-upload-${id}`}
                    className="absolute right-8 top-2 z-20 cursor-pointer rounded bg-background/90 p-1 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground group-hover/preview:opacity-100"
                    onMouseDown={(event) => event.stopPropagation()}
                  >
                    <UploadIcon className="w-3 h-3" />
                  </Label>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={openPicker}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="absolute right-2 top-2 z-20 h-6 w-6 rounded bg-background/90 p-1 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground group-hover/preview:opacity-100"
                    title="Select from platform"
                  >
                    <Library className="w-3 h-3" />
                  </Button>

                  {documents.length > 0 ? (
                    <div className="nodrag flex-1 space-y-2 overflow-y-auto p-2">
                      {documents.map((doc, index) => {
                        const { status, step } = resolveDocStatus(
                          doc,
                          uploadStates,
                          liveDocById.current,
                        );
                        return (
                          <div
                            key={index}
                            className="group/item flex items-center gap-2 rounded-md border border-border/70 bg-background/90 p-2 shadow-sm"
                          >
                            <div className="rounded bg-amber-500/10 p-1.5 text-amber-600">
                              {status === 'processing' ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <FileTextIcon className="w-4 h-4" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="truncate text-xs font-medium text-foreground">
                                {doc.name}
                              </p>
                              <p className="text-3xs uppercase text-muted-foreground">
                                {status === 'processing'
                                  ? (step ?? 'processing…')
                                  : status === 'error'
                                    ? 'error'
                                    : doc.sourceDocumentId
                                      ? `${doc.type} · ready`
                                      : doc.type}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeDocument(index)}
                              className="rounded p-1 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover/item:opacity-100"
                            >
                              <Cross2Icon className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-4">
                      <Label
                        htmlFor={`doc-upload-${id}`}
                        className="cursor-pointer flex h-full w-full flex-col items-center justify-center transition-opacity hover:opacity-80"
                      >
                        <Empty>
                          <EmptyHeader>
                            <EmptyMedia variant="icon">
                              <FileTextIcon />
                            </EmptyMedia>
                            <EmptyTitle>No Documents</EmptyTitle>
                            <EmptyDescription>
                              {brandId
                                ? 'Drag & drop, upload, or select from platform'
                                : 'Select a brand to upload documents'}
                            </EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      </Label>
                    </div>
                  )}

                  <Input
                    id={`doc-upload-${id}`}
                    type="file"
                    accept=".txt,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
                    multiple
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </NodeContent>
              </CanvasNode>

              <Tooltip>
                <TooltipTrigger
                  render={
                    <Handle
                      type="source"
                      position={Position.Right}
                      id="document"
                      style={{
                        ['--edge-color' as keyof React.CSSProperties]:
                          'var(--edge-document, #f59e0b)',
                      }}
                      className="studio-handle !w-4 !h-4 !border-2 shadow-sm !-right-2 transition-transform hover:scale-125 top-1/2"
                    />
                  }
                />
                <TooltipContent>
                  <p>Document Output: {docConnections} connections</p>
                </TooltipContent>
              </Tooltip>
            </div>
          }
        />
        <ContextMenuContent className="w-52">
          <ContextMenuLabel>Document Context</ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => duplicateNode(id)}>
            <Copy className="mr-2 h-4 w-4" />
            Duplicate
            <ContextMenuShortcut>⌘D</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            disabled={getConnectedEdges(id).length === 0}
            onClick={() => detachNodeConnections(id)}
          >
            <LinkBreak2Icon className="mr-2 h-4 w-4" />
            Detach connections
          </ContextMenuItem>
          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => deleteNode(id)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
            <ContextMenuShortcut>⌫</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </TooltipProvider>
  );
}
