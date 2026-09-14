/**
 * Canvas outputs have two homes, and they are not the same write.
 *
 *   graph_durable      — bytes in storage, bucket+path on the node. Reload still
 *                        wires. No media.assets row. Default for action ops.
 *   library_registered — also a Library row (Canvas partition). Only when the
 *                        operator marked Keep, or the node is wired to a sink
 *                        that files into the Library (Export, API Render).
 *
 * Filing is opt-in. Persistence is not: a data-URL that dies on reload cannot
 * be wired, Keep or not.
 */
export const CANVAS_OUTPUT_FILING = ['graph_durable', 'library_registered'] as const;
export type CanvasOutputFiling = (typeof CANVAS_OUTPUT_FILING)[number];

/** Node types whose inbound edge means "this output belongs in the Library". */
export const CANVAS_LIBRARY_SINK_NODE_TYPES = ['export', 'apiRender'] as const;
export type CanvasLibrarySinkNodeType = (typeof CANVAS_LIBRARY_SINK_NODE_TYPES)[number];

export const CANVAS_OUTPUTS_COLLECTION_KEY = 'canvas_outputs';

export function isCanvasLibrarySinkNodeType(type: string): type is CanvasLibrarySinkNodeType {
  return (CANVAS_LIBRARY_SINK_NODE_TYPES as readonly string[]).includes(type);
}

export function canvasOutputFiling(input: {
  keep: boolean;
  wiredToLibrarySink: boolean;
}): CanvasOutputFiling {
  return input.keep || input.wiredToLibrarySink ? 'library_registered' : 'graph_durable';
}
