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
};

export function describeRenderDiscoveryFailure(message: string): string {
  for (const [code, copy] of Object.entries(RENDER_DISCOVERY_MESSAGES)) {
    if (message.includes(code)) return copy;
  }
  return message || 'Render discovery failed';
}
