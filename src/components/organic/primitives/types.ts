import type { OrganicMediaStage, OrganicUgcSpec, PlannerComposition } from '@continuum/contracts';
import type { CalendarGenerationEvent } from '@/lib/organic/calendar-generation';
import type { OrganicPlatformKey } from '@/lib/organic/platforms';

export type { CalendarGenerationEvent, OrganicMediaStage };

export type OrganicPlatformTag = OrganicPlatformKey;

export type OrganicDraftStatus =
  | 'draft'
  | 'scheduled'
  | 'streaming'
  | 'failed'
  | 'placeholder'
  | 'published';

/**
 * One row of a fan-out group — "the same post" on one platform.
 *
 * The organic stack stays one-platform-per-draft-row: a multi-platform post is N sibling
 * rows sharing a `group_id`, each publishing through the unchanged single-platform path.
 * The planner collapses them into ONE card whose `platforms` is the union, and keeps the
 * per-row identities here so publish/approve can still address each row individually.
 */
export type OrganicDraftGroupMember = {
  /** organic_calendar_drafts.id — the row this platform publishes from. */
  backendDraftId: string;
  platform: OrganicPlatformTag;
  status: OrganicDraftStatus;
  /** Per-brand identity; siblings carry `<sourceClientKey>::<platform>`. */
  clientKey?: string;
};

export type OrganicCalendarDraft = {
  id: string;
  title: string;
  summary: string;
  timeLabel: string;
  dateLabel: string;
  status: OrganicDraftStatus;
  // Enrichment ladder (orthogonal to publish status): text_only -> storyboard_ready
  // -> realizing -> realized | failed. Authoritative value comes from the backend
  // media_stage column; the card lifecycle pill reads this, not ad-hoc media flags.
  mediaStage?: OrganicMediaStage;
  // Whether the backend row carries a generated placement (content_json). This is the
  // ladder's Copy signal. media_stage cannot answer it — a freshly pre-minted row is
  // stamped text_only while content_json is still null — and captionPreview is a proxy
  // that drifts (a user can type a caption into a draft the agent never generated).
  hasCopy?: boolean;
  platforms: OrganicPlatformTag[];
  format: string;
  objective: string;
  slideCount?: number;
  progress?: number;
  generationStage?: string;
  captionPreview: string;
  tags: string[];
  creativeDirectionPrompt?: string;
  thumbnailPrompt?: string;
  location?: string;
  mediaCount: number;
  seedTrendId?: string;
  // Provenance: "manual" = authored from scratch via the calendar + button;
  // "agent" / undefined = produced by the generation pipeline (legacy default).
  origin?: 'manual' | 'agent';
  // Non-null when this draft belongs to a bulk content plan ("planned" provenance).
  contentPlanId?: string | null;
  targetAccountId?: string;
  adjusted?: boolean;
  titleTopic?: string;
  target?: string;
  tone?: string;
  cta?: string;
  creativeIdea?: string;
  generationError?: string;
  generationAttempts?: number;
  backendDraftId?: string;
  /**
   * The row's `updated_at` as last read. Sent as the field-edit route's
   * optimistic-concurrency token so a stale tab cannot silently overwrite a
   * teammate's or the agent's newer edit — the write fails with `stale_draft`
   * instead, and the planner reconciles.
   */
  updatedAt?: string | null;
  // Immutable per-brand identity, minted once at create and carried across
  // FE<->BE so a draft is enriched in place (UPSERT on (brand_id, client_key))
  // instead of duplicated. Stable across refetches, unlike `id`.
  clientKey?: string;
  /** Non-null when this draft is one platform of a fanned-out multi-platform post. */
  groupId?: string | null;
  /**
   * Every row of this draft's group, in canonical platform order. Always at least the
   * draft's own row, so consumers never have to special-case "not grouped".
   */
  groupMembers?: OrganicDraftGroupMember[];
  /**
   * The published post's id on whatever platform it went out to. Canonical — the backend
   * writes `platform_post_id` for every platform and mirrors `instagram_post_id` only for
   * Instagram, so anything platform-agnostic must read this one.
   */
  platform_post_id?: string | null;
  /** Legacy Instagram mirror. Only ever set for Instagram posts; never for Facebook/LinkedIn. */
  instagram_post_id?: string | null;
  mediaSuggestion?: {
    provider?: string | null;
    model?: string | null;
    kind?: string | null;
    prompt?: string | null;
    width?: number | null;
    height?: number | null;
    assetUrl?: string | null;
    url?: string | null;
    signedUrl?: string | null;
    mimeType?: string | null;
    alt?: string | null;
    assetBase64?: string | null;
    bucket?: string | null;
    mediaStatus?: 'pending' | 'generating' | 'ready' | 'user_supplied' | 'skipped' | null;
    textReady?: boolean | null;
    blueprintReady?: boolean | null;
    /** Exact persisted storyboard revision required for final-media approval. */
    previewRevision?: string | null;
    /** Locked casting/product references reviewed before UGC scene generation. */
    ugc?: OrganicUgcSpec | null;
    audioConcept?: {
      audioMode?: string | null;
      trackSuggestion?: string | null;
      soundDesign?: string | null;
      voiceover?: string | null;
      notes?: string[] | null;
    } | null;
    hyperframe?: {
      generated?: boolean | null;
      compositionId?: string | null;
      bucket?: string | null;
      htmlPath?: string | null;
      coverImageUrl?: string | null;
      coverPath?: string | null;
      coverBase64?: string | null;
      mp4Bucket?: string | null;
      mp4Path?: string | null;
      mp4Url?: string | null;
      mp4Status?: 'pending' | 'ready' | 'failed' | null;
      error?: string | null;
      /** Legacy scene graph. Null on everything the composition agent writes. */
      spec?: unknown;
      /** Authored render size and length; `spec` no longer carries them. */
      width?: number | null;
      height?: number | null;
      durationSeconds?: number | null;
      /** Library assets embedded as hf-asset://, re-signed at render time. */
      sourceAssets?: Array<{ assetId: string; kind: 'image' | 'video' | 'audio' }> | null;
    } | null;
    // Persisted 512px Stage-2 blueprint storyboard preview frames. Durable
    // bucket+storagePath references; storageUrl is a transient signed value the
    // backend re-mints on every calendar load. Review-only — distinct from the
    // final publishingAssets. Render storageUrl directly; never base64.
    storyboard?: Array<{
      role?: string | null;
      bucket?: string | null;
      storagePath?: string | null;
      storageUrl?: string | null;
      format?: string | null;
      /** Which reel scene this panel belongs to — `role` cannot carry the join
       *  because several scenes share `role: 'body'`. Drives contact-sheet order. */
      sceneIndex?: number | null;
    }> | null;
    reel?: {
      generated?: boolean | null;
      url?: string | null;
      bucket?: string | null;
      signedUrl?: string | null;
      /** Poster frame for the video (library-derived thumbnail). */
      thumbnailUrl?: string | null;
      mimeType?: string | null;
      durationSec?: number | null;
      scenes?: Array<{
        index?: number | null;
        role?: 'hook' | 'body' | 'cta' | null;
        prompt?: string | null;
        captionText?: string | null;
        durationSec?: number | null;
        bucket?: string | null;
        clipUrl?: string | null;
        signedClipUrl?: string | null;
        assetId?: string | null;
        error?: string | null;
      }> | null;
      composition?: PlannerComposition | null;
      ugc?: OrganicUgcSpec | null;
      error?: string | null;
    } | null;
    assets?: Array<{
      role?: string | null;
      order?: number | null;
      provider?: string | null;
      model?: string | null;
      prompt?: string | null;
      width?: number | null;
      height?: number | null;
      assetUrl?: string | null;
      url?: string | null;
      signedUrl?: string | null;
      bucket?: string | null;
      generated?: boolean | null;
      assetBase64?: string | null;
      mimeType?: string | null;
      error?: string | null;
      generationContext?: {
        sourceAgent?: string | null;
        finalPrompt?: string | null;
        request?: {
          provider?: string | null;
          model?: string | null;
          imageSize?: string | null;
        } | null;
        placement?: {
          placementId?: string | null;
          dayId?: string | null;
          scheduledAt?: string | null;
        } | null;
        strategist?: {
          objective?: string | null;
          funnel?: string | null;
          funnelStage?: string | null;
          targetAudience?: string | null;
          tone?: string | null;
          angle?: string | null;
          postType?: string | null;
          postSize?: string | null;
        } | null;
        creativeDirection?: {
          title?: string | null;
          conceptTitle?: string | null;
          direction?: string | null;
          creativeDirection?: string | null;
          hook?: string | null;
          storyHook?: string | null;
          trendIntegration?: string | null;
          modes?: string[] | null;
          visualMode?: string | null;
          audioMode?: string | null;
          notes?: string | null;
          productionNotes?: string[] | null;
        } | null;
        trend?: {
          trendId?: string | null;
          seedSource?: 'trend' | 'question' | 'event' | 'manual' | null;
        } | null;
      } | null;
    }> | null;
    generationContext?: {
      sourceAgent?: string | null;
      finalPrompt?: string | null;
      request?: {
        provider?: string | null;
        model?: string | null;
        imageSize?: string | null;
      } | null;
      placement?: {
        placementId?: string | null;
        dayId?: string | null;
        scheduledAt?: string | null;
      } | null;
      strategist?: {
        objective?: string | null;
        funnel?: string | null;
        funnelStage?: string | null;
        targetAudience?: string | null;
        tone?: string | null;
        angle?: string | null;
        postType?: string | null;
        postSize?: string | null;
      } | null;
      creativeDirection?: {
        title?: string | null;
        conceptTitle?: string | null;
        direction?: string | null;
        creativeDirection?: string | null;
        hook?: string | null;
        storyHook?: string | null;
        trendIntegration?: string | null;
        modes?: string[] | null;
        visualMode?: string | null;
        audioMode?: string | null;
        notes?: string | null;
        productionNotes?: string[] | null;
      } | null;
      trend?: {
        trendId?: string | null;
        seedSource?: 'trend' | 'question' | 'event' | 'manual' | null;
      } | null;
    } | null;
  };
  publishingAssets?: Array<{
    role: string;
    kind: 'image' | 'video';
    slideIndex?: number;
    assetId?: string | null;
    bucket?: string | null;
    storagePath: string;
    storageUrl: string;
    mimeType?: string;
    width?: number;
    height?: number;
    generationContext?: unknown;
  }>;
  assetHints?: Array<{
    role: string;
    suggestion: string;
  }>;
  hashtags?: {
    high?: string[];
    medium?: string[];
    low?: string[];
  };
};

export type OrganicCalendarDay = {
  id: string;
  label: string;
  dateLabel: string;
  suggestedTimes: string[];
  slots: OrganicCalendarDraft[];
};

export type OrganicCalendarPostedContentSource = 'published_posts' | 'external';

export type OrganicCalendarPostedContent = {
  id: string;
  source: OrganicCalendarPostedContentSource;
  platform: OrganicPlatformTag;
  integrationAccountId?: string;
  externalPostId?: string;
  timestamp: string;
  dayId: string;
  timeLabel: string;
  title: string;
  caption?: string;
  permalink?: string;
  mediaType?: string;
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
};

export type OrganicCreationStepStatus = 'complete' | 'active' | 'upcoming';

export type OrganicCreationStep = {
  id: string;
  title: string;
  detail: string;
  status: OrganicCreationStepStatus;
};

export type OrganicTrend = {
  id: string;
  title: string;
  summary: string;
  momentum: 'rising' | 'stable' | 'cooling';
  tags: string[];
  platforms: OrganicPlatformTag[];
};

export type OrganicTrendGroup = {
  id: string;
  title: string;
  trends: OrganicTrend[];
};

export type OrganicTrendType = {
  id: string;
  label: string;
  groups: OrganicTrendGroup[];
};

export type OrganicDraftCreateRequest = {
  brandProfileId: string;
  userId: string;
  instagramAccountId: string;
  dayId?: string;
  trendIds?: string[];
  competitorContentUrl?: string;
  prompt?: string;
};

export type OrganicActivityItem = {
  id: string;
  actor: string;
  summary: string;
  timeLabel: string;
  highlight?: string;
};

export type OrganicEditorSlide = {
  id: string;
  label: string;
  gradient: string;
};

export type OrganicSeedDragPayload = {
  type: 'trend' | 'question' | 'event';
  trendId: string;
  title?: string;
};

export type StreamEvent = {
  id: string;
  type: CalendarGenerationEvent['type'];
  timestamp: string;
  data: CalendarGenerationEvent;
};

export type EventHistory = StreamEvent[];
