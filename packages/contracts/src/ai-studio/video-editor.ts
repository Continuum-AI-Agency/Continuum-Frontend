// The Video Studio editor-op vocabulary.
//
// One list of operations, served through three doors: the workspace's buttons and menus
// (REST `POST /api/ai-studio/video-projects/:projectId/ops/:op`), the in-editor agent's
// tools, and the MCP `video_editor` umbrella. Each op's input, output and description are
// declared here once, so the three doors cannot disagree about what an op takes, returns
// or promises. Every time is in seconds on the OUTPUT timeline.

import { z } from 'zod';
import {
  type EditorExportSettings,
  type EditorProjectV2,
  editorMarkerSchema,
  editorProjectV2Schema,
} from './editor-project-v2';

// ── Platform export presets ────────────────────────────────────────────────────────────

export const PLATFORM_EXPORT_PRESET_IDS = [
  'tiktok',
  'reels',
  'shorts',
  'youtube',
  'square',
  'portrait',
] as const;
export const platformExportPresetIdSchema = z.enum(PLATFORM_EXPORT_PRESET_IDS);
export type PlatformExportPresetId = z.infer<typeof platformExportPresetIdSchema>;

export type PlatformExportPreset = {
  id: PlatformExportPresetId;
  label: string;
  width: number;
  height: number;
  /** Advisory: exports longer than this warn, never block — platform limits move. */
  maxDurationSec: number | null;
};

export const PLATFORM_EXPORT_PRESETS: Record<PlatformExportPresetId, PlatformExportPreset> = {
  tiktok: { id: 'tiktok', label: 'TikTok', width: 1080, height: 1920, maxDurationSec: 600 },
  reels: { id: 'reels', label: 'Instagram Reels', width: 1080, height: 1920, maxDurationSec: 180 },
  shorts: { id: 'shorts', label: 'YouTube Shorts', width: 1080, height: 1920, maxDurationSec: 180 },
  youtube: { id: 'youtube', label: 'YouTube', width: 1920, height: 1080, maxDurationSec: null },
  square: { id: 'square', label: 'Feed 1:1', width: 1080, height: 1080, maxDurationSec: null },
  portrait: { id: 'portrait', label: 'Feed 4:5', width: 1080, height: 1350, maxDurationSec: null },
};

/** Every preset is H.264/AAC MP4 at 30 fps — what all six platforms ingest without re-encoding. */
export const exportSettingsForPreset = (id: PlatformExportPresetId): EditorExportSettings => {
  const preset = PLATFORM_EXPORT_PRESETS[id];
  return {
    presetId: id,
    width: preset.width,
    height: preset.height,
    frameRate: { numerator: 30, denominator: 1 },
    format: 'mp4',
    videoCodec: 'h264',
    videoBitrateKbps: 10_000,
    audioCodec: 'aac',
    audioBitrateKbps: 192,
    sampleRateHz: 48_000,
    colorSpace: 'rec709',
    alpha: false,
    captionMode: 'burn_in',
    quality: 'high',
  };
};

/** Soft warnings for an export — never a reason to refuse one. */
export const exportPresetWarnings = (id: PlatformExportPresetId, durationSec: number): string[] => {
  const preset = PLATFORM_EXPORT_PRESETS[id];
  return preset.maxDurationSec !== null && durationSec > preset.maxDurationSec
    ? [
        `${preset.label} caps uploads near ${preset.maxDurationSec}s; this cut is ${Math.round(durationSec)}s.`,
      ]
    : [];
};

// ── Render readiness ───────────────────────────────────────────────────────────────────

/**
 * Why this project cannot render yet — empty means it can.
 *
 * The production gates (approved style, a human-approved master per shot, an assembly
 * stage) exist for AI-directed production projects. A plain edit — footage dropped in
 * and cut — has no shots, and holding it to those gates is what made every
 * Library-opened project unexportable. Shots are what make a project a production one.
 */
export const editorRenderBlockers = (project: EditorProjectV2): string[] => {
  const blockers: string[] = [];
  const { production } = project;
  if (production.shots.length > 0) {
    if (production.styleContract?.status !== 'approved') {
      blockers.push('Approve the style contract before rendering.');
    }
    if (production.shots.some((shot) => !shot.selection.motionMasterTakeId)) {
      blockers.push('Every shot needs a human-approved 1080p master.');
    }
    if (!['assembly', 'ready_to_render', 'rendering'].includes(production.workflowStage)) {
      blockers.push('Finish the production approval gates before rendering.');
    }
  }
  const hasPicture = project.tracks.some(
    (track) =>
      track.kind === 'video' &&
      track.enabled &&
      !track.muted &&
      track.clips.some((clip) => clip.enabled),
  );
  if (!hasPicture) blockers.push('The timeline is empty.');
  return blockers;
};

// ── Shared vocabularies ────────────────────────────────────────────────────────────────

/** The caption looks (`video.subtitles.config.preset` in action-registry); the Frontend
 * catalog `lib/clips/captionPresets.ts` keys its designs by exactly this list. */
export const VIDEO_EDITOR_CAPTION_STYLES = [
  'classic',
  'pop',
  'pulse',
  'glide',
  'fusion',
  'boxed',
] as const;
export const videoEditorCaptionStyleSchema = z.enum(VIDEO_EDITOR_CAPTION_STYLES);
export type VideoEditorCaptionStyle = z.infer<typeof videoEditorCaptionStyleSchema>;

/** StyleFrame-style quick starts, each served by a generator the canvas already has. */
export const VIDEO_EDITOR_QUICK_STARTS = [
  'create_image',
  'restyle_image',
  'edit_image',
  'storyboard_to_video',
  'keyframes_to_video',
  'rotate_360',
] as const;
export const videoEditorQuickStartSchema = z.enum(VIDEO_EDITOR_QUICK_STARTS);
export type VideoEditorQuickStart = z.infer<typeof videoEditorQuickStartSchema>;

const projectIdSchema = z.string().uuid();
const secSchema = z.number().finite().nonnegative().max(86_400);
const timelineRangeSchema = z
  .object({ startSec: secSchema, endSec: secSchema })
  .strict()
  .refine((range) => range.endSec > range.startSec, { message: 'endSec must be after startSec' });
export type VideoEditorTimelineRange = z.infer<typeof timelineRangeSchema>;

const projectRef = { projectId: projectIdSchema };

/** What every op that edits returns: the revision it committed and what it did. */
export const videoEditorCommitSchema = z
  .object({
    projectId: projectIdSchema,
    revision: z.number().int().nonnegative(),
    fingerprint: z.string().min(1),
    durationSec: secSchema,
    summary: z.string().max(2_000),
  })
  .strict();
export type VideoEditorCommit = z.infer<typeof videoEditorCommitSchema>;

const committed = <T extends z.ZodRawShape>(extra: T) =>
  z.object({ commit: videoEditorCommitSchema, ...extra }).strict();

const jobStateSchema = z.enum(['queued', 'running', 'completed', 'failed']);

export const videoEditorCompactClipSchema = z
  .object({
    id: z.string(),
    kind: z.string(),
    startSec: secSchema,
    durationSec: secSchema,
    enabled: z.boolean(),
    sourceInSec: secSchema.optional(),
    playbackRate: z.number().optional(),
    sourceAssetId: z.string().optional(),
    label: z.string().optional(),
    text: z.string().optional(),
  })
  .strict();

export const videoEditorCompactTrackSchema = z
  .object({
    id: z.string(),
    kind: z.string(),
    name: z.string(),
    enabled: z.boolean(),
    muted: z.boolean(),
    clips: z.array(videoEditorCompactClipSchema),
  })
  .strict();

export const videoEditorPoolAssetSchema = z
  .object({
    assetId: z.string(),
    versionId: z.string().optional(),
    kind: z.enum(['video', 'image', 'audio']),
    title: z.string(),
    durationSec: secSchema.optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    thumbnailUrl: z.string().optional(),
    origin: z.enum(['graph', 'project', 'generated']),
  })
  .strict();
export type VideoEditorPoolAsset = z.infer<typeof videoEditorPoolAssetSchema>;

// ── The ops ────────────────────────────────────────────────────────────────────────────

export type VideoEditorOpGroup = 'see' | 'edit' | 'quick' | 'ship' | 'sources';

type OpSpec = {
  group: VideoEditorOpGroup;
  /** Commits a revision — needs operate permission, and the open editor refetches after it. */
  commits: boolean;
  /** `brand` ops take no projectId and act on the caller's selected brand (MCP only). */
  scope: 'project' | 'brand';
  /** `operate` needs editor rights on the brand: every op that commits, exports or generates. */
  access: 'read' | 'operate';
  description: string;
  input: z.ZodTypeAny;
  output: z.ZodTypeAny;
};

export const VIDEO_EDITOR_OPS = {
  list_projects: {
    group: 'see',
    commits: false,
    scope: 'brand',
    access: 'read',
    description:
      "List the brand's video projects, most recently edited first, each with the path of its editor so a person can open it.",
    input: z.object({ limit: z.number().int().min(1).max(50).default(20) }).strict(),
    output: z
      .object({
        projects: z.array(
          z
            .object({
              projectId: projectIdSchema,
              title: z.string(),
              updatedAt: z.string(),
              durationSec: secSchema,
              width: z.number().int().positive(),
              height: z.number().int().positive(),
              editorPath: z.string(),
            })
            .strict(),
        ),
      })
      .strict(),
  },
  get_project: {
    group: 'see',
    commits: false,
    scope: 'project',
    access: 'read',
    description:
      'Read the timeline: tracks, clips (ids, timing, source assets, text), markers including beat markers, format, and the revision + fingerprint every edit must name. Pass full=true for the complete project document.',
    input: z.object({ ...projectRef, full: z.boolean().default(false) }).strict(),
    output: z
      .object({
        projectId: projectIdSchema,
        title: z.string(),
        revision: z.number().int().nonnegative(),
        fingerprint: z.string(),
        durationSec: secSchema,
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        exportPresetId: z.string().optional(),
        tracks: z.array(videoEditorCompactTrackSchema),
        markers: z.array(editorMarkerSchema),
        editorPath: z.string(),
        project: editorProjectV2Schema.optional(),
      })
      .strict(),
  },
  get_transcript: {
    group: 'see',
    commits: false,
    scope: 'project',
    access: 'read',
    description:
      'Every spoken word on the timeline, mapped to timeline time through each clip’s trim and speed. Pass clipId for one clip.',
    input: z.object({ ...projectRef, clipId: z.string().optional() }).strict(),
    output: z
      .object({
        words: z.array(
          z
            .object({
              text: z.string(),
              startSec: secSchema,
              endSec: secSchema,
              clipId: z.string(),
            })
            .strict(),
        ),
        granularity: z.enum(['word', 'segment']),
        language: z.string().optional(),
      })
      .strict(),
  },
  get_beats: {
    group: 'see',
    commits: true,
    scope: 'project',
    access: 'operate',
    description:
      'Detect the beat grid of the music on the timeline (or of clipId) and persist it as beat markers. Returns beat times on the timeline. Re-uses existing beat markers unless force=true.',
    input: z
      .object({ ...projectRef, clipId: z.string().optional(), force: z.boolean().default(false) })
      .strict(),
    output: z
      .object({
        commit: videoEditorCommitSchema.optional(),
        bpm: z.number().positive(),
        offsetSec: secSchema,
        confidence: z.number().min(0).max(1),
        beats: z.array(secSchema),
        sourceClipId: z.string(),
      })
      .strict(),
  },
  get_frame: {
    group: 'see',
    commits: false,
    scope: 'project',
    access: 'read',
    description:
      'A picture of the topmost visible video clip at a timeline time, so you can look before you cut.',
    input: z
      .object({
        ...projectRef,
        timeSec: secSchema,
        maxWidth: z.number().int().min(64).max(1_920).default(768),
      })
      .strict(),
    output: z
      .object({
        mimeType: z.enum(['image/jpeg', 'image/webp', 'image/png']),
        base64: z.string(),
        clipId: z.string(),
        sourceTimeSec: secSchema,
      })
      .strict(),
  },
  apply_commands: {
    group: 'edit',
    commits: true,
    scope: 'project',
    access: 'operate',
    description:
      'Apply raw editor commands (add_track, upsert_clip, move_clip, trim_clip, split_clip, set_keyframes, upsert_transition, set_export_settings, upsert_marker, …) atomically. Omit commandId/idempotencyKey/expectedRevision/issuedAt/actor — they are filled in. Fails closed if expectedRevision is stale: read the project again and retry.',
    input: z
      .object({
        ...projectRef,
        expectedRevision: z.number().int().nonnegative(),
        commands: z
          .array(z.object({ commandType: z.string().min(1) }).passthrough())
          .min(1)
          .max(100),
      })
      .strict(),
    output: committed({}),
  },
  undo: {
    group: 'edit',
    commits: true,
    scope: 'project',
    access: 'operate',
    description:
      'Restore the timeline to an earlier revision (default: the one before the current). Undo is itself a new revision, so it can be undone.',
    input: z
      .object({ ...projectRef, toRevision: z.number().int().nonnegative().optional() })
      .strict(),
    output: committed({ restoredRevision: z.number().int().nonnegative() }),
  },
  cut_silence: {
    group: 'quick',
    commits: true,
    scope: 'project',
    access: 'operate',
    description:
      'Remove pauses and dead air (ripple), keeping a little breath around every word. Scope to one clip with clipId.',
    input: z
      .object({
        ...projectRef,
        clipId: z.string().optional(),
        minSilenceSec: z.number().min(0.1).max(5).default(0.35),
        paddingSec: z.number().min(0).max(1).default(0.08),
        thresholdDb: z.number().min(-80).max(-10).default(-35),
      })
      .strict(),
    output: committed({ removed: z.array(timelineRangeSchema), removedSec: secSchema }),
  },
  cut_ranges: {
    group: 'quick',
    commits: true,
    scope: 'project',
    access: 'operate',
    description:
      'Cut exact timeline ranges out of every track. With ripple (default) everything after closes the gap.',
    input: z
      .object({
        ...projectRef,
        ranges: z.array(timelineRangeSchema).min(1).max(200),
        ripple: z.boolean().default(true),
      })
      .strict(),
    output: committed({ removedSec: secSchema }),
  },
  beat_cut: {
    group: 'quick',
    commits: true,
    scope: 'project',
    access: 'operate',
    description:
      'Cut to the music. cut_on_beat splits the picture on every Nth beat; switch_shots alternates the given source clips every N beats. Detects beats first if the timeline has none.',
    input: z
      .object({
        ...projectRef,
        mode: z.enum(['cut_on_beat', 'switch_shots']).default('cut_on_beat'),
        everyNBeats: z.number().int().min(1).max(16).default(1),
        clipIds: z.array(z.string()).max(50).optional(),
        audioClipId: z.string().optional(),
        range: timelineRangeSchema.optional(),
      })
      .strict(),
    output: committed({ cuts: z.array(secSchema) }),
  },
  set_captions: {
    group: 'quick',
    commits: true,
    scope: 'project',
    access: 'operate',
    description:
      'Write word-timed animated captions from the speech on the timeline into a caption track, replacing existing auto-captions.',
    input: z
      .object({
        ...projectRef,
        style: videoEditorCaptionStyleSchema.default('classic'),
        highlight: z.enum(['none', 'word', 'karaoke']).default('word'),
        maxWordsPerLine: z.number().int().min(1).max(12).default(4),
        position: z.enum(['bottom', 'middle', 'top']).default('bottom'),
      })
      .strict(),
    output: committed({
      words: z.number().int().nonnegative(),
      lines: z.number().int().nonnegative(),
    }),
  },
  set_format: {
    group: 'quick',
    commits: true,
    scope: 'project',
    access: 'operate',
    description:
      'Switch the project to a platform format (TikTok/Reels/Shorts 9:16, YouTube 16:9, square, 4:5) and reframe every clip to cover (fill, crop edges) or contain (fit, letterbox).',
    input: z
      .object({
        ...projectRef,
        preset: platformExportPresetIdSchema,
        fit: z.enum(['cover', 'contain']).default('cover'),
      })
      .strict(),
    output: committed({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      warnings: z.array(z.string()),
    }),
  },
  add_text: {
    group: 'quick',
    commits: true,
    scope: 'project',
    access: 'operate',
    description:
      'Add an animated text layer: a title, a lower third, kinetic type, or a call to action.',
    input: z
      .object({
        ...projectRef,
        kind: z.enum(['title', 'lower_third', 'kinetic', 'cta']),
        text: z.string().min(1).max(500),
        startSec: secSchema,
        durationSec: z.number().min(0.1).max(60).default(3),
        style: z
          .object({
            fontFamily: z.string().max(200).optional(),
            color: z.string().max(32).optional(),
            fontSizePx: z.number().min(8).max(400).optional(),
          })
          .strict()
          .optional(),
      })
      .strict(),
    output: committed({ clipId: z.string() }),
  },
  export: {
    group: 'ship',
    commits: false,
    scope: 'project',
    access: 'operate',
    description:
      'Render the timeline to an MP4 on the render service and save it to the Library. Poll export_status with the returned jobId.',
    input: z
      .object({
        ...projectRef,
        preset: platformExportPresetIdSchema.optional(),
        captionMode: z.enum(['burn_in', 'none']).default('burn_in'),
      })
      .strict(),
    output: z
      .object({ jobId: z.string(), state: jobStateSchema, warnings: z.array(z.string()) })
      .strict(),
  },
  export_status: {
    group: 'ship',
    commits: false,
    scope: 'project',
    access: 'read',
    description: 'Progress of an export; when completed, the Library asset and a download URL.',
    input: z.object({ ...projectRef, jobId: z.string() }).strict(),
    output: z
      .object({
        jobId: z.string(),
        state: jobStateSchema,
        progress: z.number().min(0).max(1).optional(),
        assetId: z.string().optional(),
        downloadUrl: z.string().optional(),
        error: z.string().optional(),
      })
      .strict(),
  },
  get_pool: {
    group: 'sources',
    commits: false,
    scope: 'project',
    access: 'read',
    description:
      'Media available to this edit: assets wired into it on the canvas graph, the project’s own sources, and generated results.',
    input: z.object({ ...projectRef }).strict(),
    output: z.object({ assets: z.array(videoEditorPoolAssetSchema) }).strict(),
  },
  generate: {
    group: 'sources',
    commits: false,
    scope: 'project',
    access: 'operate',
    description:
      'Generate an image or clip from a quick start (create/restyle/edit image, storyboard or keyframes to video, 360 rotation) using reference assets, optionally placing the result on the timeline. Poll generate_status.',
    input: z
      .object({
        ...projectRef,
        quickStart: videoEditorQuickStartSchema,
        prompt: z.string().max(4_000).default(''),
        refs: z
          .array(
            z
              .object({
                assetId: z.string(),
                role: z
                  .enum(['subject', 'environment', 'style', 'source', 'first_frame', 'last_frame'])
                  .default('source'),
              })
              .strict(),
          )
          .max(6)
          .default([]),
        preset: platformExportPresetIdSchema.optional(),
        place: z.object({ atSec: secSchema, trackId: z.string().optional() }).strict().optional(),
      })
      .strict(),
    output: z.object({ jobId: z.string(), state: jobStateSchema }).strict(),
  },
  generate_status: {
    group: 'sources',
    commits: false,
    scope: 'project',
    access: 'read',
    description:
      'Progress of a generation; when completed, the new asset and the clip it was placed as.',
    input: z.object({ ...projectRef, jobId: z.string() }).strict(),
    output: z
      .object({
        jobId: z.string(),
        state: jobStateSchema,
        asset: videoEditorPoolAssetSchema.optional(),
        clipId: z.string().optional(),
        commit: videoEditorCommitSchema.optional(),
        error: z.string().optional(),
      })
      .strict(),
  },
} as const satisfies Record<string, OpSpec>;

export type VideoEditorOpName = keyof typeof VIDEO_EDITOR_OPS;
export const VIDEO_EDITOR_OP_NAMES = Object.keys(VIDEO_EDITOR_OPS) as VideoEditorOpName[];
export const videoEditorOpNameSchema = z.enum(
  VIDEO_EDITOR_OP_NAMES as [VideoEditorOpName, ...VideoEditorOpName[]],
);
export type VideoEditorOpInput<N extends VideoEditorOpName> = z.input<
  (typeof VIDEO_EDITOR_OPS)[N]['input']
>;
export type VideoEditorOpParsedInput<N extends VideoEditorOpName> = z.output<
  (typeof VIDEO_EDITOR_OPS)[N]['input']
>;
export type VideoEditorOpOutput<N extends VideoEditorOpName> = z.output<
  (typeof VIDEO_EDITOR_OPS)[N]['output']
>;

/** The editor route a person opens; doors that speak to people prefix their app origin. */
export const videoStudioEditorPath = (projectId: string): string =>
  `/studio/video/${encodeURIComponent(projectId)}?origin=library`;
