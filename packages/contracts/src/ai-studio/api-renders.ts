import { z } from 'zod';
import { apiRenderFitReportSchema, pixelBoxSchema, slotPlacementSchema } from './api-render-fit';
import { apiRenderJudgeSchema } from './api-render-judge';

export const API_RENDER_TEMPLATES_ROUTE = '/api/ai-studio/renders/templates';
export const API_RENDER_PREFLIGHT_ROUTE = '/api/ai-studio/renders/preflight';
export const API_RENDER_JOBS_ROUTE = '/api/ai-studio/renders/jobs';
export const API_RENDER_INPUT_SETS_ROUTE = '/api/ai-studio/renders/input-sets';
export const API_RENDER_BATCH_PREFLIGHT_ROUTE = '/api/ai-studio/renders/batch-preflight';
export const API_RENDER_BATCHES_ROUTE = '/api/ai-studio/renders/batches';
export const API_RENDER_ENVIRONMENTS_ROUTE = '/api/ai-studio/renders/environments';
export const API_RENDER_DESTINATIONS_ROUTE = '/api/ai-studio/renders/destinations';
export const API_RENDER_SLACK_CHANNELS_ROUTE = '/api/ai-studio/renders/destinations/slack-channels';

/**
 * A caller-facing variable name. Physical `f_<hash>` renderer field names are private
 * and must never cross this boundary in either direction.
 */
export const apiRenderVariableKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/)
  .refine((key) => !/^f_[a-z0-9]+$/i.test(key), {
    message: 'Physical renderer field names are private',
  });

/**
 * The one variable key both sides agree on without negotiating it. A template that
 * declares it is asking for the BRAND's mark, so Continuum fills it and the caller
 * may not.
 *
 * Reserved rather than merely defaulted: a caller-supplied value would render some
 * other brand's logo under this brand's binding, and silently overriding one would
 * render something the caller never asked for. Refuse — the same discipline as
 * `brand_id` vs `delivery.brand_id`, which agree or fail rather than taking a
 * precedence rule.
 *
 * The handshake is the template field's TITLE: template-forge names it so that
 * `publicVariableKey()` normalises to exactly this string.
 */
export const WATERMARK_LOGO_VARIABLE_KEY = 'watermark_logo';

/**
 * The product-centric role vocabulary, byte-identical to RENDER_REGISTRY_CONTRACT.md §7 and to
 * the fleet's own two copies (`nocobase-plugin-template-forge/src/server/slotRoles.ts`,
 * `render-request-contract/src/productRecord.js`). A role is what a slot MEANS, independent of
 * what the designer called the layer — it is what lets one brand's product record fill any
 * template without either side knowing the other's field names.
 *
 * Copied rather than imported because the authority lives in another repo on the fleet. A
 * closed enum on this side is the point: a role the fleet invents and this build does not know
 * should fail loudly here, not render as an unlabelled group.
 */
export const apiRenderSlotRoleSchema = z.enum([
  'sku',
  'external_id',
  'name',
  'description',
  'quantity',
  'price',
  'currency',
  'old_price',
  'discount_percent',
  'promo_start',
  'promo_end',
  'promo_dates',
  'product_image',
  'brand_logo',
  'background_image',
  'background_color',
  'legal_text',
  'color_primary',
  'color_secondary',
  'color_accent',
  'color_text',
  'cta_text',
  'landing_url',
]);
export type ApiRenderSlotRole = z.infer<typeof apiRenderSlotRoleSchema>;

export const apiRenderVariableKindSchema = z.enum([
  'text',
  'number',
  'boolean',
  'image',
  'video',
  'enum',
  // A colour is its own kind, not a string that happens to look like one.
  //
  // The forge has always emitted it — `KIND_BY_AE_TYPE` maps AE's `color` aeType straight to
  // `color`, and the render contract types it `^#?[0-9A-Fa-f]{6}$` — but this enum had no member
  // for it, so every `color_primary` / `background_color` slot arrived as `text` and rendered as
  // a free-text input. A person then types `magenta` into it, which is one of the six pre-render
  // row guards (`invalid_color`) and a real 2026-09-05 live failure.
  'color',
]);
export type ApiRenderVariableKind = z.infer<typeof apiRenderVariableKindSchema>;

export const apiRenderVariableSchema = z
  .object({
    key: apiRenderVariableKeySchema,
    label: z.string().min(1),
    kind: apiRenderVariableKindSchema,
    required: z.boolean(),
    multiple: z.boolean().default(false),
    accept: z.array(z.string().min(1)).default([]),
    options: z.array(z.string()).default([]),
    description: z.string().nullable().default(null),
    // The server fills this one: do not send it, and do not render an input for it.
    // Distinct from `required`, which says a value must reach the renderer — a
    // reserved variable is both required AND caller-forbidden, so a client that keys
    // off `required` alone will either refuse to render or offer the wrong control.
    // Defaulted so a server too old to emit it stays contract-valid.
    reserved: z.boolean().default(false),

    // --- Template Forge facts -------------------------------------------------
    //
    // Every field below is OPTIONAL and DEFAULTED, and none of them enter `contractHash`. The
    // hash is built from a separate list in the backend's adapter, so a server that starts
    // emitting these does not 409 a single saved input set or in-flight confirmation. That is
    // deliberate: they describe a variable, they do not change what it accepts.
    //
    // They are absent entirely on the legacy-reflection arm, which knows a field's type and
    // nothing about what it means.

    /** What this slot MEANS. Null when nobody has assigned a role. */
    role: apiRenderSlotRoleSchema.nullable().default(null),
    /** Who said so. `declared` is the operator's contract, `human` outranks `agent`. */
    roleSource: z.enum(['declared', 'agent', 'human']).nullable().default(null),
    /**
     * The designer's own composed length in the tightest comp — NOT a limit After Effects
     * enforces. It is the only honest budget available without a render, and the number a
     * field can show a live count against.
     */
    charBudget: z.number().int().nonnegative().nullable().default(null),
    /** Which delivery comps carry this slot. One slot in seven ratios is one slot. */
    comps: z.array(z.string()).default([]),
    /** The designer's own value, when the parse read one. Useful as a placeholder. */
    sample: z.string().nullable().default(null),
    /** Where this slot lands, so a picked asset can be placed before a render is spent. */
    placement: slotPlacementSchema.nullable().default(null),
  })
  .strict();
export type ApiRenderVariable = z.infer<typeof apiRenderVariableSchema>;

export const apiRenderTemplateSummarySchema = z
  .object({
    key: z.string().min(1),
    name: z.string().min(1),
    environment: z.string().min(1),
    contractVersion: z.string().min(1),
    contractHash: z.string().min(1),
    contractSource: z.enum(['template_forge', 'legacy_reflection']),
    outputKinds: z.array(z.enum(['image', 'video'])).min(1),
    variableCount: z.number().int().nonnegative(),
    previewUrl: z.string().url().nullable(),
    updatedAt: z.string().nullable(),

    // --- Template Forge facts, all optional and none of them hashed -------------
    /** Ratio labels the source ships, e.g. ['1:1','4:5','9:16']. Empty on the legacy arm. */
    ratios: z.array(z.string()).default([]),
    /** The Library asset this template was promoted from, when the join resolves. */
    sourceAssetId: z.string().uuid().nullable().default(null),
    /**
     * How many faces this template needs that the brand does NOT hold. Null means nobody has
     * checked — which is a different thing from zero, and a card that showed them the same
     * would report an unread template as ready.
     */
    fontsMissing: z.number().int().nonnegative().nullable().default(null),
    /**
     * What a person calls this template: the Library asset's title, else a prettified build name
     * (`templateDisplayName`). Null from a server too old to resolve one — fall back to `name`.
     */
    displayName: z.string().nullable().default(null),
  })
  .strict();
export type ApiRenderTemplateSummary = z.infer<typeof apiRenderTemplateSummarySchema>;

/** A face the template needs, against what the brand actually holds. */
export const apiRenderTemplateFontSchema = z
  .object({ family: z.string().min(1), layers: z.number().int().nonnegative(), held: z.boolean() })
  .strict();
export type ApiRenderTemplateFont = z.infer<typeof apiRenderTemplateFontSchema>;

// --- Output settings (frame rate, audio, video quality) ---------------------------------------
//
// One shape for the template default, a per-output override and a per-render override. Every
// field is optional; an unset field keeps the fleet's own default. The render fleet re-sanitizes
// by whitelist, so these bounds are an early, readable refusal — not the last line.
// Container rules (pcm and prores are MOV only, crf is MP4 only) need the output's container,
// which this schema does not know; the forge validator and the fleet apply them.

const rationalFps = /^(\d+)\/(\d+)$/;
export const encodeFpsSchema = z.union([
  z.literal('comp'),
  z.string().refine(
    (value) => {
      const match = rationalFps.exec(value);
      if (!match) return false;
      const rate = Number(match[1]) / Number(match[2]);
      return Number(match[2]) > 0 && rate > 0 && rate <= 120;
    },
    { message: 'A frame rate is "comp", "N/D", or a number in (0, 120]' },
  ),
  z.number().gt(0).lte(120),
]);

export const encodeSettingsSchema = z
  .object({
    fps: encodeFpsSchema.optional(),
    audio: z
      .object({
        enabled: z.boolean().optional(),
        codec: z.enum(['aac', 'pcm_s16le', 'pcm_s24le']).optional(),
        bitrate: z
          .string()
          .regex(/^\d+k$/)
          .refine((value) => Number.parseInt(value, 10) >= 32 && Number.parseInt(value, 10) <= 512, {
            message: 'Bitrate is 32k to 512k',
          })
          .optional(),
        sampleRate: z.union([z.literal(44100), z.literal(48000)]).optional(),
        channels: z.number().int().min(1).max(8).optional(),
      })
      .strict()
      .optional(),
    video: z
      .object({
        crf: z.number().int().min(10).max(40).optional(),
        pixFmt: z
          .enum(['yuv420p', 'yuv422p', 'yuv444p', 'yuva444p12le', 'yuv422p10le', 'yuv444p10le'])
          .optional(),
        proresProfile: z.enum(['4444', '4444xq', 'hq', 'standard', 'lt', 'proxy']).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type EncodeSettings = z.infer<typeof encodeSettingsSchema>;

/** The template-level block the forge stores: a default plus overrides keyed by COMP NAME. */
export const encodeBlockSchema = z
  .object({
    default: encodeSettingsSchema.optional(),
    outputs: z.record(z.string().min(1), encodeSettingsSchema).optional(),
  })
  .strict();
export type EncodeBlock = z.infer<typeof encodeBlockSchema>;

/**
 * The same block keyed by PUBLIC output id — what a caller reads and sends. Comp names stay
 * server-side beside the physical gate fields; the backend re-keys at the boundary.
 */
export const apiRenderEncodeOverrideSchema = encodeBlockSchema;
export type ApiRenderEncodeOverride = EncodeBlock;

/** Every settable leaf, as a dotted path. The one list the merge, the UI and a clear agree on. */
export const ENCODE_SETTING_KEYS = [
  'fps',
  'audio.enabled',
  'audio.codec',
  'audio.bitrate',
  'audio.sampleRate',
  'audio.channels',
  'video.crf',
  'video.pixFmt',
  'video.proresProfile',
] as const;
export type EncodeSettingKey = (typeof ENCODE_SETTING_KEYS)[number];
export type FlatEncodeSettings = Partial<Record<EncodeSettingKey, string | number | boolean>>;

export function flattenEncodeSettings(settings: EncodeSettings | null | undefined): FlatEncodeSettings {
  const flat: FlatEncodeSettings = {};
  for (const key of ENCODE_SETTING_KEYS) {
    const [group, leaf] = key.split('.') as [string, string | undefined];
    const node = (settings as Record<string, unknown> | null | undefined)?.[group];
    const value = leaf === undefined ? node : (node as Record<string, unknown> | undefined)?.[leaf];
    if (value !== undefined) flat[key] = value as string | number | boolean;
  }
  return flat;
}

/** `undefined` when nothing is set, so an empty result is omitted rather than sent as `{}`. */
export function unflattenEncodeSettings(flat: FlatEncodeSettings): EncodeSettings | undefined {
  const settings: Record<string, unknown> = {};
  for (const key of ENCODE_SETTING_KEYS) {
    if (flat[key] === undefined) continue;
    const [group, leaf] = key.split('.') as [string, string | undefined];
    if (leaf === undefined) settings[group] = flat[key];
    else settings[group] = { ...(settings[group] as object | undefined), [leaf]: flat[key] };
  }
  return Object.keys(settings).length ? (settings as EncodeSettings) : undefined;
}

/** Later layers win per leaf — `audio` and `video` merge key by key, never wholesale. */
export const mergeEncodeSettings = (
  ...layers: Array<EncodeSettings | null | undefined>
): EncodeSettings | undefined =>
  unflattenEncodeSettings(Object.assign({}, ...layers.map(flattenEncodeSettings)));

/** Drops empty scopes so "nothing set" has exactly one spelling: `undefined`. */
export function compactEncodeBlock(block: EncodeBlock | undefined): EncodeBlock | undefined {
  if (!block) return undefined;
  const byDefault = mergeEncodeSettings(block.default);
  const outputs = Object.fromEntries(
    Object.entries(block.outputs ?? {}).flatMap(([id, settings]) => {
      const merged = mergeEncodeSettings(settings);
      return merged ? [[id, merged]] : [];
    }),
  );
  const compact: EncodeBlock = {
    ...(byDefault ? { default: byDefault } : {}),
    ...(Object.keys(outputs).length ? { outputs } : {}),
  };
  return Object.keys(compact).length ? compact : undefined;
}

/** `MP4 Video (RGB)` → `mp4`. Only video containers take settings; stills are null. */
export function encodeContainerOf(mediaType: string | null | undefined): 'mp4' | 'mov' | null {
  const container = mediaType?.trim().split(/\s+/)[0]?.toLowerCase();
  return container === 'mp4' || container === 'mov' ? container : null;
}

/** A delivery comp and every measured slot box in it — enough to DRAW the layout. */
export const apiRenderTemplateLayoutSchema = z
  .object({
    comp: z
      .object({
        name: z.string(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      })
      .strict(),
    boxes: z.array(
      z
        .object({
          key: z.string(),
          label: z.string(),
          box: pixelBoxSchema,
          role: apiRenderSlotRoleSchema.nullable().default(null),
          kind: apiRenderVariableKindSchema.nullable().default(null),
        })
        .strict(),
    ),
  })
  .strict();
export type ApiRenderTemplateLayout = z.infer<typeof apiRenderTemplateLayoutSchema>;

export const apiRenderTemplateContractSchema = z
  .object({
    template: apiRenderTemplateSummarySchema,
    variables: z.array(apiRenderVariableSchema),

    /**
     * Which faces this template needs and whether the brand holds them.
     *
     * Empty means nobody could check — the template has no parsed source — and that is not the
     * same as "no fonts needed". A template missing a face still renders: it finishes and hands
     * back a frame with the text in a fallback, which looks exactly like success.
     */
    fonts: z.array(apiRenderTemplateFontSchema).default([]),
    /**
     * The delivery comp and every measured row in it, so a caller can DRAW the layout and place
     * a picked asset in it before spending a render. Null when the template has no parsed source.
     */
    layout: apiRenderTemplateLayoutSchema.nullable().default(null),
    /**
     * Where the LIVE template and its stored contract disagree, straight from the forge. A
     * template whose fields moved under its contract is one whose renders quietly stop matching
     * what a caller filled in, so it is reported rather than reconciled here.
     */
    divergence: z.array(z.string()).default([]),
    outputs: z
      .array(
        z
          .object({
            id: z.string().min(1),
            label: z.string().min(1),
            ratio: z.string().nullable(),
            /** The encoder container, e.g. `MP4 Video (RGB)`. Absent on an older forge. */
            mediaType: z.string().nullable().optional(),
            /** The comp's own rate — what "Match comp" resolves to. */
            frameRate: z.number().positive().nullable().optional(),
            /** Effective settings for this output (defaults ⊕ stored). Null for stills. */
            encode: encodeSettingsSchema.nullable().optional(),
            /**
             * This output's own comp and boxes. The same slot is a different rectangle in 1:1 than
             * in 9:16, so a per-format preview needs the layout of the format it draws.
             */
            layout: apiRenderTemplateLayoutSchema.nullable().optional(),
          })
          .strict(),
      )
      .default([]),
    /**
     * The template's stored output settings, keyed by public output id, and the fleet defaults
     * per container. Absent when the forge is too old to publish them.
     */
    encode: z
      .object({
        stored: apiRenderEncodeOverrideSchema.nullable(),
        defaults: z.object({ mp4: encodeSettingsSchema, mov: encodeSettingsSchema }).strict(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type ApiRenderTemplateContract = z.infer<typeof apiRenderTemplateContractSchema>;

/**
 * Whether the render fleet will honour this brand's workspace at all.
 *
 * Independent of having a binding: a brand can be correctly bound and still be
 * unable to render, because the workspace allowlist lives on the render fleet
 * (the FlowStream `CONTINUUM_RENDER_APPS` variable), not in Supabase.
 * `env_plane_undeployed` is the state that most needs surfacing — the fleet does
 * not reject the request, it renders it against the shared workspace's
 * templates instead, which looks like success.
 */
export const apiRenderWorkspaceStatusSchema = z
  .object({
    workspace: z.string(),
    renderEligible: z.boolean(),
    state: z.enum(['eligible', 'not_allowlisted', 'env_plane_undeployed', 'unknown']),
    detail: z.string(),
  })
  .strict();
export type ApiRenderWorkspaceStatus = z.infer<typeof apiRenderWorkspaceStatusSchema>;

/**
 * One environment this brand can render into.
 *
 * A brand may hold several enabled bindings — `media.render_workspace_bindings` has always
 * modelled that — and until now exactly one of them, the default, was reachable and none of
 * them were visible. `status` is the same eligibility verdict the template list already
 * carried, per environment, because "which workspace am I in" and "will the fleet honour it"
 * are the same question asked twice.
 */
export const apiRenderEnvironmentSchema = z
  .object({
    bindingId: z.string().uuid(),
    workspace: z.string().min(1),
    environmentKey: z.string(),
    clientKey: z.string(),
    isDefault: z.boolean(),
    status: apiRenderWorkspaceStatusSchema,
  })
  .strict();
export type ApiRenderEnvironment = z.infer<typeof apiRenderEnvironmentSchema>;

export const apiRenderEnvironmentListResponseSchema = z
  .object({ items: z.array(apiRenderEnvironmentSchema) })
  .strict();
export type ApiRenderEnvironmentListResponse = z.infer<
  typeof apiRenderEnvironmentListResponseSchema
>;

export const apiRenderTemplateListResponseSchema = z
  .object({
    items: z.array(apiRenderTemplateSummarySchema),
    nextCursor: z.string().nullable(),
    // Optional so an older server stays contract-valid against a newer client.
    workspace: apiRenderWorkspaceStatusSchema.optional(),
  })
  .strict();
export type ApiRenderTemplateListResponse = z.infer<typeof apiRenderTemplateListResponseSchema>;

/**
 * A durable Library coordinate for a media variable.
 *
 * `versionId` is OPTIONAL because a caller frequently holds an asset id without the
 * exact version: a node stamped by a producer that only carried the asset id, a
 * Library asset whose `head_version_id` was never materialized, or a slot filled
 * straight from the Library picker. Refusing those made the canvas say "needs a
 * Library asset" about an asset that was already in the Library.
 *
 * Omitting it is not a loosening of the version pin. Preflight resolves the head
 * version server-side and freezes the exact `{assetId, versionId}` into the signed
 * confirmation, so a render is still reproducible against one immutable version —
 * the same way the reserved `watermark_logo` pin has always been resolved.
 */
export const pinnedRenderAssetSchema = z
  .object({
    assetId: z.string().uuid(),
    versionId: z.string().uuid().optional(),
  })
  .strict();
export type PinnedRenderAsset = z.infer<typeof pinnedRenderAssetSchema>;

/**
 * How many pins one `multiple` media variable may carry. Named rather than inlined
 * because the canvas enforces the same number as a handle connection limit — two
 * copies of it would let the graph accept an edge the wire contract then refuses.
 */
export const API_RENDER_MEDIA_LIST_MAX = 20;

export const apiRenderInputValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  pinnedRenderAssetSchema,
  z.array(pinnedRenderAssetSchema).min(1).max(API_RENDER_MEDIA_LIST_MAX),
]);
export type ApiRenderInputValue = z.infer<typeof apiRenderInputValueSchema>;

/** A new ad in an ad set. `action` defaults so a pre-union `{adAccountId, campaignId, adsetId}` still parses. */
export const apiRenderDeliveryCreateTargetSchema = z
  .object({
    action: z.literal('create').default('create'),
    adAccountId: z.string().min(1),
    campaignId: z.string().min(1),
    campaignName: z.string().min(1).optional(),
    adsetId: z.string().min(1),
    adsetName: z.string().min(1).optional(),
    adStatus: z.literal('PAUSED').default('PAUSED'),
  })
  .strict();

/**
 * Swap the creative on an existing ad. The delivery plugin replaces with exactly ONE file, so a
 * record carrying this must name exactly one output (`replaceNeedsOneOutput`).
 * `expectedCreativeId` is the creative the person saw when they picked the ad — a stale pick is
 * refused rather than overwriting someone else's swap.
 */
export const apiRenderDeliveryReplaceTargetSchema = z
  .object({
    action: z.literal('replace'),
    adAccountId: z.string().min(1),
    campaignId: z.string().min(1),
    campaignName: z.string().min(1).optional(),
    adsetId: z.string().min(1),
    adsetName: z.string().min(1).optional(),
    adId: z.string().min(1),
    adName: z.string().min(1).optional(),
    adStatus: z.enum(['PAUSED', 'ACTIVE']).optional(),
    expectedCreativeId: z.string().min(1).optional(),
  })
  .strict();

// A plain union, not a discriminated one: the create arm's `action` is defaulted, and a
// discriminated union refuses an input with no discriminator — which is every pre-union payload.
export const apiRenderDeliveryTargetSchema = z.union([
  apiRenderDeliveryCreateTargetSchema,
  apiRenderDeliveryReplaceTargetSchema,
]);
export type ApiRenderDeliveryTarget = z.infer<typeof apiRenderDeliveryTargetSchema>;

const REPLACE_NEEDS_ONE_OUTPUT = 'A replace delivery swaps one creative, so it needs exactly one outputId';

/** replace ⇒ exactly one output. Shared by the single and batch preflight requests. */
function replaceNeedsOneOutput(
  delivery: ApiRenderDeliveryTarget | undefined,
  outputIds: string[] | undefined,
): boolean {
  return delivery?.action !== 'replace' || outputIds?.length === 1;
}

export const apiRenderVariableMapSchema = z.record(
  apiRenderVariableKeySchema,
  apiRenderInputValueSchema,
);
export type ApiRenderVariableMap = z.infer<typeof apiRenderVariableMapSchema>;

/**
 * Variables come from exactly one place: supplied inline, or read from a saved input
 * set. Accepting both and picking one would mean silently rendering something the
 * caller did not ask for — the same reason `brand_id` and `delivery.brand_id` must
 * agree rather than take a precedence rule.
 */
const oneVariableSource = (value: { variables?: unknown; inputSetId?: unknown }) =>
  (value.variables === undefined) !== (value.inputSetId === undefined);
const oneVariableSourceMessage = {
  message: 'Supply either variables or inputSetId, never both and never neither',
};

/**
 * Which environment to render into.
 *
 * Optional, and omitting it keeps today's behaviour exactly: the brand's enabled DEFAULT
 * binding. Naming one is how a brand with several enabled workspaces picks. It is not a
 * loosening — the binding is still resolved server-side against this brand, frozen into the
 * signed confirmation, and re-checked at confirm time by `assertBindingUnchanged`.
 */
const bindingIdField = z.string().uuid().optional();

export const apiRenderPreflightRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    bindingId: bindingIdField,
    templateKey: z.string().min(1),
    contractHash: z.string().min(1),
    variables: apiRenderVariableMapSchema.optional(),
    inputSetId: z.string().uuid().optional(),
    // Optional on purpose. A render that goes to the brand's own media library and
    // nowhere else is the common case; requiring a delivery block forced every caller
    // to name a live Meta campaign and ad set — and made preflight validate them
    // against the Graph API — just to produce a file.
    delivery: apiRenderDeliveryTargetSchema.optional(),
    label: z.string().trim().min(1).max(200).optional(),
    renderSetId: z.string().uuid().optional(),
    renderSetRowId: z.string().uuid().optional(),
    expectedRenderSetRevision: z.number().int().nonnegative().optional(),
    rootRowId: z.string().uuid().optional(),
    parentRowId: z.string().uuid().nullable().optional(),
    outputIds: z.array(z.string().min(1)).min(1).optional(),
    /** Per-render output settings, keyed by public output id. Pinned into the signed trigger. */
    encode: apiRenderEncodeOverrideSchema.optional(),
  })
  .strict()
  .refine(oneVariableSource, oneVariableSourceMessage)
  .refine((value) => replaceNeedsOneOutput(value.delivery, value.outputIds), {
    message: REPLACE_NEEDS_ONE_OUTPUT,
    path: ['outputIds'],
  });
export type ApiRenderPreflightRequest = z.infer<typeof apiRenderPreflightRequestSchema>;

export const apiRenderInputSetSchema = z
  .object({
    id: z.string().uuid(),
    brandId: z.string().uuid(),
    templateKey: z.string().min(1),
    contractHash: z.string().min(1),
    name: z.string().min(1),
    variables: apiRenderVariableMapSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type ApiRenderInputSet = z.infer<typeof apiRenderInputSetSchema>;

export const apiRenderInputSetListResponseSchema = z
  .object({ items: z.array(apiRenderInputSetSchema), nextCursor: z.string().nullable() })
  .strict();
export type ApiRenderInputSetListResponse = z.infer<typeof apiRenderInputSetListResponseSchema>;

export const apiRenderCreateInputSetRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    templateKey: z.string().min(1),
    contractHash: z.string().min(1),
    name: z.string().trim().min(1).max(200),
    variables: apiRenderVariableMapSchema,
  })
  .strict();
export type ApiRenderCreateInputSetRequest = z.infer<typeof apiRenderCreateInputSetRequestSchema>;

export const apiRenderUpdateInputSetRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    name: z.string().trim().min(1).max(200).optional(),
    variables: apiRenderVariableMapSchema.optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.variables !== undefined, {
    message: 'Update at least one of name or variables',
  });
export type ApiRenderUpdateInputSetRequest = z.infer<typeof apiRenderUpdateInputSetRequestSchema>;

export const apiRenderBatchRecordSchema = z
  .object({
    label: z.string().trim().min(1).max(200).optional(),
    variables: apiRenderVariableMapSchema.optional(),
    inputSetId: z.string().uuid().optional(),
    renderSetId: z.string().uuid().optional(),
    renderSetRowId: z.string().uuid().optional(),
    expectedRenderSetRevision: z.number().int().nonnegative().optional(),
    rootRowId: z.string().uuid().optional(),
    parentRowId: z.string().uuid().nullable().optional(),
    outputIds: z.array(z.string().min(1)).min(1).optional(),
    encode: apiRenderEncodeOverrideSchema.optional(),
    /** This record's own delivery. Wins over the batch-level `delivery`; never merged with it. */
    delivery: apiRenderDeliveryTargetSchema.optional(),
  })
  .strict()
  .refine(oneVariableSource, oneVariableSourceMessage);
export type ApiRenderBatchRecord = z.infer<typeof apiRenderBatchRecordSchema>;

export const apiRenderBatchPreflightRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    bindingId: bindingIdField,
    templateKey: z.string().min(1),
    contractHash: z.string().min(1),
    delivery: apiRenderDeliveryTargetSchema.optional(),
    records: z.array(apiRenderBatchRecordSchema).min(1).max(50),
    /**
     * Post each finished render to this brand Slack destination. Here, not on createBatch, so the
     * confirmation token covers it: a destination swapped after review is a different request.
     */
    slack: z.object({ destinationId: z.string().uuid() }).strict().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    value.records.forEach((record, index) => {
      if (!replaceNeedsOneOutput(record.delivery ?? value.delivery, record.outputIds)) {
        ctx.addIssue({
          code: 'custom',
          message: REPLACE_NEEDS_ONE_OUTPUT,
          path: ['records', index, 'outputIds'],
        });
      }
    });
  });
export type ApiRenderBatchPreflightRequest = z.infer<typeof apiRenderBatchPreflightRequestSchema>;

export const apiRenderCreateJobRequestSchema = z
  .object({
    confirmationToken: z.string().min(1),
  })
  .strict();
export type ApiRenderCreateJobRequest = z.infer<typeof apiRenderCreateJobRequestSchema>;

export const apiRenderOutputSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(['image', 'video']),
    fileName: z.string().min(1),
    mimeType: z.string().min(1),
    url: z.string().url(),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
    // The library asset this output was saved as. Null while the ingest is still in
    // flight, or if it failed — a render is not held back by its library copy.
    // Together the pair is a `pinnedRenderAsset`, so an output can be fed straight
    // back in as the input to the next render.
    assetId: z.string().uuid().nullable().default(null),
    versionId: z.string().uuid().nullable().default(null),
  })
  .strict();
export type ApiRenderOutput = z.infer<typeof apiRenderOutputSchema>;

export const apiRenderDeliveryReceiptSchema = z
  .object({
    status: z.enum(['pending', 'published', 'error', 'dropped']),
    adId: z.string().nullable(),
    creativeId: z.string().nullable(),
    reason: z.string().nullable(),
    publishedAt: z.string().nullable(),
  })
  .strict();

export const apiRenderSlackDeliverySchema = z
  .object({
    destinationId: z.string().uuid(),
    channelName: z.string(),
    status: z.enum(['pending', 'posted', 'error', 'skipped']),
    permalink: z.string().url().nullish(),
    reason: z.string().nullish(),
    postedAt: z.string().nullish(),
  })
  .strict();
export type ApiRenderSlackDelivery = z.infer<typeof apiRenderSlackDeliverySchema>;

export const apiRenderJobApprovalSchema = z
  .object({ status: z.string().min(1), decidedAt: z.string().nullish() })
  .strict();
export type ApiRenderJobApproval = z.infer<typeof apiRenderJobApprovalSchema>;

export const apiRenderJobSchema = z
  .object({
    id: z.string().uuid(),
    brandId: z.string().uuid(),
    templateKey: z.string().min(1),
    templateName: z.string().min(1),
    contractHash: z.string().min(1),
    taskUid: z.string().nullable(),
    status: z.enum(['submitting', 'queued', 'rendering', 'finished', 'failed']),
    // True means the fleet watermarks the output — every render Continuum submits
    // today. Carried on the wire so the UI states the fact instead of assuming it,
    // and so a future unwatermarked production mode cannot ship invisibly. Defaulted
    // because a server too old to emit it is one that only produced test renders.
    test: z.boolean().default(true),
    outputs: z.array(apiRenderOutputSchema),
    delivery: z.array(apiRenderDeliveryReceiptSchema),
    error: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    label: z.string().nullable().default(null),
    renderRequestId: z.string().uuid().nullable().default(null),
    renderSetId: z.string().uuid().nullable().default(null),
    renderSetRowId: z.string().uuid().nullable().default(null),
    rootRowId: z.string().uuid().nullable().default(null),
    parentRowId: z.string().uuid().nullable().default(null),
    renderSetName: z.string().nullable().default(null),
    labelPath: z.array(z.string()).default([]),
    renderSetRevision: z.number().int().nonnegative().nullable().default(null),
    templateSource: z
      .object({
        assetId: z.string().uuid(),
        versionId: z.string().uuid(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/i),
      })
      .strict()
      .nullable()
      .default(null),

    /** Which environment this job was prepared against — the binding frozen into its token. */
    environment: z.string().nullable().default(null),
    /**
     * The deterministic placement check, computed at preflight and frozen here.
     *
     * Frozen rather than recomputed because it is what decides whether the finished frame goes
     * to the judge, and that decision must not depend on a template or an asset changing while
     * the render was in the queue.
     */
    fit: apiRenderFitReportSchema.nullable().default(null),
    /**
     * The judge's verdict on the finished frame, when the fit check escalated it. Null means
     * either the frame has not finished or nothing needed judging — `fit.escalate` says which.
     */
    judge: apiRenderJudgeSchema.nullable().default(null),
    /** Where this job was asked to deliver, with the names resolved at preflight. Null = Library only. */
    deliveryTarget: apiRenderDeliveryTargetSchema.nullable().default(null),
    /** The Slack post for this job. Null when no destination was chosen. */
    slackDelivery: apiRenderSlackDeliverySchema.nullable().default(null),
    /** The Meta approval this job's delivery is parked on (`render_approvals`). Null when none. */
    approval: apiRenderJobApprovalSchema.nullable().default(null),
  })
  .strict();
export type ApiRenderJob = z.infer<typeof apiRenderJobSchema>;

export const apiRenderJobListQuerySchema = z
  .object({
    brandId: z.string().uuid(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).max(500).optional(),
    renderSetId: z.string().uuid().optional(),
    templateKey: z.string().min(1).optional(),
  })
  .strict();
export type ApiRenderJobListQuery = z.infer<typeof apiRenderJobListQuerySchema>;

export const apiRenderJobListResponseSchema = z
  .object({
    items: z.array(apiRenderJobSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();
export type ApiRenderJobListResponse = z.infer<typeof apiRenderJobListResponseSchema>;

export const apiRenderCallbackSchema = z
  .object({
    event: z.enum(['render.finished', 'render.error']),
    taskUID: z.string().min(1),
    render_status: z.enum(['finished', 'error']),
    request_id: z.string().nullable().optional(),
    assets: z.array(z.record(z.string(), z.unknown())).default([]),
    timestamp: z.number().int(),
  })
  .passthrough();
export type ApiRenderCallback = z.infer<typeof apiRenderCallbackSchema>;

export const resolvedRenderTargetSchema = z
  .object({
    adAccountId: z.string().min(1),
    campaignId: z.string().min(1),
    campaignName: z.string().min(1),
    adsetId: z.string().min(1),
    adsetName: z.string().min(1),
    adStatus: z.literal('PAUSED'),
  })
  .strict();

export const apiRenderPreflightResponseSchema = z
  .object({
    confirmationToken: z.string().min(1),
    confirmationHash: z.string().regex(/^[a-f0-9]{64}$/),
    expiresAt: z.string(),
    template: apiRenderTemplateSummarySchema,
    target: resolvedRenderTargetSchema.nullable(),
    inputKeys: z.array(z.string()),
    effects: z.literal('none'),
    // Mirrors the `test` flag frozen into the signed trigger — see apiRenderJobSchema.
    test: z.boolean().default(true),
    // The exact brand-logo pin frozen into the signed confirmation, when this
    // template declares `watermark_logo`. Echoed so the UI and a bench can SEE what
    // was locked rather than infer it from `inputKeys` — a key name proves a slot was
    // filled, not which asset filled it. Null when the template has no such slot.
    watermarkLogo: pinnedRenderAssetSchema.nullable().default(null),
    /**
     * The server's own placement check over the pinned assets. Echoed so the canvas shows the
     * verdict that was actually frozen rather than the one the browser computed while typing —
     * they agree in the ordinary case, and when they do not the server's is the one that ran.
     */
    fit: apiRenderFitReportSchema.nullable().default(null),
    guardrails: z
      .array(
        z
          .object({
            code: z.enum([
              'BRAND_COLOR_OUTSIDE_PALETTE',
              'BRAND_PALETTE_UNKNOWN',
              'TEMPLATE_FONT_MISSING',
              'FONT_INVENTORY_UNKNOWN',
            ]),
            severity: z.enum(['block', 'unknown']),
            message: z.string().min(1),
            variableKey: z.string().min(1).optional(),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();
export type ApiRenderPreflightResponse = z.infer<typeof apiRenderPreflightResponseSchema>;

export const apiRenderReadinessFindingSchema = z
  .object({
    code: z.string().min(1),
    severity: z.enum(['block', 'warn', 'unknown']),
    message: z.string().min(1),
    variableKey: z.string().min(1).optional(),
    rowIndexes: z.array(z.number().int().nonnegative()).min(1),
  })
  .strict();

export const apiRenderBatchReadinessSchema = z
  .object({
    state: z.enum(['INCOMPLETE', 'BLOCKED', 'READY']),
    totalRows: z.number().int().nonnegative(),
    readyRows: z.number().int().nonnegative(),
    blockedRows: z.number().int().nonnegative(),
    unknownRows: z.number().int().nonnegative(),
    findings: z.array(apiRenderReadinessFindingSchema),
  })
  .strict();
export type ApiRenderBatchReadiness = z.infer<typeof apiRenderBatchReadinessSchema>;

export const apiRenderBatchPreflightResponseSchema = z
  .object({
    batchId: z.string().uuid(),
    confirmationToken: z.string().min(1),
    confirmationHash: z.string().regex(/^[a-f0-9]{64}$/),
    expiresAt: z.string(),
    template: apiRenderTemplateSummarySchema,
    target: resolvedRenderTargetSchema.nullable(),
    records: z.array(z.object({ label: z.string(), inputKeys: z.array(z.string()) }).strict()),
    readiness: apiRenderBatchReadinessSchema.default({
      state: 'READY',
      totalRows: 0,
      readyRows: 0,
      blockedRows: 0,
      unknownRows: 0,
      findings: [],
    }),
    effects: z.literal('none'),
  })
  .strict();
export type ApiRenderBatchPreflightResponse = z.infer<typeof apiRenderBatchPreflightResponseSchema>;

export const apiRenderBatchSchema = z
  .object({ batchId: z.string().uuid(), jobs: z.array(apiRenderJobSchema) })
  .strict();
export type ApiRenderBatch = z.infer<typeof apiRenderBatchSchema>;

// --- AI fill ---------------------------------------------------------------------------------
//
// Rows for the render-requests grid, proposed by a model from a brief. Only scalar variables
// (text, number, boolean, enum, colour) are ever proposed: a media slot is a Library pin the
// model cannot mint, and a reserved slot is the server's. Every proposed row still goes through
// the same client validation and server preflight as a typed one — this is a draft, not a render.

export const API_RENDER_SUGGEST_ROWS_ROUTE = '/api/ai-studio/renders/suggest-rows';

export const API_RENDER_SUGGEST_ROWS_MAX = 20;

export const apiRenderSuggestRowsRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    bindingId: bindingIdField,
    templateKey: z.string().min(1),
    contractHash: z.string().min(1),
    prompt: z.string().trim().min(1).max(2000),
    count: z.number().int().min(1).max(API_RENDER_SUGGEST_ROWS_MAX).default(5),
    /** Values to keep across every proposed row — a product already chosen, a fixed price. */
    seed: apiRenderVariableMapSchema.optional(),
  })
  .strict();
export type ApiRenderSuggestRowsRequest = z.infer<typeof apiRenderSuggestRowsRequestSchema>;

export const apiRenderSuggestRowsResponseSchema = z
  .object({
    rows: z.array(z.object({ label: z.string(), variables: apiRenderVariableMapSchema }).strict()),
    /** What the model proposed that was dropped, and why — surfaced, never silent. */
    dropped: z.array(z.string()).default([]),
  })
  .strict();
export type ApiRenderSuggestRowsResponse = z.infer<typeof apiRenderSuggestRowsResponseSchema>;

// --- Delivery destinations ---------------------------------------------------------------------
//
// Where a render can go besides the Library. Slack destinations are the brand's own
// `chat_destinations` rows; the channel list is scoped to the requesting user's OWN Slack
// workspace, never the global bot token — that would show one tenant another tenant's channels.

export const apiRenderDeliveryDestinationSchema = z
  .object({
    id: z.string().uuid(),
    role: z.enum(['client', 'ops', 'alerts', 'dm']),
    channelId: z.string().min(1),
    channelName: z.string(),
  })
  .strict();
export type ApiRenderDeliveryDestination = z.infer<typeof apiRenderDeliveryDestinationSchema>;

export const apiRenderDeliveryDestinationsResponseSchema = z
  .object({
    slack: z
      .object({
        state: z.enum(['ready', 'not_installed', 'not_connected']),
        workspaceName: z.string().nullable(),
        destinations: z.array(apiRenderDeliveryDestinationSchema),
      })
      .strict(),
    meta: z
      .object({
        connected: z.boolean(),
        adAccountId: z.string().nullable(),
        adAccountName: z.string().nullable(),
      })
      .strict(),
  })
  .strict();
export type ApiRenderDeliveryDestinationsResponse = z.infer<
  typeof apiRenderDeliveryDestinationsResponseSchema
>;

export const apiRenderSlackChannelSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    isPrivate: z.boolean(),
    isMember: z.boolean(),
  })
  .strict();
export type ApiRenderSlackChannel = z.infer<typeof apiRenderSlackChannelSchema>;

export const apiRenderSlackChannelListResponseSchema = z
  .object({
    workspaceName: z.string().nullable(),
    channels: z.array(apiRenderSlackChannelSchema),
  })
  .strict();
export type ApiRenderSlackChannelListResponse = z.infer<
  typeof apiRenderSlackChannelListResponseSchema
>;

export const apiRenderCreateDeliveryDestinationRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    role: z.enum(['ops', 'client']),
    channelId: z.string().min(1),
  })
  .strict();
export type ApiRenderCreateDeliveryDestinationRequest = z.infer<
  typeof apiRenderCreateDeliveryDestinationRequestSchema
>;
