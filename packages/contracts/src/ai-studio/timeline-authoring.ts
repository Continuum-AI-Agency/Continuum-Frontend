import { z } from 'zod';
import { clipTransitionSchema } from './workflow-graph';

export const timelineSourceKindSchema = z.enum(['video', 'image', 'audio']);
export type TimelineSourceKind = z.infer<typeof timelineSourceKindSchema>;
const timelineVisualSourceKindSchema = z.enum(['video', 'image']);

export const timelineTransformSchema = z
  .object({
    scale: z.number().min(0.01).max(20).optional(),
    offsetX: z.number().min(-4).max(4).optional(),
    offsetY: z.number().min(-4).max(4).optional(),
    rotate: z.number().min(-3600).max(3600).optional(),
  })
  .passthrough();

export const timelineTextOverlaySchema = z
  .object({
    id: z.string().min(1),
    text: z.string().max(2_000),
    xFrac: z.number().min(-1).max(2).optional(),
    yFrac: z.number().min(-1).max(2).optional(),
    sizeFrac: z.number().min(0.005).max(1).optional(),
    color: z.string().max(100).optional(),
    background: z.string().max(100).optional(),
    fontWeight: z.number().int().min(100).max(900).optional(),
  })
  .passthrough();

export const timelineClipEffectsSchema = z
  .object({
    opacity: z.number().min(0).max(1).optional(),
    adjustments: z
      .object({
        brightness: z.number().min(0).max(8).optional(),
        contrast: z.number().min(0).max(8).optional(),
        saturation: z.number().min(0).max(8).optional(),
        grayscale: z.number().min(0).max(1).optional(),
        sepia: z.number().min(0).max(1).optional(),
        hueRotate: z.number().min(-3600).max(3600).optional(),
        blur: z.number().min(0).max(100).optional(),
        invert: z.number().min(0).max(1).optional(),
      })
      .passthrough()
      .optional(),
    filterPreset: z
      .enum(['none', 'bw', 'vintage', 'vivid', 'cool', 'warm', 'noir', 'dream'])
      .optional(),
    transform: timelineTransformSchema.optional(),
    flipH: z.boolean().optional(),
    flipV: z.boolean().optional(),
    blendMode: z
      .enum(['normal', 'multiply', 'screen', 'overlay', 'lighten', 'darken', 'difference'])
      .optional(),
    kenBurns: z
      .object({
        from: timelineTransformSchema,
        to: timelineTransformSchema,
      })
      .passthrough()
      .optional(),
    keyframes: z
      .array(
        z
          .object({
            t: z.number().min(0).max(1),
            transform: timelineTransformSchema.optional(),
          })
          .passthrough(),
      )
      .max(40)
      .optional(),
    speed: z.number().min(0.05).max(20).optional(),
    text: z.array(timelineTextOverlaySchema).max(20).optional(),
  })
  // Existing timelines may carry renderer fields added before this contract.
  // Preserve them while making the fields the agent can author strict and typed.
  .passthrough();
export type TimelineClipEffects = z.infer<typeof timelineClipEffectsSchema>;

export const timelineCaptionStyleSchema = z
  .object({
    textColor: z.string().max(100),
    highlightColor: z.string().max(100),
    outlineColor: z.string().max(100),
    fontFamily: z.string().max(200).optional(),
    fontSizeFrac: z.number().min(0.005).max(1).optional(),
    outlineWidthFrac: z.number().min(0).max(1).optional(),
    position: z
      .object({
        xFrac: z.number().min(-1).max(2),
        yFrac: z.number().min(-1).max(2),
      })
      .passthrough()
      .optional(),
    backgroundColor: z.string().max(100).optional(),
    backgroundOpacity: z.number().min(0).max(1).optional(),
  })
  .passthrough();
export type TimelineCaptionStyle = z.infer<typeof timelineCaptionStyleSchema>;

export const timelineCaptionWordSchema = z
  .object({
    text: z.string().max(500),
    startSec: z.number().nonnegative(),
    endSec: z.number().nonnegative(),
    emphasis: z.boolean().optional(),
  })
  .strict()
  .refine((word) => word.endSec >= word.startSec, {
    message: 'caption word endSec must be at or after startSec',
  });

export const timelineCaptionCueSchema = z
  .object({
    id: z.string().min(1),
    startSec: z.number().nonnegative(),
    endSec: z.number().positive(),
    words: z.array(timelineCaptionWordSchema).min(1).max(100),
    style: timelineCaptionStyleSchema.partial().optional(),
  })
  .strict()
  .refine((cue) => cue.endSec > cue.startSec, {
    message: 'caption cue endSec must be after startSec',
  });

export const timelineAuthoringItemSchema = z
  .object({
    id: z.string().min(1),
    order: z.number().int().nonnegative(),
    sourceNodeId: z.string().min(1),
    kind: timelineVisualSourceKindSchema.optional(),
    trimStartSec: z.number().nonnegative().optional(),
    trimEndSec: z.number().nonnegative().optional(),
    durationSec: z.number().positive().max(3_600).optional(),
    muteAudio: z.boolean().optional(),
    volume: z.number().min(0).max(4).optional(),
    audioFadeInSec: z.number().nonnegative().max(3_600).optional(),
    audioFadeOutSec: z.number().nonnegative().max(3_600).optional(),
    effects: timelineClipEffectsSchema.optional(),
    transition: clipTransitionSchema.optional(),
    startSec: z.number().nonnegative().optional(),
  })
  .strict();
export type TimelineAuthoringItem = z.infer<typeof timelineAuthoringItemSchema>;

export const timelineAuthoringTrackSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal('overlay'),
    items: z.array(timelineAuthoringItemSchema).max(80),
  })
  .strict();
export type TimelineAuthoringTrack = z.infer<typeof timelineAuthoringTrackSchema>;

export const timelineAuthoringAudioItemSchema = z
  .object({
    id: z.string().min(1),
    order: z.number().int().nonnegative(),
    sourceNodeId: z.string().min(1),
    kind: z.literal('audio'),
    startSec: z.number().nonnegative(),
    trimStartSec: z.number().nonnegative().optional(),
    trimEndSec: z.number().nonnegative().optional(),
    volume: z.number().min(0).max(4).optional(),
    audioFadeInSec: z.number().nonnegative().max(3_600).optional(),
    audioFadeOutSec: z.number().nonnegative().max(3_600).optional(),
  })
  .strict()
  .refine((item) => item.trimEndSec === undefined || item.trimEndSec > (item.trimStartSec ?? 0), {
    message: 'audio item trimEndSec must be after trimStartSec',
  });
export type TimelineAuthoringAudioItem = z.infer<typeof timelineAuthoringAudioItemSchema>;

export const timelineAuthoringAudioTrackSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal('audio'),
    items: z.array(timelineAuthoringAudioItemSchema).max(80),
  })
  .strict();
export type TimelineAuthoringAudioTrack = z.infer<typeof timelineAuthoringAudioTrackSchema>;

export const timelineAuthoringDocumentSchema = z
  .object({
    items: z.array(timelineAuthoringItemSchema).max(80),
    overlayTracks: z.array(timelineAuthoringTrackSchema).max(8).optional(),
    audioTracks: z.array(timelineAuthoringAudioTrackSchema).max(8).optional(),
    exportPresetId: z.string().min(1).max(100).optional(),
    markers: z.array(z.number().nonnegative()).max(200).optional(),
    captionsEnabled: z.boolean().optional(),
    captionCues: z.array(timelineCaptionCueSchema).max(500).optional(),
    captionWords: z.array(timelineCaptionWordSchema).max(10_000).optional(),
    captionStyle: timelineCaptionStyleSchema.optional(),
  })
  .strict();
export type TimelineAuthoringDocument = z.infer<typeof timelineAuthoringDocumentSchema>;

const itemIdSchema = z.string().min(1);

export const timelineEditOperationSchema = z.discriminatedUnion('op', [
  z
    .object({
      op: z.literal('place_source'),
      sourceNodeId: z.string().min(1),
      kind: timelineVisualSourceKindSchema,
      atIndex: z.number().int().nonnegative().optional(),
      clientRef: z.string().min(1).max(100).optional(),
    })
    .strict(),
  z.object({ op: z.literal('remove_item'), itemId: itemIdSchema }).strict(),
  z
    .object({
      op: z.literal('duplicate_item'),
      itemId: itemIdSchema,
      clientRef: z.string().min(1).max(100).optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal('reorder_item'),
      itemId: itemIdSchema,
      beforeItemId: itemIdSchema.optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal('split_item'),
      itemId: itemIdSchema,
      atOutputSec: z.number().positive(),
      clientRef: z.string().min(1).max(100).optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal('trim_item'),
      itemId: itemIdSchema,
      startSec: z.number().nonnegative().optional(),
      endSec: z.number().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal('set_still_duration'),
      itemId: itemIdSchema,
      durationSec: z.number().positive().max(3_600),
    })
    .strict(),
  z
    .object({
      op: z.literal('set_item_audio'),
      itemId: itemIdSchema,
      muteAudio: z.boolean().optional(),
      volume: z.number().min(0).max(4).optional(),
      fadeInSec: z.number().nonnegative().max(3_600).optional(),
      fadeOutSec: z.number().nonnegative().max(3_600).optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal('set_item_transition'),
      itemId: itemIdSchema,
      transition: clipTransitionSchema.nullable(),
    })
    .strict(),
  z
    .object({
      op: z.literal('set_item_effects'),
      itemId: itemIdSchema,
      effects: timelineClipEffectsSchema.nullable(),
    })
    .strict(),
  z.object({ op: z.literal('add_overlay_track'), trackId: z.string().min(1) }).strict(),
  z.object({ op: z.literal('remove_overlay_track'), trackId: z.string().min(1) }).strict(),
  z
    .object({
      op: z.literal('place_overlay'),
      trackId: z.string().min(1),
      sourceNodeId: z.string().min(1),
      kind: timelineVisualSourceKindSchema,
      startSec: z.number().nonnegative(),
      clientRef: z.string().min(1).max(100).optional(),
    })
    .strict(),
  z.object({ op: z.literal('add_audio_track'), trackId: z.string().min(1) }).strict(),
  z.object({ op: z.literal('remove_audio_track'), trackId: z.string().min(1) }).strict(),
  z
    .object({
      op: z.literal('place_audio'),
      trackId: z.string().min(1),
      sourceNodeId: z.string().min(1),
      startSec: z.number().nonnegative(),
      clientRef: z.string().min(1).max(100).optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal('move_audio'),
      itemId: itemIdSchema,
      trackId: z.string().min(1).optional(),
      startSec: z.number().nonnegative(),
    })
    .strict(),
  z
    .object({
      op: z.literal('trim_audio'),
      itemId: itemIdSchema,
      startSec: z.number().nonnegative().optional(),
      endSec: z.number().nonnegative().optional(),
    })
    .strict(),
  z.object({ op: z.literal('remove_audio'), itemId: itemIdSchema }).strict(),
  z
    .object({
      op: z.literal('set_audio'),
      itemId: itemIdSchema,
      volume: z.number().min(0).max(4).optional(),
      fadeInSec: z.number().nonnegative().max(3_600).optional(),
      fadeOutSec: z.number().nonnegative().max(3_600).optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal('move_overlay'),
      itemId: itemIdSchema,
      trackId: z.string().min(1).optional(),
      startSec: z.number().nonnegative(),
    })
    .strict(),
  z
    .object({
      op: z.literal('set_export_preset'),
      exportPresetId: z.string().min(1).max(100),
    })
    .strict(),
  z
    .object({
      op: z.literal('set_markers'),
      markers: z.array(z.number().nonnegative()).max(200),
    })
    .strict(),
  z
    .object({
      op: z.literal('set_captions'),
      enabled: z.boolean().optional(),
      cues: z.array(timelineCaptionCueSchema).max(500).optional(),
      words: z.array(timelineCaptionWordSchema).max(10_000).optional(),
      style: timelineCaptionStyleSchema.optional(),
    })
    .strict(),
]);
export type TimelineEditOperation = z.infer<typeof timelineEditOperationSchema>;

export const timelineEditBatchSchema = z
  .object({
    nodeId: z.string().min(1),
    expectedFingerprint: z.string().min(1),
    operations: z.array(timelineEditOperationSchema).min(1).max(40),
  })
  .strict();
export type TimelineEditBatch = z.infer<typeof timelineEditBatchSchema>;

export const timelineEditorPoolSourceSchema = z
  .object({
    nodeId: z.string().min(1),
    kind: timelineSourceKindSchema,
    label: z.string().min(1),
    assetId: z.string().optional(),
    durationSec: z.number().nonnegative().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).max(40).optional(),
    transcriptSegments: z
      .array(
        z
          .object({
            startMs: z.number().int().nonnegative(),
            endMs: z.number().int().nonnegative(),
            text: z.string().min(1),
          })
          .strict(),
      )
      .max(80)
      .optional(),
    videoSummary: z.string().optional(),
    thumbnailAvailable: z.boolean().optional(),
  })
  .strict();

export const timelineEditorInspectionSchema = z
  .object({
    nodeId: z.string().min(1),
    fingerprint: z.string().min(1),
    document: timelineAuthoringDocumentSchema,
    pool: z.array(timelineEditorPoolSourceSchema).max(80),
    committed: z.boolean(),
    renderStatus: z.string().optional(),
    warnings: z.array(z.string()).max(40),
    truncated: z
      .object({
        transcriptSegmentsOmitted: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type TimelineEditorInspection = z.infer<typeof timelineEditorInspectionSchema>;

export const canvasTimelineRenderRequestSchema = z
  .object({
    requestId: z.string().min(1),
    requestedFingerprint: z.string().min(1),
    requestedAt: z.string().datetime(),
    requestedByRunId: z.string().min(1).optional(),
    status: z.enum(['pending', 'accepted', 'completed', 'stale', 'error']),
    jobId: z.string().min(1).optional(),
    error: z.string().optional(),
  })
  .strict();
export type CanvasTimelineRenderRequest = z.infer<typeof canvasTimelineRenderRequestSchema>;

export const timelineRenderCommandSchema = z
  .object({
    nodeId: z.string().min(1),
    expectedFingerprint: z.string().min(1),
  })
  .strict();
export type TimelineRenderCommand = z.infer<typeof timelineRenderCommandSchema>;

export interface ApplyTimelineEditOptions {
  pooledSourceIds: ReadonlySet<string>;
  sourceDurations?: ReadonlyMap<string, number>;
  sourceKinds?: ReadonlyMap<string, TimelineSourceKind>;
  idFactory?: (kind: 'item' | 'track', operationIndex: number, sourceId?: string) => string;
}

export type ApplyTimelineEditResult =
  | {
      ok: true;
      document: TimelineAuthoringDocument;
      created: Record<string, string>;
      affectedItemIds: string[];
      invalidatesRender: boolean;
    }
  | { ok: false; document: TimelineAuthoringDocument; errors: string[] };

const MIN_CLIP_SEC = 0.1;

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

function compactHash(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0)
    .toString(16)
    .padStart(8, '0')}`;
}

export function timelineDocumentFingerprint(document: TimelineAuthoringDocument): string {
  return compactHash(stableStringify(document));
}

function normalizeOrder<Item extends { order: number }>(items: Item[]): Item[] {
  return items.map((item, order) => ({ ...item, order }));
}

function speedFor(item: TimelineAuthoringItem): number {
  const speed = item.effects?.speed;
  return typeof speed === 'number' && speed > 0 ? speed : 1;
}

function effectiveDuration(item: TimelineAuthoringItem, sourceDuration?: number): number {
  if (item.kind === 'image') return item.durationSec ?? 3;
  const start = item.trimStartSec ?? 0;
  const end = item.trimEndSec ?? sourceDuration ?? start + 3;
  return Math.max(MIN_CLIP_SEC, (end - start) / speedFor(item));
}

function findItem(
  document: TimelineAuthoringDocument,
  itemId: string,
): { item: TimelineAuthoringItem; trackId: 'base' | string } | null {
  const base = document.items.find((item) => item.id === itemId);
  if (base) return { item: base, trackId: 'base' };
  for (const track of document.overlayTracks ?? []) {
    const item = track.items.find((candidate) => candidate.id === itemId);
    if (item) return { item, trackId: track.id };
  }
  return null;
}

function updateLocatedItem(
  document: TimelineAuthoringDocument,
  itemId: string,
  update: (item: TimelineAuthoringItem) => TimelineAuthoringItem,
): TimelineAuthoringDocument {
  return {
    ...document,
    items: document.items.map((item) => (item.id === itemId ? update(item) : item)),
    overlayTracks: document.overlayTracks?.map((track) => ({
      ...track,
      items: track.items.map((item) => (item.id === itemId ? update(item) : item)),
    })),
  };
}

function findAudioItem(
  document: TimelineAuthoringDocument,
  itemId: string,
): { item: TimelineAuthoringAudioItem; trackId: string } | null {
  for (const track of document.audioTracks ?? []) {
    const item = track.items.find((candidate) => candidate.id === itemId);
    if (item) return { item, trackId: track.id };
  }
  return null;
}

function updateAudioItem(
  document: TimelineAuthoringDocument,
  itemId: string,
  update: (item: TimelineAuthoringAudioItem) => TimelineAuthoringAudioItem,
): TimelineAuthoringDocument {
  return {
    ...document,
    audioTracks: document.audioTracks?.map((track) => ({
      ...track,
      items: track.items.map((item) => (item.id === itemId ? update(item) : item)),
    })),
  };
}

function defaultIdFactory(
  kind: 'item' | 'track',
  operationIndex: number,
  sourceId?: string,
): string {
  return `agent:${kind}:${operationIndex}:${sourceId ?? 'new'}`;
}

export function applyTimelineEdits(
  input: TimelineAuthoringDocument,
  operations: TimelineEditOperation[],
  options: ApplyTimelineEditOptions,
): ApplyTimelineEditResult {
  const parsedDocument = timelineAuthoringDocumentSchema.safeParse(input);
  if (!parsedDocument.success) {
    return { ok: false, document: input, errors: ['The current timeline document is invalid.'] };
  }
  const parsedOperations = z.array(timelineEditOperationSchema).safeParse(operations);
  if (!parsedOperations.success) {
    return {
      ok: false,
      document: parsedDocument.data,
      errors: parsedOperations.error.issues.map((issue) => issue.message),
    };
  }

  const original = parsedDocument.data;
  let document = original;
  const errors: string[] = [];
  const created: Record<string, string> = {};
  const affected = new Set<string>();
  let invalidatesRender = false;
  const idFactory = options.idFactory ?? defaultIdFactory;
  const sourceDurations = options.sourceDurations ?? new Map<string, number>();
  const sourceKinds = options.sourceKinds;
  const resolveItemId = (itemId: string): string => created[itemId] ?? itemId;

  const requirePooled = (sourceNodeId: string): boolean => {
    if (options.pooledSourceIds.has(sourceNodeId)) return true;
    errors.push(`source "${sourceNodeId}" is not connected to the Video Editor media-in pool`);
    return false;
  };

  for (const [operationIndex, operation] of parsedOperations.data.entries()) {
    if (errors.length > 0) break;
    switch (operation.op) {
      case 'place_source': {
        if (!requirePooled(operation.sourceNodeId)) break;
        const id = idFactory('item', operationIndex, operation.sourceNodeId);
        const item: TimelineAuthoringItem = {
          id,
          order: document.items.length,
          sourceNodeId: operation.sourceNodeId,
          kind: operation.kind,
        };
        const items = [...document.items];
        const index = Math.min(operation.atIndex ?? items.length, items.length);
        items.splice(index, 0, item);
        document = { ...document, items: normalizeOrder(items) };
        if (operation.clientRef) created[operation.clientRef] = id;
        affected.add(id);
        invalidatesRender = true;
        break;
      }
      case 'remove_item': {
        const itemId = resolveItemId(operation.itemId);
        const located = findItem(document, itemId);
        if (!located) {
          errors.push(`timeline item "${operation.itemId}" was not found`);
          break;
        }
        document =
          located.trackId === 'base'
            ? {
                ...document,
                items: normalizeOrder(document.items.filter((item) => item.id !== itemId)),
              }
            : {
                ...document,
                overlayTracks: document.overlayTracks?.map((track) =>
                  track.id === located.trackId
                    ? {
                        ...track,
                        items: normalizeOrder(track.items.filter((item) => item.id !== itemId)),
                      }
                    : track,
                ),
              };
        affected.add(itemId);
        invalidatesRender = true;
        break;
      }
      case 'duplicate_item': {
        const itemId = resolveItemId(operation.itemId);
        const located = findItem(document, itemId);
        if (!located) {
          errors.push(`timeline item "${operation.itemId}" was not found`);
          break;
        }
        const id = idFactory('item', operationIndex, located.item.sourceNodeId);
        const copy = { ...located.item, id };
        if (located.trackId === 'base') {
          const index = document.items.findIndex((item) => item.id === itemId);
          const items = [...document.items];
          items.splice(index + 1, 0, copy);
          document = { ...document, items: normalizeOrder(items) };
        } else {
          document = {
            ...document,
            overlayTracks: document.overlayTracks?.map((track) => {
              if (track.id !== located.trackId) return track;
              const index = track.items.findIndex((item) => item.id === itemId);
              const items = [...track.items];
              items.splice(index + 1, 0, copy);
              return { ...track, items: normalizeOrder(items) };
            }),
          };
        }
        if (operation.clientRef) created[operation.clientRef] = id;
        affected.add(id);
        invalidatesRender = true;
        break;
      }
      case 'reorder_item': {
        const itemId = resolveItemId(operation.itemId);
        const beforeItemId =
          operation.beforeItemId === undefined ? undefined : resolveItemId(operation.beforeItemId);
        const from = document.items.findIndex((item) => item.id === itemId);
        if (from < 0) {
          errors.push(`base-track item "${operation.itemId}" was not found`);
          break;
        }
        const items = [...document.items];
        const [moved] = items.splice(from, 1);
        const target =
          beforeItemId === undefined
            ? items.length
            : items.findIndex((item) => item.id === beforeItemId);
        if (target < 0) {
          errors.push(`base-track item "${operation.beforeItemId}" was not found`);
          break;
        }
        items.splice(target, 0, moved);
        document = { ...document, items: normalizeOrder(items) };
        affected.add(itemId);
        invalidatesRender = true;
        break;
      }
      case 'split_item': {
        const itemId = resolveItemId(operation.itemId);
        const located = findItem(document, itemId);
        if (!located || located.trackId !== 'base') {
          errors.push(`base-track item "${operation.itemId}" was not found`);
          break;
        }
        const duration = effectiveDuration(
          located.item,
          sourceDurations.get(located.item.sourceNodeId),
        );
        if (
          operation.atOutputSec <= MIN_CLIP_SEC ||
          operation.atOutputSec >= duration - MIN_CLIP_SEC
        ) {
          errors.push(`split for "${operation.itemId}" must leave at least 0.1s on both sides`);
          break;
        }
        const id = idFactory('item', operationIndex, located.item.sourceNodeId);
        let first: TimelineAuthoringItem;
        let second: TimelineAuthoringItem;
        if (located.item.kind === 'image') {
          first = { ...located.item, durationSec: operation.atOutputSec };
          second = { ...located.item, id, durationSec: duration - operation.atOutputSec };
        } else {
          const speed = speedFor(located.item);
          const start = located.item.trimStartSec ?? 0;
          const end = located.item.trimEndSec ?? start + duration * speed;
          const splitAt = start + operation.atOutputSec * speed;
          first = { ...located.item, trimStartSec: start, trimEndSec: splitAt };
          second = { ...located.item, id, trimStartSec: splitAt, trimEndSec: end };
        }
        const index = document.items.findIndex((item) => item.id === itemId);
        const items = [...document.items];
        items.splice(index, 1, first, second);
        document = { ...document, items: normalizeOrder(items) };
        if (operation.clientRef) created[operation.clientRef] = id;
        affected.add(itemId);
        affected.add(id);
        invalidatesRender = true;
        break;
      }
      case 'trim_item': {
        const itemId = resolveItemId(operation.itemId);
        const located = findItem(document, itemId);
        if (!located || located.item.kind === 'image') {
          errors.push(`video item "${operation.itemId}" was not found`);
          break;
        }
        const duration = sourceDurations.get(located.item.sourceNodeId);
        const start = operation.startSec ?? located.item.trimStartSec ?? 0;
        const end =
          operation.endSec ?? located.item.trimEndSec ?? duration ?? Math.max(start + 3, 3);
        if (duration !== undefined && end > duration + 0.001) {
          errors.push(`trim end ${end}s exceeds source duration ${duration}s`);
          break;
        }
        if (end - start < MIN_CLIP_SEC) {
          errors.push(`trim for "${operation.itemId}" must be at least 0.1s`);
          break;
        }
        document = updateLocatedItem(document, itemId, (item) => ({
          ...item,
          trimStartSec: start,
          trimEndSec: end,
        }));
        affected.add(itemId);
        invalidatesRender = true;
        break;
      }
      case 'set_still_duration': {
        const itemId = resolveItemId(operation.itemId);
        const located = findItem(document, itemId);
        if (!located || located.item.kind !== 'image') {
          errors.push(`image item "${operation.itemId}" was not found`);
          break;
        }
        document = updateLocatedItem(document, itemId, (item) => ({
          ...item,
          durationSec: operation.durationSec,
        }));
        affected.add(itemId);
        invalidatesRender = true;
        break;
      }
      case 'set_item_audio': {
        const itemId = resolveItemId(operation.itemId);
        const located = findItem(document, itemId);
        if (!located || located.item.kind === 'image') {
          errors.push(`video item "${operation.itemId}" was not found`);
          break;
        }
        document = updateLocatedItem(document, itemId, (item) => ({
          ...item,
          ...(operation.muteAudio !== undefined ? { muteAudio: operation.muteAudio } : {}),
          ...(operation.volume !== undefined ? { volume: operation.volume } : {}),
          ...(operation.fadeInSec !== undefined ? { audioFadeInSec: operation.fadeInSec } : {}),
          ...(operation.fadeOutSec !== undefined ? { audioFadeOutSec: operation.fadeOutSec } : {}),
        }));
        affected.add(itemId);
        invalidatesRender = true;
        break;
      }
      case 'set_item_transition': {
        const itemId = resolveItemId(operation.itemId);
        if (!findItem(document, itemId)) {
          errors.push(`timeline item "${operation.itemId}" was not found`);
          break;
        }
        document = updateLocatedItem(document, itemId, (item) => ({
          ...item,
          transition: operation.transition ?? undefined,
        }));
        affected.add(itemId);
        invalidatesRender = true;
        break;
      }
      case 'set_item_effects': {
        const itemId = resolveItemId(operation.itemId);
        if (!findItem(document, itemId)) {
          errors.push(`timeline item "${operation.itemId}" was not found`);
          break;
        }
        document = updateLocatedItem(document, itemId, (item) => ({
          ...item,
          effects: operation.effects ?? undefined,
        }));
        affected.add(itemId);
        invalidatesRender = true;
        break;
      }
      case 'add_overlay_track': {
        if ((document.overlayTracks ?? []).some((track) => track.id === operation.trackId)) {
          errors.push(`overlay track "${operation.trackId}" already exists`);
          break;
        }
        document = {
          ...document,
          overlayTracks: [
            ...(document.overlayTracks ?? []),
            { id: operation.trackId, kind: 'overlay', items: [] },
          ],
        };
        break;
      }
      case 'remove_overlay_track': {
        if (!(document.overlayTracks ?? []).some((track) => track.id === operation.trackId)) {
          errors.push(`overlay track "${operation.trackId}" was not found`);
          break;
        }
        document = {
          ...document,
          overlayTracks: document.overlayTracks?.filter((track) => track.id !== operation.trackId),
        };
        invalidatesRender = true;
        break;
      }
      case 'place_overlay': {
        if (!requirePooled(operation.sourceNodeId)) break;
        const tracks = document.overlayTracks ?? [];
        if (!tracks.some((track) => track.id === operation.trackId)) {
          errors.push(`overlay track "${operation.trackId}" was not found`);
          break;
        }
        const id = idFactory('item', operationIndex, operation.sourceNodeId);
        document = {
          ...document,
          overlayTracks: tracks.map((track) =>
            track.id === operation.trackId
              ? {
                  ...track,
                  items: normalizeOrder([
                    ...track.items,
                    {
                      id,
                      order: track.items.length,
                      sourceNodeId: operation.sourceNodeId,
                      kind: operation.kind,
                      startSec: operation.startSec,
                      muteAudio: true,
                      effects: {
                        opacity: 1,
                        transform: { scale: 0.4, offsetX: 0.28, offsetY: -0.28 },
                      },
                    },
                  ]),
                }
              : track,
          ),
        };
        if (operation.clientRef) created[operation.clientRef] = id;
        affected.add(id);
        invalidatesRender = true;
        break;
      }
      case 'move_overlay': {
        const itemId = resolveItemId(operation.itemId);
        const located = findItem(document, itemId);
        if (!located || located.trackId === 'base') {
          errors.push(`overlay item "${operation.itemId}" was not found`);
          break;
        }
        const targetTrackId = operation.trackId ?? located.trackId;
        const tracks = document.overlayTracks ?? [];
        if (!tracks.some((track) => track.id === targetTrackId)) {
          errors.push(`overlay track "${targetTrackId}" was not found`);
          break;
        }
        const moved = { ...located.item, startSec: operation.startSec };
        document = {
          ...document,
          overlayTracks: tracks.map((track) => {
            const without = track.items.filter((item) => item.id !== itemId);
            return track.id === targetTrackId
              ? { ...track, items: normalizeOrder([...without, moved]) }
              : { ...track, items: normalizeOrder(without) };
          }),
        };
        affected.add(itemId);
        invalidatesRender = true;
        break;
      }
      case 'add_audio_track': {
        if ((document.audioTracks ?? []).some((track) => track.id === operation.trackId)) {
          errors.push(`audio track "${operation.trackId}" already exists`);
          break;
        }
        document = {
          ...document,
          audioTracks: [
            ...(document.audioTracks ?? []),
            { id: operation.trackId, kind: 'audio', items: [] },
          ],
        };
        break;
      }
      case 'remove_audio_track': {
        if (!(document.audioTracks ?? []).some((track) => track.id === operation.trackId)) {
          errors.push(`audio track "${operation.trackId}" was not found`);
          break;
        }
        document = {
          ...document,
          audioTracks: document.audioTracks?.filter((track) => track.id !== operation.trackId),
        };
        invalidatesRender = true;
        break;
      }
      case 'place_audio': {
        if (!requirePooled(operation.sourceNodeId)) break;
        if (
          sourceKinds?.has(operation.sourceNodeId) &&
          sourceKinds.get(operation.sourceNodeId) !== 'audio'
        ) {
          errors.push(`source "${operation.sourceNodeId}" is not an audio source`);
          break;
        }
        const tracks = document.audioTracks ?? [];
        if (!tracks.some((track) => track.id === operation.trackId)) {
          errors.push(`audio track "${operation.trackId}" was not found`);
          break;
        }
        const id = idFactory('item', operationIndex, operation.sourceNodeId);
        const duration = sourceDurations.get(operation.sourceNodeId);
        document = {
          ...document,
          audioTracks: tracks.map((track) =>
            track.id === operation.trackId
              ? {
                  ...track,
                  items: normalizeOrder([
                    ...track.items,
                    {
                      id,
                      order: track.items.length,
                      sourceNodeId: operation.sourceNodeId,
                      kind: 'audio' as const,
                      startSec: operation.startSec,
                      trimStartSec: 0,
                      ...(duration !== undefined && duration > 0 ? { trimEndSec: duration } : {}),
                      volume: 1,
                    },
                  ]),
                }
              : track,
          ),
        };
        if (operation.clientRef) created[operation.clientRef] = id;
        affected.add(id);
        invalidatesRender = true;
        break;
      }
      case 'move_audio': {
        const itemId = resolveItemId(operation.itemId);
        const located = findAudioItem(document, itemId);
        if (!located) {
          errors.push(`audio item "${operation.itemId}" was not found`);
          break;
        }
        const targetTrackId = operation.trackId ?? located.trackId;
        const tracks = document.audioTracks ?? [];
        if (!tracks.some((track) => track.id === targetTrackId)) {
          errors.push(`audio track "${targetTrackId}" was not found`);
          break;
        }
        const moved = { ...located.item, startSec: operation.startSec };
        document = {
          ...document,
          audioTracks: tracks.map((track) => {
            const without = track.items.filter((item) => item.id !== itemId);
            return track.id === targetTrackId
              ? { ...track, items: normalizeOrder([...without, moved]) }
              : { ...track, items: normalizeOrder(without) };
          }),
        };
        affected.add(itemId);
        invalidatesRender = true;
        break;
      }
      case 'trim_audio': {
        const itemId = resolveItemId(operation.itemId);
        const located = findAudioItem(document, itemId);
        if (!located) {
          errors.push(`audio item "${operation.itemId}" was not found`);
          break;
        }
        const duration = sourceDurations.get(located.item.sourceNodeId);
        const start = operation.startSec ?? located.item.trimStartSec ?? 0;
        const end =
          operation.endSec ?? located.item.trimEndSec ?? duration ?? Math.max(start + 3, 3);
        if (duration !== undefined && end > duration + 0.001) {
          errors.push(`audio trim end ${end}s exceeds source duration ${duration}s`);
          break;
        }
        if (end - start < MIN_CLIP_SEC) {
          errors.push(`audio trim for "${operation.itemId}" must be at least 0.1s`);
          break;
        }
        document = updateAudioItem(document, itemId, (item) => ({
          ...item,
          trimStartSec: start,
          trimEndSec: end,
        }));
        affected.add(itemId);
        invalidatesRender = true;
        break;
      }
      case 'remove_audio': {
        const itemId = resolveItemId(operation.itemId);
        if (!findAudioItem(document, itemId)) {
          errors.push(`audio item "${operation.itemId}" was not found`);
          break;
        }
        document = {
          ...document,
          audioTracks: document.audioTracks?.map((track) => ({
            ...track,
            items: normalizeOrder(track.items.filter((item) => item.id !== itemId)),
          })),
        };
        affected.add(itemId);
        invalidatesRender = true;
        break;
      }
      case 'set_audio': {
        const itemId = resolveItemId(operation.itemId);
        if (!findAudioItem(document, itemId)) {
          errors.push(`audio item "${operation.itemId}" was not found`);
          break;
        }
        document = updateAudioItem(document, itemId, (item) => ({
          ...item,
          ...(operation.volume !== undefined ? { volume: operation.volume } : {}),
          ...(operation.fadeInSec !== undefined ? { audioFadeInSec: operation.fadeInSec } : {}),
          ...(operation.fadeOutSec !== undefined ? { audioFadeOutSec: operation.fadeOutSec } : {}),
        }));
        affected.add(itemId);
        invalidatesRender = true;
        break;
      }
      case 'set_export_preset':
        document = { ...document, exportPresetId: operation.exportPresetId };
        invalidatesRender = true;
        break;
      case 'set_markers':
        document = { ...document, markers: [...operation.markers].sort((a, b) => a - b) };
        break;
      case 'set_captions':
        document = {
          ...document,
          ...(operation.enabled !== undefined ? { captionsEnabled: operation.enabled } : {}),
          ...(operation.cues !== undefined ? { captionCues: operation.cues } : {}),
          ...(operation.words !== undefined ? { captionWords: operation.words } : {}),
          ...(operation.style !== undefined ? { captionStyle: operation.style } : {}),
        };
        invalidatesRender = true;
        break;
    }
  }

  if (errors.length > 0) return { ok: false, document: original, errors };
  const validated = timelineAuthoringDocumentSchema.safeParse(document);
  if (!validated.success) {
    return {
      ok: false,
      document: original,
      errors: validated.error.issues.map((issue) => issue.message),
    };
  }
  return {
    ok: true,
    document: validated.data,
    created,
    affectedItemIds: [...affected],
    invalidatesRender,
  };
}
