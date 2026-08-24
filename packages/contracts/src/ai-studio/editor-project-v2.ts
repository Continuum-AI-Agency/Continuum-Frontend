import { z } from 'zod';

const editorIdSchema = z.string().min(1).max(200);
const editorLabelSchema = z.string().min(1).max(500);
const secondsSchema = z.number().finite().nonnegative().max(86_400);
const positiveSecondsSchema = z.number().finite().positive().max(86_400);
const revisionNumberSchema = z.number().int().nonnegative();
const unitIntervalSchema = z.number().finite().min(0).max(1);
const signedUnitSchema = z.number().finite().min(-1).max(1);
const colorSchema = z.string().min(1).max(100);

export const editorActorRefSchema = z
  .object({
    actorId: editorIdSchema,
    actorType: z.enum(['user', 'agent', 'system']),
    displayName: z.string().min(1).max(200).optional(),
  })
  .strict();
export type EditorActorRef = z.infer<typeof editorActorRefSchema>;

export const editorFrameRateSchema = z
  .object({
    numerator: z.number().int().positive().max(240_000),
    denominator: z.number().int().positive().max(10_000),
  })
  .strict();
export type EditorFrameRate = z.infer<typeof editorFrameRateSchema>;

export const editorCanvasSchema = z
  .object({
    width: z.number().int().positive().max(16_384),
    height: z.number().int().positive().max(16_384),
    pixelAspectRatio: z.number().finite().positive().max(10).default(1),
    backgroundColor: colorSchema.default('#000000'),
  })
  .strict();
export type EditorCanvas = z.infer<typeof editorCanvasSchema>;

export const editorMediaSourceRefSchema = z.discriminatedUnion('sourceType', [
  z
    .object({
      sourceType: z.literal('canvas_node'),
      nodeId: editorIdSchema,
      assetId: editorIdSchema.optional(),
      renditionId: editorIdSchema.optional(),
    })
    .strict(),
  z
    .object({
      sourceType: z.literal('library_asset'),
      assetId: editorIdSchema,
      renditionId: editorIdSchema.optional(),
    })
    .strict(),
  z
    .object({
      sourceType: z.literal('upload'),
      uploadId: editorIdSchema,
      fileName: z.string().min(1).max(500),
    })
    .strict(),
  z
    .object({
      sourceType: z.literal('generated_asset'),
      generationId: editorIdSchema,
      assetId: editorIdSchema.optional(),
      sourceNodeId: editorIdSchema.optional(),
    })
    .strict(),
  z
    .object({
      sourceType: z.literal('external_url'),
      url: z.string().url().max(4_096),
      cacheKey: editorIdSchema.optional(),
    })
    .strict(),
]);
export type EditorMediaSourceRef = z.infer<typeof editorMediaSourceRefSchema>;

export const editorTransformSchema = z
  .object({
    position: z
      .object({
        x: z.number().finite().min(-8).max(8),
        y: z.number().finite().min(-8).max(8),
        unit: z.literal('normalized'),
      })
      .strict()
      .default({ x: 0.5, y: 0.5, unit: 'normalized' }),
    scaleX: z.number().finite().min(-20).max(20).default(1),
    scaleY: z.number().finite().min(-20).max(20).default(1),
    rotationDeg: z.number().finite().min(-36_000).max(36_000).default(0),
    anchorX: z.number().finite().min(-4).max(4).default(0.5),
    anchorY: z.number().finite().min(-4).max(4).default(0.5),
    opacity: unitIntervalSchema.default(1),
  })
  .strict();
export type EditorTransform = z.infer<typeof editorTransformSchema>;
const defaultEditorTransform: EditorTransform = {
  position: { x: 0.5, y: 0.5, unit: 'normalized' },
  scaleX: 1,
  scaleY: 1,
  rotationDeg: 0,
  anchorX: 0.5,
  anchorY: 0.5,
  opacity: 1,
};

export const editorCropSchema = z
  .object({
    left: unitIntervalSchema.default(0),
    top: unitIntervalSchema.default(0),
    right: unitIntervalSchema.default(0),
    bottom: unitIntervalSchema.default(0),
  })
  .strict()
  .refine((crop) => crop.left + crop.right < 1 && crop.top + crop.bottom < 1, {
    message: 'crop edges must leave a visible region',
  });
export type EditorCrop = z.infer<typeof editorCropSchema>;
const defaultEditorCrop: EditorCrop = { left: 0, top: 0, right: 0, bottom: 0 };

export const editorParameterValueSchema = z.union([
  z.string().max(2_000),
  z.number().finite(),
  z.boolean(),
  z.array(z.number().finite()).max(16),
  z.array(z.string().max(500)).max(16),
]);
export type EditorParameterValue = z.infer<typeof editorParameterValueSchema>;

export const editorKeyframeValueSchema = z.union([
  z.string().max(2_000),
  z.number().finite(),
  z.boolean(),
  z
    .object({
      x: z.number().finite(),
      y: z.number().finite(),
    })
    .strict(),
  z
    .object({
      r: z.number().int().min(0).max(255),
      g: z.number().int().min(0).max(255),
      b: z.number().int().min(0).max(255),
      a: unitIntervalSchema,
    })
    .strict(),
]);
export type EditorKeyframeValue = z.infer<typeof editorKeyframeValueSchema>;

export const editorKeyframeSchema = z
  .object({
    id: editorIdSchema,
    property: z.enum([
      'transform.position',
      'transform.scaleX',
      'transform.scaleY',
      'transform.rotationDeg',
      'transform.opacity',
      'audio.volume',
      'audio.pan',
      'effect.parameter',
      'text.tracking',
      'text.fontSize',
    ]),
    parameterName: z.string().min(1).max(200).optional(),
    timeSec: secondsSchema,
    value: editorKeyframeValueSchema,
    interpolation: z.enum(['hold', 'linear', 'bezier']),
    easing: z
      .object({
        x1: unitIntervalSchema,
        y1: z.number().finite().min(-4).max(4),
        x2: unitIntervalSchema,
        y2: z.number().finite().min(-4).max(4),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((keyframe, context) => {
    if (keyframe.interpolation === 'bezier' && keyframe.easing === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['easing'],
        message: 'bezier keyframes require easing control points',
      });
    }
    if (keyframe.property === 'effect.parameter' && keyframe.parameterName === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['parameterName'],
        message: 'effect.parameter keyframes require parameterName',
      });
    }
  });
export type EditorKeyframe = z.infer<typeof editorKeyframeSchema>;

export const editorEffectInstanceSchema = z
  .object({
    id: editorIdSchema,
    effectType: z.enum([
      'video_filter',
      'color_adjustment',
      'blur',
      'stabilize',
      'chroma_key',
      'background_removal',
      'beauty',
      'audio_filter',
      'audio_cleanup',
      'custom',
    ]),
    effectId: editorIdSchema,
    enabled: z.boolean().default(true),
    mix: unitIntervalSchema.default(1),
    parameters: z.record(z.string().min(1).max(200), editorParameterValueSchema).default({}),
  })
  .strict();
export type EditorEffectInstance = z.infer<typeof editorEffectInstanceSchema>;

const editorClipBaseShape = {
  id: editorIdSchema,
  name: z.string().min(1).max(500).optional(),
  timelineStartSec: secondsSchema,
  durationSec: positiveSecondsSchema,
  enabled: z.boolean().default(true),
  locked: z.boolean().default(false),
  tags: z.array(z.string().min(1).max(100)).max(40).default([]),
};

export const editorVideoClipSchema = z
  .object({
    ...editorClipBaseShape,
    kind: z.literal('video'),
    source: editorMediaSourceRefSchema,
    sourceInSec: secondsSchema.default(0),
    playbackRate: z.number().finite().min(0.05).max(20).default(1),
    reverse: z.boolean().default(false),
    transform: editorTransformSchema.default(defaultEditorTransform),
    crop: editorCropSchema.default(defaultEditorCrop),
    blendMode: z
      .enum(['normal', 'multiply', 'screen', 'overlay', 'lighten', 'darken', 'difference'])
      .default('normal'),
    audioEnabled: z.boolean().default(true),
    effects: z.array(editorEffectInstanceSchema).max(50).default([]),
    keyframes: z.array(editorKeyframeSchema).max(500).default([]),
  })
  .strict();
export type EditorVideoClip = z.infer<typeof editorVideoClipSchema>;

export const editorAudioClipSchema = z
  .object({
    ...editorClipBaseShape,
    kind: z.literal('audio'),
    source: editorMediaSourceRefSchema,
    sourceInSec: secondsSchema.default(0),
    playbackRate: z.number().finite().min(0.05).max(20).default(1),
    reverse: z.boolean().default(false),
    volume: z.number().finite().min(0).max(4).default(1),
    pan: signedUnitSchema.default(0),
    muted: z.boolean().default(false),
    fadeInSec: secondsSchema.default(0),
    fadeOutSec: secondsSchema.default(0),
    effects: z.array(editorEffectInstanceSchema).max(50).default([]),
    keyframes: z.array(editorKeyframeSchema).max(500).default([]),
  })
  .strict()
  .refine((clip) => clip.fadeInSec <= clip.durationSec && clip.fadeOutSec <= clip.durationSec, {
    message: 'audio fades cannot exceed clip duration',
  });
export type EditorAudioClip = z.infer<typeof editorAudioClipSchema>;

export const editorOverlayClipSchema = z
  .object({
    ...editorClipBaseShape,
    kind: z.literal('overlay'),
    source: editorMediaSourceRefSchema,
    mediaKind: z.enum(['video', 'image', 'graphic']),
    sourceInSec: secondsSchema.optional(),
    transform: editorTransformSchema.default(defaultEditorTransform),
    crop: editorCropSchema.default(defaultEditorCrop),
    blendMode: z
      .enum(['normal', 'multiply', 'screen', 'overlay', 'lighten', 'darken', 'difference'])
      .default('normal'),
    effects: z.array(editorEffectInstanceSchema).max(50).default([]),
    keyframes: z.array(editorKeyframeSchema).max(500).default([]),
  })
  .strict();
export type EditorOverlayClip = z.infer<typeof editorOverlayClipSchema>;

export const editorTextStyleSchema = z
  .object({
    fontFamily: z.string().min(1).max(300),
    fontSizePx: z.number().finite().positive().max(2_000),
    fontWeight: z.number().int().min(100).max(900),
    italic: z.boolean().default(false),
    underline: z.boolean().default(false),
    alignment: z.enum(['left', 'center', 'right', 'justify']).default('center'),
    color: colorSchema,
    backgroundColor: colorSchema.optional(),
    outlineColor: colorSchema.optional(),
    outlineWidthPx: z.number().finite().nonnegative().max(100).default(0),
    shadowColor: colorSchema.optional(),
    shadowBlurPx: z.number().finite().nonnegative().max(200).default(0),
    lineHeight: z.number().finite().positive().max(10).default(1.2),
    trackingEm: z.number().finite().min(-2).max(10).default(0),
  })
  .strict();
export type EditorTextStyle = z.infer<typeof editorTextStyleSchema>;

export const editorTextClipSchema = z
  .object({
    ...editorClipBaseShape,
    kind: z.literal('text'),
    text: z.string().min(1).max(20_000),
    style: editorTextStyleSchema,
    transform: editorTransformSchema.default(defaultEditorTransform),
    animationIn: editorIdSchema.optional(),
    animationOut: editorIdSchema.optional(),
    effects: z.array(editorEffectInstanceSchema).max(50).default([]),
    keyframes: z.array(editorKeyframeSchema).max(500).default([]),
  })
  .strict();
export type EditorTextClip = z.infer<typeof editorTextClipSchema>;

export const editorCaptionWordSchema = z
  .object({
    text: z.string().min(1).max(500),
    startSec: secondsSchema,
    endSec: secondsSchema,
    confidence: unitIntervalSchema.optional(),
    speakerId: editorIdSchema.optional(),
    emphasis: z.boolean().optional(),
  })
  .strict()
  .refine((word) => word.endSec >= word.startSec, {
    message: 'caption word endSec must be at or after startSec',
  });
export type EditorCaptionWord = z.infer<typeof editorCaptionWordSchema>;

export const editorCaptionClipSchema = z
  .object({
    ...editorClipBaseShape,
    kind: z.literal('caption'),
    text: z.string().min(1).max(5_000),
    language: z.string().min(2).max(35),
    speakerId: editorIdSchema.optional(),
    words: z.array(editorCaptionWordSchema).max(200).default([]),
    style: editorTextStyleSchema,
    transform: editorTransformSchema.default(defaultEditorTransform),
    highlightMode: z.enum(['none', 'word', 'karaoke']).default('none'),
  })
  .strict();
export type EditorCaptionClip = z.infer<typeof editorCaptionClipSchema>;

export const editorEffectClipSchema = z
  .object({
    ...editorClipBaseShape,
    kind: z.literal('effect'),
    effect: editorEffectInstanceSchema,
    targetTrackIds: z.array(editorIdSchema).max(100).default([]),
    targetClipIds: z.array(editorIdSchema).max(500).default([]),
    keyframes: z.array(editorKeyframeSchema).max(500).default([]),
  })
  .strict();
export type EditorEffectClip = z.infer<typeof editorEffectClipSchema>;

export const editorNestedSequenceClipSchema = z
  .object({
    ...editorClipBaseShape,
    kind: z.literal('nested_sequence'),
    projectId: editorIdSchema,
    sequenceId: editorIdSchema,
    sourceRevision: revisionNumberSchema,
    sourceInSec: secondsSchema.default(0),
    playbackRate: z.number().finite().min(0.05).max(20).default(1),
    transform: editorTransformSchema.default(defaultEditorTransform),
    audioEnabled: z.boolean().default(true),
    keyframes: z.array(editorKeyframeSchema).max(500).default([]),
  })
  .strict();
export type EditorNestedSequenceClip = z.infer<typeof editorNestedSequenceClipSchema>;

export const editorClipSchema = z.discriminatedUnion('kind', [
  editorVideoClipSchema,
  editorAudioClipSchema,
  editorOverlayClipSchema,
  editorCaptionClipSchema,
  editorTextClipSchema,
  editorEffectClipSchema,
  editorNestedSequenceClipSchema,
]);
export type EditorClip = z.infer<typeof editorClipSchema>;

const editorTrackBaseShape = {
  id: editorIdSchema,
  name: editorLabelSchema,
  order: z.number().int().nonnegative(),
  enabled: z.boolean().default(true),
  locked: z.boolean().default(false),
  muted: z.boolean().default(false),
  solo: z.boolean().default(false),
};

export const editorVideoTrackSchema = z
  .object({
    ...editorTrackBaseShape,
    kind: z.literal('video'),
    clips: z.array(editorVideoClipSchema).max(2_000),
  })
  .strict();
export const editorAudioTrackSchema = z
  .object({
    ...editorTrackBaseShape,
    kind: z.literal('audio'),
    clips: z.array(editorAudioClipSchema).max(2_000),
  })
  .strict();
export const editorOverlayTrackSchema = z
  .object({
    ...editorTrackBaseShape,
    kind: z.literal('overlay'),
    clips: z.array(editorOverlayClipSchema).max(2_000),
  })
  .strict();
export const editorCaptionTrackSchema = z
  .object({
    ...editorTrackBaseShape,
    kind: z.literal('caption'),
    clips: z.array(editorCaptionClipSchema).max(10_000),
  })
  .strict();
export const editorTextTrackSchema = z
  .object({
    ...editorTrackBaseShape,
    kind: z.literal('text'),
    clips: z.array(editorTextClipSchema).max(2_000),
  })
  .strict();
export const editorEffectTrackSchema = z
  .object({
    ...editorTrackBaseShape,
    kind: z.literal('effect'),
    clips: z.array(editorEffectClipSchema).max(2_000),
  })
  .strict();
export const editorNestedSequenceTrackSchema = z
  .object({
    ...editorTrackBaseShape,
    kind: z.literal('nested_sequence'),
    clips: z.array(editorNestedSequenceClipSchema).max(2_000),
  })
  .strict();

export const editorTrackSchema = z.discriminatedUnion('kind', [
  editorVideoTrackSchema,
  editorAudioTrackSchema,
  editorOverlayTrackSchema,
  editorCaptionTrackSchema,
  editorTextTrackSchema,
  editorEffectTrackSchema,
  editorNestedSequenceTrackSchema,
]);
export type EditorTrack = z.infer<typeof editorTrackSchema>;

export const editorTransitionSchema = z
  .object({
    id: editorIdSchema,
    trackId: editorIdSchema,
    fromClipId: editorIdSchema,
    toClipId: editorIdSchema,
    transitionType: z.enum([
      'cut',
      'crossfade',
      'dip_to_black',
      'dip_to_white',
      'wipe',
      'slide',
      'zoom',
      'blur',
      'custom',
    ]),
    transitionId: editorIdSchema.optional(),
    durationSec: positiveSecondsSchema,
    alignment: z.enum(['before_cut', 'centered', 'after_cut']).default('centered'),
    parameters: z.record(z.string().min(1).max(200), editorParameterValueSchema).default({}),
  })
  .strict()
  .refine((transition) => transition.fromClipId !== transition.toClipId, {
    message: 'transition clips must be different',
  });
export type EditorTransition = z.infer<typeof editorTransitionSchema>;

export const editorExportSettingsSchema = z
  .object({
    presetId: editorIdSchema.optional(),
    width: z.number().int().positive().max(16_384),
    height: z.number().int().positive().max(16_384),
    frameRate: editorFrameRateSchema,
    format: z.enum(['mp4', 'mov', 'webm']),
    videoCodec: z.enum(['h264', 'hevc', 'vp9', 'av1']),
    videoBitrateKbps: z.number().int().positive().max(1_000_000),
    audioCodec: z.enum(['aac', 'opus', 'pcm']),
    audioBitrateKbps: z.number().int().positive().max(10_000),
    sampleRateHz: z.number().int().min(8_000).max(192_000),
    colorSpace: z.enum(['srgb', 'rec709', 'display_p3', 'rec2020']),
    alpha: z.boolean().default(false),
    captionMode: z.enum(['none', 'burn_in', 'sidecar']).default('none'),
    quality: z.enum(['draft', 'standard', 'high', 'master']).default('high'),
  })
  .strict();
export type EditorExportSettings = z.infer<typeof editorExportSettingsSchema>;

export const editorTimelineSnapshotSchema = z
  .object({
    sourceRevision: revisionNumberSchema,
    sourceFingerprint: z.string().min(1).max(500),
    durationSec: secondsSchema,
    tracks: z.array(editorTrackSchema).max(200),
    transitions: z.array(editorTransitionSchema).max(2_000),
  })
  .strict();
export type EditorTimelineSnapshot = z.infer<typeof editorTimelineSnapshotSchema>;

export const editorProductionStageSchema = z.enum([
  'style_draft',
  'style_approval',
  'frame_generation',
  'frame_approval',
  'motion_generation',
  'motion_approval',
  'master_generation',
  'master_approval',
  'assembly',
  'ready_to_render',
  'rendering',
  'complete',
  'failed',
]);
export type EditorProductionStage = z.infer<typeof editorProductionStageSchema>;

export const editorPinnedAssetRefSchema = z
  .object({
    assetId: editorIdSchema,
    versionId: editorIdSchema,
  })
  .strict();
export type EditorPinnedAssetRef = z.infer<typeof editorPinnedAssetRefSchema>;

export const editorProductionReferenceSchema = z
  .object({
    id: editorIdSchema,
    role: z.enum(['style', 'character', 'location', 'product', 'score', 'ambience']),
    asset: editorPinnedAssetRefSchema,
    label: z.string().min(1).max(500).optional(),
  })
  .strict();
export type EditorProductionReference = z.infer<typeof editorProductionReferenceSchema>;

export const editorStyleFacetsSchema = z
  .object({
    lens: z.string().min(1).max(1_000),
    lighting: z.string().min(1).max(1_000),
    palette: z.string().min(1).max(1_000),
    texture: z.string().min(1).max(1_000),
    contrast: z.string().min(1).max(1_000),
    blocking: z.string().min(1).max(1_000),
    atmosphere: z.string().min(1).max(1_000),
    eraMarkers: z.string().min(1).max(1_000).optional(),
  })
  .strict();

export const editorStyleContractSchema = z
  .object({
    status: z.enum(['draft', 'approved']),
    lockedText: z.string().min(1).max(4_000),
    facets: editorStyleFacetsSchema,
    sourceReferenceIds: z.array(editorIdSchema).max(10),
    approvedBy: editorActorRefSchema.optional(),
    approvedAt: z.string().datetime().optional(),
    approvedRevision: revisionNumberSchema.optional(),
  })
  .strict()
  .superRefine((contract, context) => {
    const hasApproval =
      contract.approvedBy !== undefined ||
      contract.approvedAt !== undefined ||
      contract.approvedRevision !== undefined;
    if (contract.status === 'approved' && !hasApproval) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['approvedBy'],
        message: 'approved style contracts require approval metadata',
      });
    }
    if (contract.status === 'draft' && hasApproval) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['status'],
        message: 'draft style contracts cannot include approval metadata',
      });
    }
    if (contract.approvedBy?.actorType === 'agent') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['approvedBy', 'actorType'],
        message: 'agents cannot approve style contracts',
      });
    }
  });
export type EditorStyleContract = z.infer<typeof editorStyleContractSchema>;

export const editorTakeSchema = z
  .object({
    id: editorIdSchema,
    kind: z.enum(['frame', 'motion_draft', 'motion_master']),
    status: z.enum(['pending', 'generating', 'ready', 'failed', 'stale']),
    verdict: z.enum(['undecided', 'approved', 'rejected']),
    prompt: z.string().min(1).max(20_000),
    model: z.string().min(1).max(200),
    settings: z.record(z.string().min(1).max(200), editorParameterValueSchema).default({}),
    parentTakeId: editorIdSchema.optional(),
    changedVariable: z.enum(['camera', 'lighting', 'speed', 'event_timing']).optional(),
    jobId: editorIdSchema.optional(),
    asset: editorPinnedAssetRefSchema.optional(),
    error: z.string().min(1).max(2_000).optional(),
    createdAt: z.string().datetime(),
    createdBy: editorActorRefSchema,
    reviewedAt: z.string().datetime().optional(),
    reviewedBy: editorActorRefSchema.optional(),
    reviewNote: z.string().min(1).max(2_000).optional(),
  })
  .strict()
  .superRefine((take, context) => {
    if (take.status === 'ready' && take.asset === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['asset'],
        message: 'ready takes require a pinned Library asset',
      });
    }
    if (take.status === 'failed' && take.error === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['error'],
        message: 'failed takes require an error',
      });
    }
    if (take.verdict !== 'undecided' && take.reviewedBy?.actorType !== 'user') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reviewedBy'],
        message: 'take verdicts require a human reviewer',
      });
    }
  });
export type EditorTake = z.infer<typeof editorTakeSchema>;

export const editorShotSchema = z
  .object({
    id: editorIdSchema,
    order: z.number().int().nonnegative(),
    title: z.string().min(1).max(500),
    brief: z.string().min(1).max(4_000),
    spokenLine: z.string().max(4_000).optional(),
    subjectAction: z.string().min(1).max(2_000),
    cameraMove: z.string().min(1).max(2_000),
    inSceneEvent: z.string().min(1).max(2_000),
    continuity: z.string().max(2_000).optional(),
    targetDurationSec: z.union([z.literal(4), z.literal(6), z.literal(8)]),
    referenceIds: z.array(editorIdSchema).max(20).default([]),
    takes: z.array(editorTakeSchema).max(100),
    selection: z
      .object({
        frameTakeId: editorIdSchema.optional(),
        motionDraftTakeId: editorIdSchema.optional(),
        motionMasterTakeId: editorIdSchema.optional(),
      })
      .strict()
      .default({}),
  })
  .strict()
  .superRefine((shot, context) => {
    const takeById = new Map(shot.takes.map((take) => [take.id, take]));
    const expectedKinds = [
      ['frameTakeId', 'frame'],
      ['motionDraftTakeId', 'motion_draft'],
      ['motionMasterTakeId', 'motion_master'],
    ] as const;
    for (const [field, kind] of expectedKinds) {
      const selectedId = shot.selection[field];
      if (!selectedId) continue;
      const take = takeById.get(selectedId);
      if (!take || take.kind !== kind || take.verdict !== 'approved') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['selection', field],
          message: `selected ${kind} take must exist and be approved`,
        });
      }
    }
  });
export type EditorShot = z.infer<typeof editorShotSchema>;

export const editorProductionSchema = z
  .object({
    workflowStage: editorProductionStageSchema.default('assembly'),
    references: z.array(editorProductionReferenceSchema).max(50).default([]),
    styleContract: editorStyleContractSchema.nullable().default(null),
    shots: z.array(editorShotSchema).max(200).default([]),
    failureReason: z.string().min(1).max(2_000).optional(),
  })
  .strict()
  .default({
    workflowStage: 'assembly',
    references: [],
    styleContract: null,
    shots: [],
  });
export type EditorProduction = z.infer<typeof editorProductionSchema>;

export const editorProjectV2Schema = z
  .object({
    schemaVersion: z.literal(2),
    projectId: editorIdSchema,
    sequenceId: editorIdSchema,
    revision: revisionNumberSchema,
    fingerprint: z.string().min(1).max(500),
    title: editorLabelSchema,
    durationSec: secondsSchema,
    canvas: editorCanvasSchema,
    frameRate: editorFrameRateSchema,
    sampleRateHz: z.number().int().min(8_000).max(192_000),
    tracks: z.array(editorTrackSchema).max(200),
    transitions: z.array(editorTransitionSchema).max(2_000).default([]),
    production: editorProductionSchema,
    markers: z
      .array(
        z
          .object({
            id: editorIdSchema,
            timeSec: secondsSchema,
            label: z.string().min(1).max(500),
            color: colorSchema.optional(),
          })
          .strict(),
      )
      .max(2_000)
      .default([]),
    exportSettings: editorExportSettingsSchema,
    legacyTimelineFingerprint: z.string().min(1).max(500).optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()
  .superRefine((project, context) => {
    const trackIds = new Set<string>();
    const clipIds = new Set<string>();
    for (const [trackIndex, track] of project.tracks.entries()) {
      if (trackIds.has(track.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['tracks', trackIndex, 'id'],
          message: `duplicate track id "${track.id}"`,
        });
      }
      trackIds.add(track.id);
      for (const [clipIndex, clip] of track.clips.entries()) {
        if (clipIds.has(clip.id)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['tracks', trackIndex, 'clips', clipIndex, 'id'],
            message: `duplicate clip id "${clip.id}"`,
          });
        }
        clipIds.add(clip.id);
        if (clip.timelineStartSec + clip.durationSec > project.durationSec + 0.001) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['tracks', trackIndex, 'clips', clipIndex, 'durationSec'],
            message: `clip "${clip.id}" extends past the project duration`,
          });
        }
      }
    }
    for (const [transitionIndex, transition] of project.transitions.entries()) {
      if (!trackIds.has(transition.trackId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['transitions', transitionIndex, 'trackId'],
          message: `transition track "${transition.trackId}" was not found`,
        });
      }
      if (!clipIds.has(transition.fromClipId) || !clipIds.has(transition.toClipId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['transitions', transitionIndex],
          message: 'transition clip reference was not found',
        });
      }
    }
  });
export type EditorProjectV2 = z.infer<typeof editorProjectV2Schema>;

const editorCommandMetadataShape = {
  commandId: editorIdSchema,
  idempotencyKey: z.string().min(8).max(500),
  expectedRevision: revisionNumberSchema,
  issuedAt: z.string().datetime(),
  actor: editorActorRefSchema,
};

export const editorCommandSchema = z.discriminatedUnion('commandType', [
  z
    .object({
      ...editorCommandMetadataShape,
      commandType: z.literal('add_track'),
      track: editorTrackSchema,
    })
    .strict(),
  z
    .object({
      ...editorCommandMetadataShape,
      commandType: z.literal('remove_track'),
      trackId: editorIdSchema,
      deleteClips: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      ...editorCommandMetadataShape,
      commandType: z.literal('reorder_track'),
      trackId: editorIdSchema,
      beforeTrackId: editorIdSchema.optional(),
    })
    .strict(),
  z
    .object({
      ...editorCommandMetadataShape,
      commandType: z.literal('upsert_clip'),
      trackId: editorIdSchema,
      clip: editorClipSchema,
    })
    .strict(),
  z
    .object({
      ...editorCommandMetadataShape,
      commandType: z.literal('remove_clip'),
      trackId: editorIdSchema,
      clipId: editorIdSchema,
    })
    .strict(),
  z
    .object({
      ...editorCommandMetadataShape,
      commandType: z.literal('move_clip'),
      clipId: editorIdSchema,
      fromTrackId: editorIdSchema,
      toTrackId: editorIdSchema,
      timelineStartSec: secondsSchema,
    })
    .strict(),
  z
    .object({
      ...editorCommandMetadataShape,
      commandType: z.literal('trim_clip'),
      trackId: editorIdSchema,
      clipId: editorIdSchema,
      sourceInSec: secondsSchema.optional(),
      timelineStartSec: secondsSchema.optional(),
      durationSec: positiveSecondsSchema,
    })
    .strict(),
  z
    .object({
      ...editorCommandMetadataShape,
      commandType: z.literal('split_clip'),
      trackId: editorIdSchema,
      clipId: editorIdSchema,
      splitAtSec: positiveSecondsSchema,
      rightClipId: editorIdSchema,
    })
    .strict(),
  z
    .object({
      ...editorCommandMetadataShape,
      commandType: z.literal('set_keyframes'),
      trackId: editorIdSchema,
      clipId: editorIdSchema,
      keyframes: z.array(editorKeyframeSchema).max(500),
    })
    .strict(),
  z
    .object({
      ...editorCommandMetadataShape,
      commandType: z.literal('upsert_transition'),
      transition: editorTransitionSchema,
    })
    .strict(),
  z
    .object({
      ...editorCommandMetadataShape,
      commandType: z.literal('remove_transition'),
      transitionId: editorIdSchema,
    })
    .strict(),
  z
    .object({
      ...editorCommandMetadataShape,
      commandType: z.literal('set_export_settings'),
      exportSettings: editorExportSettingsSchema,
    })
    .strict(),
  z
    .object({
      ...editorCommandMetadataShape,
      commandType: z.literal('set_project_metadata'),
      title: editorLabelSchema.optional(),
      durationSec: secondsSchema.optional(),
      canvas: editorCanvasSchema.optional(),
      frameRate: editorFrameRateSchema.optional(),
    })
    .strict(),
  z
    .object({
      ...editorCommandMetadataShape,
      commandType: z.literal('restore_timeline_snapshot'),
      snapshot: editorTimelineSnapshotSchema,
    })
    .strict(),
  z
    .object({
      ...editorCommandMetadataShape,
      commandType: z.literal('set_production_references'),
      references: z.array(editorProductionReferenceSchema).max(50),
    })
    .strict(),
  z
    .object({
      ...editorCommandMetadataShape,
      commandType: z.literal('set_style_contract'),
      styleContract: editorStyleContractSchema,
    })
    .strict(),
  z
    .object({
      ...editorCommandMetadataShape,
      commandType: z.literal('approve_style_contract'),
    })
    .strict(),
  z
    .object({
      ...editorCommandMetadataShape,
      commandType: z.literal('upsert_shot'),
      shot: editorShotSchema,
    })
    .strict(),
  z
    .object({
      ...editorCommandMetadataShape,
      commandType: z.literal('remove_shot'),
      shotId: editorIdSchema,
    })
    .strict(),
  z
    .object({
      ...editorCommandMetadataShape,
      commandType: z.literal('record_take'),
      shotId: editorIdSchema,
      take: editorTakeSchema,
    })
    .strict(),
  z
    .object({
      ...editorCommandMetadataShape,
      commandType: z.literal('approve_take'),
      shotId: editorIdSchema,
      takeId: editorIdSchema,
      reviewNote: z.string().min(1).max(2_000).optional(),
    })
    .strict(),
  z
    .object({
      ...editorCommandMetadataShape,
      commandType: z.literal('reject_take'),
      shotId: editorIdSchema,
      takeId: editorIdSchema,
      reviewNote: z.string().min(1).max(2_000),
    })
    .strict(),
  z
    .object({
      ...editorCommandMetadataShape,
      commandType: z.literal('set_production_stage'),
      workflowStage: editorProductionStageSchema,
      failureReason: z.string().min(1).max(2_000).optional(),
    })
    .strict(),
]);
export type EditorCommand = z.infer<typeof editorCommandSchema>;

export const editorCommandBatchSchema = z
  .object({
    batchId: editorIdSchema,
    projectId: editorIdSchema,
    sequenceId: editorIdSchema,
    idempotencyKey: z.string().min(8).max(500),
    expectedRevision: revisionNumberSchema,
    expectedFingerprint: z.string().min(1).max(500),
    atomic: z.boolean().default(true),
    issuedAt: z.string().datetime(),
    actor: editorActorRefSchema,
    commands: z.array(editorCommandSchema).min(1).max(100),
  })
  .strict()
  .superRefine((batch, context) => {
    if (
      batch.commands.some(
        (command) =>
          (command.commandType === 'approve_style_contract' ||
            command.commandType === 'approve_take' ||
            command.commandType === 'reject_take' ||
            command.commandType === 'restore_timeline_snapshot') &&
          command.actor.actorType !== 'user',
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['commands'],
        message: 'approval and rejection commands require a user actor',
      });
    }
    const commandIds = new Set<string>();
    const idempotencyKeys = new Set<string>();
    for (const [index, command] of batch.commands.entries()) {
      if (command.expectedRevision !== batch.expectedRevision) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['commands', index, 'expectedRevision'],
          message: 'command expectedRevision must match batch expectedRevision',
        });
      }
      if (commandIds.has(command.commandId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['commands', index, 'commandId'],
          message: `duplicate command id "${command.commandId}"`,
        });
      }
      commandIds.add(command.commandId);
      if (idempotencyKeys.has(command.idempotencyKey)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['commands', index, 'idempotencyKey'],
          message: `duplicate command idempotency key "${command.idempotencyKey}"`,
        });
      }
      idempotencyKeys.add(command.idempotencyKey);
    }
  });
export type EditorCommandBatch = z.infer<typeof editorCommandBatchSchema>;

export const editorAnalysisArtifactSchema = z
  .object({
    artifactId: editorIdSchema,
    sourceRef: editorMediaSourceRefSchema,
    artifactType: z.enum([
      'thumbnail',
      'thumbnail_strip',
      'first_frame',
      'last_frame',
      'waveform',
      'transcript',
      'scene_boundaries',
      'shot_labels',
      'face_tracks',
      'object_tracks',
      'silence_ranges',
      'beat_grid',
    ]),
    status: z.enum(['pending', 'ready', 'failed', 'stale']),
    uri: z.string().url().max(4_096).optional(),
    mimeType: z.string().min(1).max(200).optional(),
    checksum: z.string().min(1).max(500).optional(),
    generatedAt: z.string().datetime().optional(),
    error: z.string().min(1).max(2_000).optional(),
  })
  .strict()
  .superRefine((artifact, context) => {
    if (artifact.status === 'ready' && artifact.uri === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['uri'],
        message: 'ready analysis artifacts require a uri',
      });
    }
    if (artifact.status === 'failed' && artifact.error === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['error'],
        message: 'failed analysis artifacts require an error',
      });
    }
  });
export type EditorAnalysisArtifact = z.infer<typeof editorAnalysisArtifactSchema>;

export const editorAnalyzedSourceSchema = z
  .object({
    source: editorMediaSourceRefSchema,
    mediaKind: z.enum(['video', 'audio', 'image', 'graphic']),
    durationSec: secondsSchema.optional(),
    width: z.number().int().positive().max(16_384).optional(),
    height: z.number().int().positive().max(16_384).optional(),
    frameRate: editorFrameRateSchema.optional(),
    sampleRateHz: z.number().int().min(8_000).max(192_000).optional(),
    channels: z.number().int().positive().max(64).optional(),
    videoCodec: z.string().min(1).max(100).optional(),
    audioCodec: z.string().min(1).max(100).optional(),
    hasAudio: z.boolean(),
    analyzedAt: z.string().datetime(),
  })
  .strict();
export type EditorAnalyzedSource = z.infer<typeof editorAnalyzedSourceSchema>;

export const editorAnalysisManifestSchema = z
  .object({
    manifestId: editorIdSchema,
    projectId: editorIdSchema,
    sequenceId: editorIdSchema,
    projectRevision: revisionNumberSchema,
    projectFingerprint: z.string().min(1).max(500),
    analyzerVersion: z.string().min(1).max(100),
    generatedAt: z.string().datetime(),
    sources: z.array(editorAnalyzedSourceSchema).max(2_000),
    artifacts: z.array(editorAnalysisArtifactSchema).max(20_000),
    warnings: z.array(z.string().min(1).max(2_000)).max(500).default([]),
  })
  .strict();
export type EditorAnalysisManifest = z.infer<typeof editorAnalysisManifestSchema>;

export const editorRenderRangeSchema = z
  .object({
    startSec: secondsSchema,
    endSec: positiveSecondsSchema,
  })
  .strict()
  .refine((range) => range.endSec > range.startSec, {
    message: 'render range endSec must be after startSec',
  });

export const editorRenderRequestSchema = z
  .object({
    requestId: editorIdSchema,
    idempotencyKey: z.string().min(8).max(500),
    projectId: editorIdSchema,
    sequenceId: editorIdSchema,
    projectRevision: revisionNumberSchema,
    projectFingerprint: z.string().min(1).max(500),
    requestedAt: z.string().datetime(),
    requestedBy: editorActorRefSchema,
    settings: editorExportSettingsSchema,
    range: editorRenderRangeSchema.optional(),
    priority: z.enum(['background', 'normal', 'high']).default('normal'),
  })
  .strict();
export type EditorRenderRequest = z.infer<typeof editorRenderRequestSchema>;

export const editorRenderProgressSchema = z
  .object({
    requestId: editorIdSchema,
    projectId: editorIdSchema,
    projectRevision: revisionNumberSchema,
    sequence: z.number().int().nonnegative(),
    status: z.enum([
      'queued',
      'preparing',
      'rendering',
      'uploading',
      'completed',
      'failed',
      'cancelled',
      'stale',
    ]),
    progress: unitIntervalSchema,
    renderedFrames: z.number().int().nonnegative().optional(),
    totalFrames: z.number().int().positive().optional(),
    etaSec: secondsSchema.optional(),
    message: z.string().min(1).max(1_000).optional(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type EditorRenderProgress = z.infer<typeof editorRenderProgressSchema>;

export const editorRenderOutputSchema = z
  .object({
    url: z.string().url().max(4_096),
    mimeType: z.string().min(1).max(200),
    durationSec: positiveSecondsSchema,
    width: z.number().int().positive().max(16_384),
    height: z.number().int().positive().max(16_384),
    frameRate: editorFrameRateSchema,
    sizeBytes: z.number().int().nonnegative(),
    checksum: z.string().min(1).max(500),
    createdAt: z.string().datetime(),
  })
  .strict();
export type EditorRenderOutput = z.infer<typeof editorRenderOutputSchema>;

const editorRenderResultBaseShape = {
  requestId: editorIdSchema,
  projectId: editorIdSchema,
  projectRevision: revisionNumberSchema,
  projectFingerprint: z.string().min(1).max(500),
  completedAt: z.string().datetime(),
};

export const editorRenderResultSchema = z.discriminatedUnion('status', [
  z
    .object({
      ...editorRenderResultBaseShape,
      status: z.literal('succeeded'),
      output: editorRenderOutputSchema,
    })
    .strict(),
  z
    .object({
      ...editorRenderResultBaseShape,
      status: z.literal('failed'),
      errorCode: z.string().min(1).max(200),
      errorMessage: z.string().min(1).max(2_000),
      retryable: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...editorRenderResultBaseShape,
      status: z.literal('cancelled'),
      reason: z.string().min(1).max(2_000).optional(),
    })
    .strict(),
  z
    .object({
      ...editorRenderResultBaseShape,
      status: z.literal('stale'),
      currentRevision: revisionNumberSchema,
      reason: z.string().min(1).max(2_000),
    })
    .strict(),
]);
export type EditorRenderResult = z.infer<typeof editorRenderResultSchema>;

export const editorRevisionDtoSchema = z
  .object({
    revisionId: editorIdSchema,
    projectId: editorIdSchema,
    sequenceId: editorIdSchema,
    revision: revisionNumberSchema,
    parentRevisionId: editorIdSchema.optional(),
    fingerprint: z.string().min(1).max(500),
    commandBatchId: editorIdSchema.optional(),
    summary: z.string().min(1).max(2_000),
    createdAt: z.string().datetime(),
    createdBy: editorActorRefSchema,
  })
  .strict();
export type EditorRevisionDto = z.infer<typeof editorRevisionDtoSchema>;

export const editorConflictDtoSchema = z
  .object({
    conflictId: editorIdSchema,
    projectId: editorIdSchema,
    sequenceId: editorIdSchema,
    conflictType: z.enum([
      'stale_revision',
      'entity_deleted',
      'property_changed',
      'track_locked',
      'project_locked',
      'idempotency_mismatch',
    ]),
    expectedRevision: revisionNumberSchema,
    currentRevision: revisionNumberSchema,
    entityType: z.enum(['project', 'track', 'clip', 'transition', 'comment']).optional(),
    entityId: editorIdSchema.optional(),
    message: z.string().min(1).max(2_000),
    retryable: z.boolean(),
    detectedAt: z.string().datetime(),
    currentRevisionId: editorIdSchema.optional(),
  })
  .strict();
export type EditorConflictDto = z.infer<typeof editorConflictDtoSchema>;

export const editorCommentAnchorSchema = z.discriminatedUnion('anchorType', [
  z.object({ anchorType: z.literal('project') }).strict(),
  z
    .object({
      anchorType: z.literal('time_range'),
      startSec: secondsSchema,
      endSec: positiveSecondsSchema,
    })
    .strict()
    .refine((anchor) => anchor.endSec > anchor.startSec, {
      message: 'comment time range endSec must be after startSec',
    }),
  z.object({ anchorType: z.literal('track'), trackId: editorIdSchema }).strict(),
  z
    .object({
      anchorType: z.literal('clip'),
      trackId: editorIdSchema,
      clipId: editorIdSchema,
      timeSec: secondsSchema.optional(),
    })
    .strict(),
  z
    .object({
      anchorType: z.literal('frame'),
      timeSec: secondsSchema,
      x: unitIntervalSchema.optional(),
      y: unitIntervalSchema.optional(),
    })
    .strict(),
]);
export type EditorCommentAnchor = z.infer<typeof editorCommentAnchorSchema>;

export const editorCommentDtoSchema = z
  .object({
    commentId: editorIdSchema,
    projectId: editorIdSchema,
    sequenceId: editorIdSchema,
    revision: revisionNumberSchema,
    anchor: editorCommentAnchorSchema,
    body: z.string().min(1).max(10_000),
    status: z.enum(['open', 'resolved']),
    author: editorActorRefSchema,
    mentionedActorIds: z.array(editorIdSchema).max(100).default([]),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    resolvedAt: z.string().datetime().optional(),
    resolvedBy: editorActorRefSchema.optional(),
  })
  .strict()
  .superRefine((comment, context) => {
    if (
      comment.status === 'resolved' &&
      (comment.resolvedAt === undefined || comment.resolvedBy === undefined)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['resolvedAt'],
        message: 'resolved comments require resolvedAt and resolvedBy',
      });
    }
    if (
      comment.status === 'open' &&
      (comment.resolvedAt !== undefined || comment.resolvedBy !== undefined)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['status'],
        message: 'open comments cannot include resolution metadata',
      });
    }
  });
export type EditorCommentDto = z.infer<typeof editorCommentDtoSchema>;

export const createEditorCommentDtoSchema = z
  .object({
    idempotencyKey: z.string().min(8).max(500),
    projectId: editorIdSchema,
    sequenceId: editorIdSchema,
    expectedRevision: revisionNumberSchema,
    anchor: editorCommentAnchorSchema,
    body: z.string().min(1).max(10_000),
    mentionedActorIds: z.array(editorIdSchema).max(100).default([]),
  })
  .strict();
export type CreateEditorCommentDto = z.infer<typeof createEditorCommentDtoSchema>;

export const resolveEditorCommentDtoSchema = z
  .object({
    idempotencyKey: z.string().min(8).max(500),
    projectId: editorIdSchema,
    sequenceId: editorIdSchema,
    commentId: editorIdSchema,
    expectedRevision: revisionNumberSchema,
    resolved: z.boolean(),
  })
  .strict();
export type ResolveEditorCommentDto = z.infer<typeof resolveEditorCommentDtoSchema>;
