// The workspaces a brand may render into.
//
// A brand is not limited to one. `media.render_workspace_bindings` is unique on
// (brand_id, picinst, environment_key, client_key) and only the DEFAULT is unique per brand
// (`render_workspace_binding_one_default_idx ... where is_default and enabled`) — so several
// enabled bindings per brand is a supported, live shape, not a hypothetical: vivo47 renders into
// Continuum_app AND Parsed_app today.
//
// Everything that reads "the brand's workspace" therefore has to read "the one that was CHOSEN",
// and a template belongs to exactly one of them: the render table is named after the binding's
// `client_key`, and the membership row that makes a template visible points at the binding's id.
// Picking the default when the caller meant another one publishes into the wrong tenant.

import { z } from 'zod';

export const renderWorkspaceSchema = z
  .object({
    id: z.string().uuid(),
    /** The NocoBase sub-app. */
    picinst: z.string().min(1),
    environmentKey: z.string().min(1),
    /** The brand's identity inside that sub-app; the render table is named after it. */
    clientKey: z.string().min(1),
    isDefault: z.boolean(),
  })
  .strict();
export type RenderWorkspace = z.infer<typeof renderWorkspaceSchema>;

/**
 * What to call a workspace on screen.
 *
 * `picinst` alone is ambiguous by construction — the uniqueness key allows one sub-app to hold
 * several of a brand's bindings, differing only by environment — so the environment is shown
 * whenever it is not the ordinary one. Computed here rather than in the picker so a second
 * consumer cannot label the same binding differently.
 */
export function renderWorkspaceLabel(workspace: RenderWorkspace): string {
  return workspace.environmentKey && workspace.environmentKey !== 'prod'
    ? `${workspace.picinst} · ${workspace.environmentKey}`
    : workspace.picinst;
}
