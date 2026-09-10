// What is ALREADY in a brand's render workspace.
//
// Discovery (RENDER_REGISTRY_CONTRACT.md §6) ends at an intersection:
//
//   workspace templates  ∩  enabled media.render_template_memberships
//
// and that intersection is empty for a brand that has never been granted anything — so a
// workspace holding twenty perfectly good templates shows an empty picker, and the only way to
// use one has been for an engineer to write a membership row by hand. That is the gap this shape
// closes: list what is THERE, say which of it the brand may already use, and let the rest be
// adopted.
//
// `templateKey` is `String(template_id)` — the key memberships, ad_render_jobs and
// media.template_sources all join on. It is a string on purpose: it is an identifier, not a
// number to do arithmetic with, and the stores that hold it are text columns.

import { z } from 'zod';

export const workspaceTemplateSchema = z
  .object({
    templateKey: z.string().min(1),
    templateId: z.number().int().positive(),
    name: z.string(),
    rootTable: z.string().nullable().default(null),
    updatedAt: z.string().nullable().default(null),
    /** An enabled membership exists for this brand on this binding — the picker will show it. */
    granted: z.boolean(),
    /**
     * Set when this template came in through the Library, so the Forge page can link a discovered
     * template back to the upload it was built from. Null means it predates the forge or was made
     * by an operator directly in NocoBase — still adoptable, just not ours.
     */
    sourceAssetId: z.string().uuid().nullable().default(null),
    /**
     * The forge names an unpromoted template `[DRAFT/agent] …`. A draft is listed rather than
     * hidden — seeing one is how you learn a run stopped short — but it is not the same thing as
     * a published template and a picker should say so.
     */
    draft: z.boolean(),
  })
  .strict();
export type WorkspaceTemplate = z.infer<typeof workspaceTemplateSchema>;

/** The forge's own prefix for a template that has not been promoted yet. */
export const DRAFT_TEMPLATE_PREFIX = '[DRAFT/agent]';

export function isDraftTemplateName(name: string | null | undefined): boolean {
  return String(name ?? '').trimStart().startsWith(DRAFT_TEMPLATE_PREFIX);
}

/** The name without the draft marker, for display. */
export function workspaceTemplateLabel(name: string | null | undefined): string {
  const raw = String(name ?? '').trim();
  return isDraftTemplateName(raw) ? raw.slice(DRAFT_TEMPLATE_PREFIX.length).trim() || raw : raw;
}
