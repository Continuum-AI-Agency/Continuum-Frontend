'use client';

import { Layers, Loader2, Plus, Redo2, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { LayerEditorLayer } from '../../types';
import {
  compositeLayers,
  loadLayerImages,
  measureSource,
} from '../../utils/layers/compositeLayers';
import { type Frame, writeFrame } from '../../utils/layers/frameModel';
import {
  canRedo,
  canUndo,
  initialHistory,
  type LayerDoc,
  type LayerDocAction,
  layerDocReducer,
} from '../../utils/layers/layerDocReducer';
import {
  type AlignEdge,
  alignLayers,
  createLayer,
  duplicateLayer,
  flipLayers,
  type LayerMove,
  moveLayer,
  nudgeLayers,
  removeLayers,
  reorderLayers,
  setLayer,
} from '../../utils/layers/layerOps';
import type { LayerSource } from '../../utils/layers/layerSources';
import { LayerInspector } from './LayerInspector';
import { LayerStage } from './LayerStage';
import { LayersPanel } from './LayersPanel';
import { useLayerEditorKeymap } from './useLayerEditorKeymap';

/**
 * The Layer Editor, in the full-screen dialog shape `TimelineEditorDialog` established.
 *
 * The node is a launcher; this is the editor. It owns the undo history (a `useReducer`
 * over the pure `layerDocReducer`) and hands the DOCUMENT back to the node on every
 * committed edit — history itself is dialog-scoped and deliberately not serialized.
 */

/** A drag settles well inside this; a committed edit is invisible at this delay. */
const PERSIST_DEBOUNCE_MS = 150;

export interface ComposeResult {
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
}

export interface LayerEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  frame: Frame;
  layers: readonly LayerEditorLayer[];
  /** Everything wired into the node's `image-in` pool. */
  sources: readonly LayerSource[];
  /** Persist a committed document back to the node. */
  onPersist: (doc: LayerDoc, aspectRatio: string) => void;
  /** Upload + mirror the composed still. Returns when the node data is written. */
  onCompose: (result: ComposeResult) => Promise<void>;
}

export function LayerEditorDialog({
  open,
  onOpenChange,
  frame,
  layers,
  sources,
  onPersist,
  onCompose,
}: LayerEditorDialogProps) {
  const [history, rawDispatch] = useReducer(
    layerDocReducer,
    { frame, layers: [...layers] },
    initialHistory,
  );

  /**
   * Has anything actually been edited since the document was seeded?
   *
   * `reset` produces a fresh `doc` identity, so without this an open-and-close with no
   * edit still wrote node data and triggered a whole-canvas autosave.
   */
  const dirtyRef = useRef(false);
  const dispatch = useCallback((action: LayerDocAction) => {
    dirtyRef.current = action.type !== 'reset';
    rawDispatch(action);
  }, []);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [composing, setComposing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const seededRef = useRef(false);

  const doc = history.present;
  const sourceByNodeId = useMemo(
    () => new Map(sources.map((source) => [source.nodeId, source])),
    [sources],
  );

  /** Layer id -> a displayable URL, resolved through the layer's upstream node. */
  const displayUrls = useMemo(() => {
    const urls = new Map<string, string>();
    for (const layer of doc.layers) {
      const ref = sourceByNodeId.get(layer.sourceNodeId)?.ref;
      if (ref) urls.set(layer.id, ref);
    }
    return urls;
  }, [doc.layers, sourceByNodeId]);

  // Reload from the node ONLY on the false->true edge of `open`. The node's data is the
  // document of record, but this dialog writes back to it — so depending on `layers`
  // here would reset the history on the dialog's own save and eat the edit that caused
  // it. `latestRef` is how the open handler reads current data without subscribing.
  const latestRef = useRef({ frame, layers });
  latestRef.current = { frame, layers };
  useEffect(() => {
    if (!open) {
      seededRef.current = false;
      return;
    }
    dispatch({
      type: 'reset',
      doc: { frame: latestRef.current.frame, layers: [...latestRef.current.layers] },
    });
    setSelectedIds([]);
  }, [open]);

  const commit = useCallback((next: LayerDoc) => dispatch({ type: 'commit', doc: next }), []);

  const commitLayers = useCallback(
    (next: LayerEditorLayer[]) => commit({ ...doc, layers: next }),
    [commit, doc],
  );

  const addSources = useCallback(
    async (wanted: readonly LayerSource[]) => {
      const placed: LayerEditorLayer[] = [];
      for (const source of wanted) {
        try {
          const size = await measureSource(source.ref);
          placed.push(
            createLayer({
              sourceNodeId: source.nodeId,
              name: source.name,
              sourceWidth: size.width,
              sourceHeight: size.height,
              sourceAssetId: source.assetId,
              sourceVersionId: source.assetVersionId,
              frame: doc.frame,
            }),
          );
        } catch {
          setProblem(`Could not read "${source.name}" — is its upstream node still connected?`);
        }
      }
      if (placed.length === 0) return;
      commitLayers([...doc.layers, ...placed]);
      setSelectedIds(placed.map((layer) => layer.id));
    },
    [commitLayers, doc.frame, doc.layers],
  );

  // Opening an empty editor onto a wired-up node places what is connected. Making the
  // user add each one by hand first would be a step with no decision in it.
  useEffect(() => {
    if (!open || seededRef.current) return;
    seededRef.current = true;
    if (layers.length === 0 && sources.length > 0) void addSources(sources);
  }, [open, layers.length, sources, addSources]);

  const selectedLayers = doc.layers.filter((layer) => selectedIds.includes(layer.id));
  const onlySelected = selectedLayers.length === 1 ? selectedLayers[0] : null;

  const onAlign = useCallback(
    (edge: AlignEdge) => commitLayers(alignLayers(doc.layers, selectedIds, edge, doc.frame)),
    [commitLayers, doc.frame, doc.layers, selectedIds],
  );

  const onOrder = useCallback(
    (move: LayerMove) => {
      if (selectedIds.length === 0) return;
      // Applied one at a time so a multi-selection keeps its internal order: sending
      // three layers to the back leaves them in the same sequence relative to each other.
      let next = doc.layers;
      const ordered = move === 'top' || move === 'up' ? selectedIds : [...selectedIds].reverse();
      for (const id of ordered) next = moveLayer(next, id, move);
      commitLayers(next);
    },
    [commitLayers, doc.layers, selectedIds],
  );

  /**
   * A scrub is a gesture, not a keystroke.
   *
   * `begin` once on the first sample, `preview` per sample, and the release only settles —
   * exactly the stage's drag shape, so dragging a layer 40px and scrubbing X by 40 cost
   * the same single undo step. A typed value takes the same path and settles on blur.
   */
  const scrubbingRef = useRef(false);

  const previewDoc = useCallback(
    (next: LayerDoc) => {
      if (!scrubbingRef.current) {
        scrubbingRef.current = true;
        dispatch({ type: 'begin' });
      }
      dispatch({ type: 'preview', doc: next });
    },
    [dispatch],
  );

  const settleDoc = useCallback(
    (next: LayerDoc) => {
      if (scrubbingRef.current) {
        scrubbingRef.current = false;
        dispatch({ type: 'preview', doc: next });
        return;
      }
      dispatch({ type: 'commit', doc: next });
    },
    [dispatch],
  );

  const framed = useCallback(
    (width: number, height: number): LayerDoc => ({
      ...doc,
      frame: writeFrame(width, height).frame,
    }),
    [doc],
  );

  /**
   * A patch reaches every SELECTED layer, not just the first one.
   *
   * Which is what makes opacity and blend mode settable on a multi-selection. The
   * geometry fields never take this path with more than one selected — the inspector
   * only renders Transform and Anchor for a single layer, because a shared X is not a
   * meaningful thing to type. Locked layers are skipped, as in every other geometric op.
   */
  const patched = useCallback(
    (patch: Partial<LayerEditorLayer>): LayerDoc => ({
      ...doc,
      layers: doc.layers.map((layer) =>
        selectedIds.includes(layer.id) && !layer.locked ? { ...layer, ...patch } : layer,
      ),
    }),
    [doc, selectedIds],
  );

  /**
   * A held arrow key is ONE gesture.
   *
   * The first press banks the document and every repeat only previews, so releasing the
   * key leaves a single undo step — the same `begin`/`preview` split the stage and the
   * inspector already use.
   */
  const nudgingRef = useRef(false);
  const onNudge = useCallback(
    (dx: number, dy: number, repeat: boolean) => {
      const next = { ...doc, layers: nudgeLayers(doc.layers, selectedIds, dx, dy) };
      if (repeat) {
        if (!nudgingRef.current) {
          nudgingRef.current = true;
          dispatch({ type: 'begin' });
        }
        dispatch({ type: 'preview', doc: next });
        return;
      }
      nudgingRef.current = false;
      dispatch({ type: 'commit', doc: next });
    },
    [dispatch, doc, selectedIds],
  );

  useLayerEditorKeymap({
    enabled: open,
    onNudge,
    onDuplicate: () => {
      if (!onlySelected) return;
      const next = duplicateLayer(doc.layers, onlySelected.id);
      const index = doc.layers.findIndex((layer) => layer.id === onlySelected.id);
      commitLayers(next);
      setSelectedIds([next[index + 1].id]);
    },
    onUndo: () => dispatch({ type: 'undo' }),
    onRedo: () => dispatch({ type: 'redo' }),
    onOrder,
    onDeleteSelected: () => {
      commitLayers(removeLayers(doc.layers, selectedIds));
      setSelectedIds([]);
    },
    onDeselect: () => setSelectedIds([]),
    onSelectAll: () => setSelectedIds(doc.layers.map((layer) => layer.id)),
  });

  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);

  /**
   * ONE persist path: whatever `present` settles on.
   *
   * Not inside `commit`, because a drag is `begin` + N `preview`s and never commits —
   * persisting only on commit would lose every drag. Debounced, because the alternative
   * is an `updateNodeData` per pointer sample, which re-renders the canvas node ~60
   * times a second for the length of the drag.
   *
   * A pending write is FLUSHED when the editor closes, never cleared. Clearing it is
   * what silently ate any edit made in the last 150 ms before close — release a drag,
   * hit Escape, lose the move. Same distinction, and same reason, as `useDebouncedSave`.
   */
  const pendingRef = useRef(false);
  const flushRef = useRef<() => void>(() => {});
  flushRef.current = () => {
    pendingRef.current = false;
    onPersist(doc, writeFrame(doc.frame.width, doc.frame.height).aspectRatio);
  };

  useEffect(() => {
    if (!open || !dirtyRef.current) return;
    pendingRef.current = true;
    const timer = setTimeout(() => flushRef.current(), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [doc, open]);

  // Close and unmount are the two ways the debounce above stops being re-armed. Both
  // have to settle it. The effect body covers close; the cleanup covers unmount, which
  // the canvas causes on its own by culling off-screen nodes.
  useEffect(() => {
    if (!open && pendingRef.current) flushRef.current();
    return () => {
      if (pendingRef.current) flushRef.current();
    };
  }, [open]);

  const compose = useCallback(async () => {
    setComposing(true);
    setProblem(null);
    try {
      const images = await loadLayerImages(displayUrls);
      const result = await compositeLayers({
        frame: doc.frame,
        layers: doc.layers,
        images,
      });
      if (result.missing.length > 0) {
        setProblem(
          `${result.missing.length} layer${result.missing.length === 1 ? '' : 's'} had no pixels and ${
            result.missing.length === 1 ? 'was' : 'were'
          } left out.`,
        );
      }
      const blob = await (await fetch(result.dataUrl)).blob();
      await onCompose({
        dataUrl: result.dataUrl,
        blob,
        width: result.width,
        height: result.height,
      });
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'The composition failed');
    } finally {
      setComposing(false);
    }
  }, [displayUrls, doc.frame, doc.layers, onCompose]);

  const unplaced = sources.filter(
    (source) => !doc.layers.some((layer) => layer.sourceNodeId === source.nodeId),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next, details) => {
        // Escape with layers selected clears the selection instead of throwing the whole
        // editor away. Decided here rather than in the keymap because Base UI's dismiss
        // listens on `document` and the keymap listens on `window` — the keymap is the
        // last thing to see the key and can never out-vote it. `cancel()` is Base UI's
        // own supported way to refuse.
        if (!next && details.reason === 'escape-key' && selectedIds.length > 0) {
          details.cancel();
          setSelectedIds([]);
          return;
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex h-[92vh] max-w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[96vw]">
        <TooltipProvider>
          <DialogHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/60 px-4 py-3 text-left">
            <div>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Layers className="h-4 w-4" /> Layer Editor
              </DialogTitle>
              <DialogDescription className="text-xs">
                Stack, place and blend stills into one composed image.
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              {/* A span, not a label: Base UI's Switch is a role="switch" button, not a
                  form control a <label for> can bind to. Its own aria-label is the
                  accessible name. */}
              <span className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                <Switch
                  checked={snapEnabled}
                  onCheckedChange={setSnapEnabled}
                  aria-label="Align to the frame and other layers"
                />
                Snap
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label="Undo"
                disabled={!canUndo(history)}
                onClick={undo}
              >
                <Undo2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label="Redo"
                disabled={!canRedo(history)}
                onClick={redo}
              >
                <Redo2 className="h-3.5 w-3.5" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={unplaced.length === 0}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" /> Add layer
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  {unplaced.map((source) => (
                    <DropdownMenuItem
                      key={source.nodeId}
                      className="text-2xs"
                      onSelect={() => void addSources([source])}
                    >
                      {source.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button type="button" size="sm" onClick={() => void compose()} disabled={composing}>
                {composing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                Compose
              </Button>
            </div>
          </DialogHeader>

          <div className="flex min-h-0 flex-1">
            <aside className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-border/60">
              <LayersPanel
                layers={doc.layers}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                onToggleVisible={(id) => {
                  const layer = doc.layers.find((candidate) => candidate.id === id);
                  if (layer) commitLayers(setLayer(doc.layers, id, { visible: !layer.visible }));
                }}
                onToggleLocked={(id) => {
                  const layer = doc.layers.find((candidate) => candidate.id === id);
                  if (layer) commitLayers(setLayer(doc.layers, id, { locked: !layer.locked }));
                }}
                onRename={(id, name) => commitLayers(setLayer(doc.layers, id, { name }))}
                onReorder={(from, to) => commitLayers(reorderLayers(doc.layers, from, to))}
                onOrder={(id, move) => commitLayers(moveLayer(doc.layers, id, move))}
              />
            </aside>

            <LayerStage
              frame={doc.frame}
              layers={doc.layers}
              sources={displayUrls}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              onBegin={() => dispatch({ type: 'begin' })}
              onPreview={(next) => dispatch({ type: 'preview', doc: { ...doc, layers: next } })}
              onCancel={() => dispatch({ type: 'cancel' })}
              snapEnabled={snapEnabled}
            />

            <aside className="w-64 shrink-0 overflow-y-auto border-l border-border/60">
              <LayerInspector
                frame={doc.frame}
                onFrameChange={(width, height) => previewDoc(framed(width, height))}
                onFrameCommit={(width, height) => settleDoc(framed(width, height))}
                layer={selectedLayers[0] ?? null}
                selectionCount={selectedLayers.length}
                onLayerChange={(patch) => previewDoc(patched(patch))}
                onLayerCommit={(patch) => settleDoc(patched(patch))}
                onAlign={onAlign}
                onOrder={onOrder}
                onFlip={(axis) => commitLayers(flipLayers(doc.layers, selectedIds, axis))}
              />
            </aside>
          </div>

          {problem ? (
            <p className="border-t border-border/60 bg-amber-500/10 px-4 py-2 text-2xs text-amber-700 dark:text-amber-300">
              {problem}
            </p>
          ) : null}
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}
