import type { TemplateRevisionErrorCode } from '@continuum/contracts';
import { ApiError } from '@/lib/api/errors';

// The discovery failures a brand owner can actually hit, in words they can act
// on. Echoing the raw server code told them nothing and gave them no next step.
const RENDER_DISCOVERY_MESSAGES: Record<string, string> = {
  render_workspace_not_bound:
    'This brand is not connected to a render workspace yet. Ask your Continuum contact to set one up.',
  render_binding_lookup_failed: 'Could not read this brand’s render workspace. Try again shortly.',
  render_api_not_configured: 'Rendering is not configured for this environment yet.',
  render_input_set_name_taken: 'A set with that name already exists for this template.',
  render_contract_changed:
    'This template was updated after these rows were checked. Reload the template, save the set, then render again.',
  render_set_binding_changed:
    'This set was saved for another version or workspace of this template. Open it again and save it, then render.',
  render_set_coordinate_incomplete:
    'This render lost track of the set it came from. Save the set, then render again.',
  render_reserved_variable: 'That variable is filled by Continuum and cannot be sent.',
  render_callback_not_configured:
    'This environment has no render callback URL configured, so nothing can be prepared here yet.',
  render_delivery_ad_not_found:
    'That ad is no longer in the chosen campaign and ad set. Pick the ad again.',
  render_delivery_ad_changed: 'That ad’s creative changed after it was picked. Pick the ad again.',
  render_set_row_snapshot_mismatch:
    'A row changed after the render set was saved. Save the set, then render again.',
  // A set pins one saved template revision. These say which revision question needs answering.
  render_set_template_revision_changed:
    'This set’s template revision changed after you opened it. Open the set again, then render.',
  render_set_explicit_revision_change_required:
    'This set is pinned to another template revision. Use “Change set template revision” to move it, then render.',
  render_set_revision_outputs_unresolved:
    'Some rows use formats the chosen revision does not have. Pick their formats again, then change the revision.',
  // The server's catch-all: it hit an error it has no code for, and said nothing more.
  api_render_failed:
    'The render service hit an unexpected error. Try again; if it keeps failing, tell your Continuum contact.',
};

// Every refusal the revision registry has, keyed by the contract's own union: a new Backend code with
// no words here is a type error, not a raw code on someone's screen.
const TEMPLATE_REVISION_MESSAGES: Record<TemplateRevisionErrorCode, string> = {
  template_revision_target_required:
    'This set lost track of its template and render workspace. Choose the template again, then save.',
  // The case people actually hit: nothing is published yet. It used to read as a choice between
  // revisions that did not exist.
  template_revision_unpublished:
    'This template has no published revision for this render workspace. Publish one from the template’s Variants tab, then save.',
  template_revision_selection_required:
    'Several revisions are published to this template. Choose the revision for this set, then render.',
  template_revision_output_required:
    'That revision is not published to this render workspace. Publish it, or choose a published revision.',
  template_revision_not_found:
    'That template revision no longer exists. Choose a published revision for this set.',
  template_revision_source_missing:
    'A file behind that revision was removed from the Library. Choose a published revision for this set.',
  template_revision_source_changed:
    'A file behind that revision changed after it was published. Publish a new revision, then save.',
  template_variant_archived:
    'That variant was archived. Choose another revision for this set, or restore the variant.',
  template_revision_head_conflict:
    'Someone else saved this template at the same time. Reload it and save again.',
  template_revision_multi_source_edit_unsupported:
    'This revision renders from several After Effects files, so it cannot be edited as one file yet.',
  template_revision_multi_source_publish_unsupported:
    'This revision renders from several After Effects files and cannot be published from just one of them. Ask your Continuum contact to publish it.',
  template_revision_sources_invalid:
    'These files cannot be registered as one template revision: each output must name exactly one file.',
};

const MESSAGES: Record<string, string> = {
  ...RENDER_DISCOVERY_MESSAGES,
  ...TEMPLATE_REVISION_MESSAGES,
};

/** The refusals whose fix lives on the template itself, not in the rows: open it to repair. */
const TEMPLATE_REPAIR_CODES: ReadonlySet<string> = new Set<TemplateRevisionErrorCode>([
  'template_revision_unpublished',
  'template_revision_output_required',
  'template_revision_source_missing',
  'template_revision_source_changed',
]);

const serverCode = (failure: unknown): string | null => {
  const code = failure instanceof ApiError ? failure.payload?.error : undefined;
  return typeof code === 'string' ? code : null;
};

/** Whether this failure is repaired on the template (publish, replace a file), not in the set. */
export function needsTemplateRepair(failure: unknown): boolean {
  const code = serverCode(failure);
  return code !== null && TEMPLATE_REPAIR_CODES.has(code);
}

// A server detail is worth showing only when it is a sentence; the routes echo the bare code as
// the detail when they have nothing better to say.
const humanDetail = (error: unknown): string | null => {
  const detail = error instanceof ApiError ? error.payload?.detail : undefined;
  return typeof detail === 'string' && /\s/.test(detail.trim()) ? detail : null;
};

/** Accepts the thrown error itself, or its message. Known codes first, then the server's detail. */
export function describeRenderDiscoveryFailure(failure: unknown): string {
  // A server code is matched exactly. Substrings are only for bare messages: a code such as
  // `render_template_revision_source_changed` contains a shorter one that means something else.
  const exact = serverCode(failure);
  if (exact && exact in MESSAGES) return MESSAGES[exact]!;
  const message =
    typeof failure === 'string' ? failure : failure instanceof Error ? failure.message : '';
  if (!exact)
    for (const [code, copy] of Object.entries(MESSAGES)) {
      if (message.includes(code)) return copy;
    }
  return humanDetail(failure) ?? (message || 'Render discovery failed');
}
