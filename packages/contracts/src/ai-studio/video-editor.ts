// The Video Studio editor-op vocabulary.
//
// One list of operations, served through three doors: the workspace's buttons and menus
// (REST `POST /api/ai-studio/video-projects/:projectId/ops/:op`), the in-editor agent's
// tools, and the MCP `video_editor` umbrella. Each op's input, output and description are
// declared here once, so the three doors cannot disagree about what an op takes, returns
// or promises. Every time is in seconds on the OUTPUT timeline.

import { z } from 'zod';
import { headlessGrammarSchema } from '../headless-content/grammar';
import {
  type EditorExportSettings,
  type EditorProjectV2,
  editorBriefSchema,
  editorCutKindSchema,
  editorMarkerSchema,
  editorProjectV2Schema,
} from './editor-project-v2';
import {
  clipMotionPresetIdSchema,
  lookEffectIdSchema,
  textAnimationIdSchema,
  textTemplateIdSchema,
} from './motion-presets';

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
  // `muted` silences a video track; only `enabled` takes its picture away. Text and a nested
  // sequence are picture too: the render plan draws them on the canvas background.
  const hasPicture = project.tracks.some(
    (track) =>
      track.enabled &&
      (track.kind === 'video' ||
        track.kind === 'text' ||
        track.kind === 'nested_sequence' ||
        (track.kind === 'overlay' && !track.muted)) &&
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

/** StyleFrame-style quick starts, each served by a generator the product already has: images
 * and clips (canvas generators), a music bed (Lyria), a voiceover (Gemini TTS), and a reel
 * made from a headless content concept. */
export const VIDEO_EDITOR_QUICK_STARTS = [
  'create_image',
  'restyle_image',
  'edit_image',
  'storyboard_to_video',
  'keyframes_to_video',
  'rotate_360',
  'music_bed',
  'voiceover',
  'headless_concept',
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

/** One line of a paper edit: a span of a source, and the job it does in the cut. */
export const videoEditorCutSegmentSchema = z
  .object({
    assetId: z.string(),
    startSec: secSchema,
    endSec: secSchema,
    role: z.enum(['hook', 'body', 'proof', 'cta']),
    text: z.string().max(2_000),
  })
  .strict();
export type VideoEditorCutSegment = z.infer<typeof videoEditorCutSegmentSchema>;

export const videoEditorDraftVariantSchema = z
  .object({
    projectId: projectIdSchema,
    label: z.string(),
    angle: z.string(),
    /** The hook title's words, when the cut was finished with one. */
    headline: z.string().max(120).optional(),
    durationSec: secSchema,
    editorPath: z.string(),
    segments: z.array(videoEditorCutSegmentSchema),
    commit: videoEditorCommitSchema,
  })
  .strict();
export type VideoEditorDraftVariant = z.infer<typeof videoEditorDraftVariantSchema>;

// ── The ops ────────────────────────────────────────────────────────────────────────────
export const videoEditorWorkflowSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(100),
    prompt: z.string().min(1).max(2_000),
  })
  .strict();
export type VideoEditorWorkflow = z.infer<typeof videoEditorWorkflowSchema>;

export type VideoEditorOpGroup = 'see' | 'edit' | 'quick' | 'motion' | 'draft' | 'ship' | 'sources';

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
  list_workflows: {
    group: 'see',
    commits: false,
    scope: 'project',
    access: 'read',
    description:
      'List saved editing workflows for this brand. When asked to run one, read its prompt and carry out those instructions on the CURRENT project with the named editor operations. A saved workflow is reusable instructions, not fixed clip IDs.',
    input: z.object({ ...projectRef }).strict(),
    output: z.object({ workflows: z.array(videoEditorWorkflowSchema) }).strict(),
  },
  save_workflow: {
    group: 'edit',
    commits: false,
    scope: 'project',
    access: 'operate',
    description:
      'Save reusable editing instructions in the brand workflow library, without changing the timeline. Use general instructions about the current footage or selected clips; do not freeze project IDs or clip IDs. Saving does not run the instructions.',
    input: z
      .object({
        ...projectRef,
        name: z.string().trim().min(1).max(100),
        prompt: z.string().trim().min(1).max(2_000),
      })
      .strict(),
    output: z.object({ workflow: videoEditorWorkflowSchema }).strict(),
  },
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
        brief: editorBriefSchema.optional(),
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
      'Make rhythmic cuts: jump_cuts skips footage from one forward primary clip and shortens the timeline while preserving authored motion and gain curves. It protects speech/captions and keeps music-bed audio continuous; speech protection can prevent cuts. The range must stay inside that clip without overlapping transitions; reversed or speed-ramped clips in the affected range are refused. switch_shots alternates at least two distinct source spans with original audio continuous. everyNBeats 0.5 or 0.25 makes half/quarter-beat cuts. cut_on_beat only splits for edit preparation. audioClipId redetects the beat source; it does not label narration as music.',
    input: z
      .object({
        ...projectRef,
        mode: z.enum(['cut_on_beat', 'switch_shots', 'jump_cuts']).default('switch_shots'),
        everyNBeats: z
          .number()
          .finite()
          .min(0.25)
          .max(16)
          .refine(
            (value) => value === 0.25 || value === 0.5 || Number.isInteger(value),
            'Use quarter, half, or whole beats',
          )
          .default(1)
          .describe(
            'Beats per shot: 0.5 = every half beat, 0.25 = every quarter beat, 1 = every beat. For quick splices or doka doka doka use 0.5.',
          ),
        clipIds: z.array(z.string()).max(50).optional(),
        audioClipId: z.string().optional(),
        range: timelineRangeSchema.optional(),
      })
      .strict(),
    output: committed({ cuts: z.array(secSchema), removedSec: secSchema.optional() }),
  },
  collage: {
    group: 'motion',
    commits: true,
    scope: 'project',
    access: 'operate',
    description:
      'Show two to four existing picture clips together in filled collage panels, without replacing the main sequence or its audio. stack makes horizontal strips, side_by_side makes columns, grid needs four clips. Each panel uses a centered crop. One undo removes the collage.',
    input: z
      .object({
        ...projectRef,
        clipIds: z
          .array(z.string())
          .min(2)
          .max(4)
          .refine((ids) => new Set(ids).size === ids.length, 'Select different clips'),
        layout: z.enum(['stack', 'side_by_side', 'grid']).default('stack'),
        atSec: secSchema.default(0),
        durationSec: z
          .number()
          .finite()
          .min(0.1)
          .max(120)
          .optional()
          .describe(
            'Omit to fit the panels to the shortest selected source and remaining timeline. Specify only when the person requests a duration.',
          ),
      })
      .strict(),
    output: committed({ clipIds: z.array(z.string()), trackId: z.string() }),
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
        highlightColor: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional(),
      })
      .strict(),
    output: committed({
      words: z.number().int().nonnegative(),
      lines: z.number().int().nonnegative(),
    }),
  },
  set_speed: {
    group: 'quick',
    commits: true,
    scope: 'project',
    access: 'operate',
    description:
      'Change a video, audio or composition clip to a constant playback rate, keeping its source span and scaling its own automation. Main-video changes repack the sequence and carry its captions and overlays; composition changes retain other instances and the child sequence. Reverse and speed ramps are not supported. One undo restores the edit.',
    input: z
      .object({
        ...projectRef,
        clipId: z.string().min(1),
        rate: z.number().finite().min(0.05).max(20),
        expectedRevision: z.number().int().nonnegative().optional(),
      })
      .strict(),
    output: committed({ clipId: z.string(), playbackRate: z.number(), durationSec: secSchema }),
  },
  edit_caption_cues: {
    group: 'quick',
    commits: true,
    scope: 'project',
    access: 'operate',
    description:
      'Correct spelling in existing timed caption cues without regenerating captions or changing word timing, confidence or emphasis. Each replacement must have the same number of words. Get full project data for cue IDs first. All corrections commit together and undo together.',
    input: z
      .object({
        ...projectRef,
        expectedRevision: z.number().int().nonnegative().optional(),
        cues: z
          .array(
            z
              .object({ clipId: z.string().min(1), text: z.string().trim().min(1).max(5000) })
              .strict(),
          )
          .min(1)
          .max(200),
      })
      .strict(),
    output: committed({ cues: z.number().int().positive() }),
  },
  get_composed_frame: {
    group: 'see',
    commits: false,
    scope: 'project',
    access: 'read',
    description:
      'See the actual composed timeline frame, including text, captions, overlays, transitions and looks. Use after visual edits to verify the result; get_frame reads source footage only.',
    input: z
      .object({
        ...projectRef,
        timeSec: secSchema,
        maxWidth: z.number().int().min(64).max(1920).default(768),
      })
      .strict(),
    output: z
      .object({
        mimeType: z.literal('image/png'),
        base64: z.string().min(1),
        timeSec: secSchema,
        revision: z.number().int().nonnegative(),
      })
      .strict(),
  },
  set_format: {
    group: 'quick',
    commits: true,
    scope: 'project',
    access: 'operate',
    description:
      'Switch the project to a platform format (TikTok/Reels/Shorts 9:16, YouTube 16:9, square, 4:5) and refit unlocked, centered full-frame video clips to cover (fill, crop edges) or contain (fit, letterbox). Preserve authored positioning, pivots, motion and 3D transforms.',
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
      'Add animated text: a template (hook_title, lower_third, kinetic_words, cta_end_card, listicle_number, quote, stat_callout, subtitle_bar — two-layer templates take secondaryText) or a plain title, lower third, kinetic line or call to action. animationIn/animationOut override the entrance and exit.',
    input: z
      .object({
        ...projectRef,
        kind: z.enum(['title', 'lower_third', 'kinetic', 'cta']).default('title'),
        template: textTemplateIdSchema.optional(),
        text: z.string().min(1).max(500),
        secondaryText: z.string().min(1).max(300).optional(),
        startSec: secSchema,
        durationSec: z.number().min(0.1).max(60).optional(),
        animationIn: textAnimationIdSchema.optional(),
        animationOut: textAnimationIdSchema.optional(),
        style: z
          .object({
            fontFamily: z.string().max(200).optional(),
            color: z.string().max(32).optional(),
            fontSizePx: z.number().min(8).max(400).optional(),
            backgroundColor: z.string().max(32).optional(),
            shadow: z.boolean().optional(),
          })
          .strict()
          .optional(),
      })
      .strict(),
    output: committed({
      /** The primary layer. */
      clipId: z.string(),
      /** Every layer a template placed, primary first. */
      clipIds: z.array(z.string()).optional(),
    }),
  },
  add_clip: {
    group: 'edit',
    commits: true,
    scope: 'project',
    access: 'operate',
    description:
      'Place a Library or pool asset on the timeline at a time: video on a video track, an image as an overlay, audio on an audio track. versionId keeps a specific stored version; omit it to use the current head. sourceInSec/durationSec trim it; newTrack puts it on a track of its own.',
    input: z
      .object({
        ...projectRef,
        assetId: z.string().min(1),
        versionId: z.string().uuid().optional(),
        atSec: secSchema.default(0),
        trackId: z.string().optional(),
        newTrack: z.boolean().default(false),
        sourceInSec: secSchema.optional(),
        durationSec: z.number().positive().max(86_400).optional(),
      })
      .strict(),
    output: committed({ clipId: z.string(), trackId: z.string() }),
  },
  animate_clip: {
    group: 'motion',
    commits: true,
    scope: 'project',
    access: 'operate',
    description:
      "Animate any visual clip (video, overlay, text) with a motion preset: fade/slide/pop/spring/zoom in at its start, fade/slide out at its end, punch_in or shake at atSec (timeline seconds), or ken_burns across the whole clip. Replaces the clip's keyframes of the same properties in that window.",
    input: z
      .object({
        ...projectRef,
        clipId: z.string().min(1),
        preset: clipMotionPresetIdSchema,
        durationSec: z.number().min(0.1).max(10).optional(),
        atSec: secSchema.optional(),
      })
      .strict(),
    output: committed({ keyframes: z.number().int().nonnegative() }),
  },
  add_transition: {
    group: 'motion',
    commits: true,
    scope: 'project',
    access: 'operate',
    description:
      'The only way to add or remove a transition. Joins fromClipId to the next clip on the main video track (crossfade, dip to black or white, wipe, slide, zoom); type cut removes it. blur is not available yet. all=true joins EVERY neighbouring pair of the main track with that type and length, leaving pairs too short for it as cuts — "a clean transition between the clips" is one call with all=true and no fromClipId. Do not build one with apply_commands, and do not move clips to make it fit.',
    input: z
      .object({
        ...projectRef,
        fromClipId: z.string().min(1).optional(),
        toClipId: z.string().min(1).optional(),
        all: z.boolean().default(false),
        type: z.enum([
          'cut',
          'crossfade',
          'dip_to_black',
          'dip_to_white',
          'wipe',
          'slide',
          'zoom',
          'blur',
        ]),
        durationSec: z.number().min(0.05).max(3).default(0.5),
      })
      .strict(),
    output: committed({
      /** The transition placed (with all=true, the first one), or null for a cut. */
      transitionId: z.string().nullable(),
      /** With all=true: how many boundaries were joined. */
      transitions: z.number().int().nonnegative().optional(),
    }),
  },
  apply_effect: {
    group: 'motion',
    commits: true,
    scope: 'project',
    access: 'operate',
    description:
      'Give a video or overlay clip a look: a filter (bw, vintage, vivid, cool, warm, noir, dream) or an effect (blur, tint, vignette, film_grain, dust, light_leaks, chromatic_aberration, vhs, pixelate, corner_radius, chroma_key) at a strength 0–1; remove takes it off.',
    input: z
      .object({
        ...projectRef,
        clipId: z.string().min(1),
        effect: lookEffectIdSchema,
        strength: z.number().min(0).max(1).default(0.6),
        color: z.string().max(32).optional(),
        remove: z.boolean().default(false),
      })
      .strict(),
    output: committed({ effects: z.array(z.string()) }),
  },
  draft_cut: {
    group: 'draft',
    commits: true,
    scope: 'project',
    access: 'operate',
    description:
      "Turn the project's footage and a goal into first cuts: reads every spoken line, picks and orders the strongest ones for the goal (a hook, a testimonial, a highlight, a story, a demo) at the target length, then captions and formats each cut. Finishing, each opt-in: music (a bed ducked under speech; musicPrompt sets its mood), hookTitle (a short headline over the opening), broll (cutaways from the pool's footage without speech over body lines) and brandCaptions (captions in the brand's type and colours) — turn them on unless the person asked for a bare cut. Variant A replaces this timeline (undoable); B, C… open as sibling projects. Returns a jobId — poll draft_cut_status.",
    input: z
      .object({
        ...projectRef,
        brief: z.string().min(1).max(2_000),
        kind: editorCutKindSchema.default('highlight'),
        targetDurationSec: z.number().min(5).max(180).default(30),
        variants: z.number().int().min(1).max(5).default(1),
        preset: platformExportPresetIdSchema.optional(),
        captions: z.boolean().default(true),
        sourceAssetIds: z
          .array(z.string())
          .max(20)
          .optional()
          .describe(
            'Omit to use enabled timeline videos. An explicit list is exclusive: selected timeline videos keep their pinned versions; new Library videos use their head version.',
          ),
        /** Finishing: a music bed under each cut, ducked under its speech. */
        music: z.boolean().default(false),
        /** The bed's mood; drawn from the brief when absent. */
        musicPrompt: z.string().max(300).optional(),
        /** Finishing: a short headline from each cut's hook as a hook title over its opening. */
        hookTitle: z.boolean().default(false),
        /** Finishing: cutaways from the pool's footage without speech over body and proof lines. */
        broll: z.boolean().default(false),
        /** Finishing: captions in the brand's type and colours. */
        brandCaptions: z.boolean().default(false),
      })
      .strict(),
    output: z.object({ jobId: z.string(), state: jobStateSchema }).strict(),
  },
  draft_cut_status: {
    group: 'draft',
    commits: false,
    scope: 'project',
    access: 'read',
    description:
      'Progress of a draft_cut; when completed, each variant with its project, length, angle and the lines it used.',
    input: z.object({ ...projectRef, jobId: z.string() }).strict(),
    output: z
      .object({
        jobId: z.string(),
        state: jobStateSchema,
        progress: z.number().min(0).max(1).optional(),
        phase: z.string().optional(),
        variants: z.array(videoEditorDraftVariantSchema).optional(),
        warnings: z.array(z.string()).optional(),
        error: z.string().optional(),
      })
      .strict(),
  },
  list_variants: {
    group: 'draft',
    commits: false,
    scope: 'project',
    access: 'read',
    description:
      'The sibling cuts drafted from the same brief as this project (A, B, C…), for switching between variants.',
    input: z.object({ ...projectRef }).strict(),
    output: z
      .object({
        brief: editorBriefSchema.optional(),
        variants: z.array(
          z
            .object({
              projectId: projectIdSchema,
              label: z.string(),
              title: z.string(),
              angle: z.string().optional(),
              durationSec: secSchema,
              editorPath: z.string(),
              current: z.boolean(),
            })
            .strict(),
        ),
      })
      .strict(),
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
      'Generate media from a quick start and optionally place it on the timeline; poll generate_status. Pictures and clips: create/restyle/edit image, storyboard or keyframes to video, 360 rotation (reference assets in refs). music_bed: an instrumental bed from prompt (mood, genre, tempo) on an audio track, as long as the timeline unless durationSec, ducked under speech unless duck=false. voiceover: prompt is the exact script to speak, voice the delivery (e.g. "warm, confident, Mexican Spanish"), placed on an audio track at place.atSec. headless_concept: a finished reel of the brand\'s approved cast made from concept (street-interview, pov, unpopular-opinion, problem-solution…) with prompt as the angle, placed as video.',
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
        /** voiceover: how it is spoken — voice, accent, pace, mood. */
        voice: z.string().max(300).optional(),
        /** music_bed: length in seconds; the timeline's length when absent. */
        durationSec: z.number().min(1).max(600).optional(),
        /** headless_concept: which concept makes the reel. */
        concept: headlessGrammarSchema.optional(),
        /** music_bed: dip under speech on the timeline. */
        duck: z.boolean().default(true),
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
