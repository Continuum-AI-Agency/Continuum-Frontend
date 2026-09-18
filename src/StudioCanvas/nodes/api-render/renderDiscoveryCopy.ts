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
    'This template changed since that set was saved. Re-pick the template and save the set again.',
  render_reserved_variable: 'That variable is filled by Continuum and cannot be sent.',
  render_callback_not_configured:
    'This environment has no render callback URL configured, so nothing can be prepared here yet.',
  render_delivery_ad_not_found:
    'That ad is no longer in the chosen campaign and ad set. Pick the ad again.',
  render_delivery_ad_changed: 'That ad’s creative changed after it was picked. Pick the ad again.',
  render_set_row_snapshot_mismatch:
    'A row changed after the render set was saved. Save the set, then render again.',
  // The server's catch-all: it hit an error it has no code for, and said nothing more.
  api_render_failed:
    'The render service hit an unexpected error. Try again; if it keeps failing, tell your Continuum contact.',
};

// A server detail is worth showing only when it is a sentence; the routes echo the bare code as
// the detail when they have nothing better to say.
const humanDetail = (error: unknown): string | null => {
  const detail = error instanceof ApiError ? error.payload?.detail : undefined;
  return typeof detail === 'string' && /\s/.test(detail.trim()) ? detail : null;
};

/** Accepts the thrown error itself, or its message. Known codes first, then the server's detail. */
export function describeRenderDiscoveryFailure(failure: unknown): string {
  const message =
    typeof failure === 'string' ? failure : failure instanceof Error ? failure.message : '';
  for (const [code, copy] of Object.entries(RENDER_DISCOVERY_MESSAGES)) {
    if (message.includes(code)) return copy;
  }
  return humanDetail(failure) ?? (message || 'Render discovery failed');
}
