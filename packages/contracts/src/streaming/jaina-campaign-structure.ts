/**
 * Wire payload for `paid.campaign_structure` — a scaffold's campaign → ad set → ad tree
 * drawn inside the chat (P5). One frame per LAYOUT: "01 + 04 together" is two frames,
 * two parts, and a redraw of the same layout REPLACES its part (`campaignStructurePartId`).
 * The part is keyed on the PARENT scaffold (`paid_scaffolds.id`), not the version: a
 * correction in words saves a new version, and keying on it would stack a second drawing.
 *
 * The five layouts Ramiro chose (2026-10-21):
 *   tree    01  campaign → ad sets → ads, the default for a new campaign   (compiled HTML)
 *   matrix  04  audience × creative; each filled cell is an ad             (compiled HTML)
 *   funnel  05  ad sets by stage: prospecting / consideration / conversion (compiled HTML)
 *   diff    08  original vs copy, with added / removed / changed           (React)
 *   outline 09  collapsible outline with the you-gave / filled / asks counts (React)
 *
 * Code picks the layout from the question and the structure; the model only proposes.
 *
 * THE SAME RULE AS `paid.scaffold_proposed` (./jaina-scaffold): nodes carry NO status and
 * NO Meta object id. Both mutate during each gate, and every frame is written twice
 * (socket + a durable run-event row replayed on every reload), so a copied status is
 * stale the moment a build starts. A structure over `CAMPAIGN_STRUCTURE_INLINE_NODE_LIMIT`
 * nodes ships the skeleton with `truncated: true`, and the Frontend reads
 * `brand_profiles.paid_scaffold_nodes` by `version_id` (RLS grants brand members).
 *
 * `field_provenance` is presentation: who supplied each value. It is NOT the canvas's
 * `NodeProvenance` (the approval state of a hydrated node), and it never enters the
 * scaffold's content hash, so relabelling a field never invalidates an approval.
 *
 * WIRE DTO policy of ./jaina-scaffold: `.passthrough()`, so a Backend that learns one
 * more field never breaks an older Frontend mid-deploy.
 */

import { z } from 'zod';

export const CAMPAIGN_STRUCTURE_FRAME_TYPE = 'paid.campaign_structure' as const;

/** Above this many nodes the frame carries the campaign skeleton only. */
export const CAMPAIGN_STRUCTURE_INLINE_NODE_LIMIT = 60;

export const CAMPAIGN_STRUCTURE_LAYOUTS = ['tree', 'matrix', 'funnel', 'diff', 'outline'] as const;
export const campaignStructureLayoutSchema = z.enum(CAMPAIGN_STRUCTURE_LAYOUTS);
export type CampaignStructureLayout = z.infer<typeof campaignStructureLayoutSchema>;

/** Layouts whose picture is HTML compiled by code into the HyperFrames bucket. */
export const CAMPAIGN_STRUCTURE_HTML_LAYOUTS: readonly CampaignStructureLayout[] = [
  'tree',
  'matrix',
  'funnel',
];

/** Who supplied a field's value: the person, Jaina, or nobody yet (Jaina asks). */
export const FIELD_PROVENANCE_VALUES = ['user_gave', 'jaina_filled', 'jaina_asks'] as const;
export const fieldProvenanceSchema = z.enum(FIELD_PROVENANCE_VALUES);
export type FieldProvenance = z.infer<typeof fieldProvenanceSchema>;

export const structureFieldValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type StructureFieldValue = z.infer<typeof structureFieldValueSchema>;

/** One field a person reads on a node, e.g. "Daily budget · 500 MXN · you gave this". */
export const structureFieldSchema = z
  .object({
    /** The draft-node key (`daily_budget_minor_units`, `bid_strategy`, `url_tags`, …). */
    key: z.string().min(1),
    label: z.string().min(1),
    /** Already formatted for reading; null while `provenance` is 'jaina_asks'. */
    value: structureFieldValueSchema,
    unit: z.string().optional(),
    provenance: fieldProvenanceSchema,
  })
  .passthrough();
export type StructureField = z.infer<typeof structureFieldSchema>;

export const STRUCTURE_FUNNEL_STAGES = ['prospecting', 'consideration', 'conversion'] as const;
export const structureFunnelStageSchema = z.enum(STRUCTURE_FUNNEL_STAGES);
export type StructureFunnelStage = z.infer<typeof structureFunnelStageSchema>;

export const structureNodeSchema = z
  .object({
    /** `paid_scaffold_nodes.path_key`: 'c0', 'c0/a1', 'c0/a1/ad2'. The anchor a claim points at. */
    path_key: z.string().min(1).max(200),
    parent_path_key: z.string().min(1).max(200).nullable(),
    level: z.enum(['campaign', 'adset', 'ad']),
    name: z.string(),
    /** Layout 05's lane; null when the node names no stage. */
    funnel_stage: structureFunnelStageSchema.nullable(),
    /** Layout 04's column (ad sets and their ads); null on a campaign. */
    audience_key: z.string().nullable(),
    /** Layout 04's row (ads); null above the ad level. */
    creative_key: z.string().nullable(),
    fields: z.array(structureFieldSchema).max(32),
  })
  .passthrough();
export type StructureNode = z.infer<typeof structureNodeSchema>;

export const structureDiffChangeSchema = z.enum(['added', 'removed', 'changed', 'unchanged']);
export type StructureDiffChange = z.infer<typeof structureDiffChangeSchema>;

export const structureDiffEntrySchema = z
  .object({
    /** The copy's node; for 'removed', the source node's path key. */
    path_key: z.string().min(1),
    /** The source node it was copied from; null when 'added'. */
    source_path_key: z.string().nullable(),
    level: z.enum(['campaign', 'adset', 'ad']),
    name: z.string(),
    change: structureDiffChangeSchema,
    fields: z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        before: structureFieldValueSchema,
        after: structureFieldValueSchema,
      }),
    ),
  })
  .passthrough();
export type StructureDiffEntry = z.infer<typeof structureDiffEntrySchema>;

export const structureDiffSchema = z
  .object({
    /** The live Meta object the copy was read from. */
    source: z.object({
      kind: z.enum(['campaign', 'adset', 'ad']),
      id: z.string().min(1),
      name: z.string(),
    }),
    entries: z.array(structureDiffEntrySchema),
  })
  .passthrough();
export type StructureDiff = z.infer<typeof structureDiffSchema>;

/** The compiled picture for layouts 01/04/05 — signed on read, loaded in a no-script iframe. */
export const structureHtmlSchema = z.object({
  bucket: z.string().min(1),
  path: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type StructureHtml = z.infer<typeof structureHtmlSchema>;

export const structureCountsSchema = z.object({
  campaigns: z.number().int().nonnegative(),
  adSets: z.number().int().nonnegative(),
  ads: z.number().int().nonnegative(),
  userGave: z.number().int().nonnegative(),
  jainaFilled: z.number().int().nonnegative(),
  jainaAsks: z.number().int().nonnegative(),
});
export type StructureCounts = z.infer<typeof structureCountsSchema>;

/** data shape for type: "paid.campaign_structure". */
export const campaignStructurePayloadSchema = z
  .object({
    /** `paid_scaffold_versions.id` — the same rule as every `paid.scaffold_*` payload. */
    scaffoldId: z.string().min(1),
    /** `paid_scaffolds.id`. */
    parentScaffoldId: z.string().optional(),
    version: z.number().int().positive(),
    layout: campaignStructureLayoutSchema,
    /** Stable per (parent scaffold, layout) so a redraw replaces the part: `campaignStructurePartId`. */
    partId: z.string().min(1),
    title: z.string(),
    counts: structureCountsSchema,
    nodes: z.array(structureNodeSchema).max(200),
    /** true => nodes holds the campaigns only; read `paid_scaffold_nodes` by version id. */
    truncated: z.boolean(),
    /** Required for layout 'diff', null otherwise. */
    diff: structureDiffSchema.nullable(),
    /** Required for 'tree' | 'matrix' | 'funnel', null for the React layouts. */
    html: structureHtmlSchema.nullable(),
    /** The canvas link that opens exactly this version (`scaffoldCanvasHref`). */
    canvasHref: z.string().nullable().optional(),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (value.layout === 'diff' && value.diff === null) {
      ctx.addIssue({ code: 'custom', path: ['diff'], message: "layout 'diff' requires a diff" });
    }
    if (CAMPAIGN_STRUCTURE_HTML_LAYOUTS.includes(value.layout) && value.html === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['html'],
        message: `layout '${value.layout}' is compiled HTML and requires html`,
      });
    }
  });
export type CampaignStructurePayload = z.infer<typeof campaignStructurePayloadSchema>;

export function campaignStructurePartId(
  scaffoldId: string,
  layout: CampaignStructureLayout,
): string {
  return `campaign-structure:${scaffoldId}:${layout}`;
}
