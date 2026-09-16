import type {
  ApiRenderCreateDeliveryDestinationRequest,
  ApiRenderDeliveryDestination,
} from '@continuum/contracts';
import { describeRenderDiscoveryFailure } from '@/StudioCanvas/nodes/api-render/renderDiscoveryCopy';

// The words every Slack-room surface uses — the Forge picker, the shared add panel and the
// brand admin's own section in Settings. One home, because a brand admin reading "Ops" in
// Settings and "Team" in Forge is reading about the same row.

/** A role a room can be created with. `dm` is excluded: it is addressed by connection, not channel. */
export type SlackRoomRole = ApiRenderCreateDeliveryDestinationRequest['role'];

export const ROLE_LABEL: Record<ApiRenderDeliveryDestination['role'], string> = {
  ops: 'Ops',
  client: 'Client',
  alerts: 'Alerts',
  dm: 'DM',
};

/** What choosing that role actually does, in the add panel's own words. */
export const ROLE_BLURB: Record<SlackRoomRole, string> = {
  ops: 'Ops — your team, every render',
  client: 'Client — posts only after the render passes its check',
  alerts: 'Alerts — delivery problems and approvals nobody has answered',
};

export const NOT_CONNECTED_COPY = 'No Slack workspace is connected to this brand yet.';
export const NOT_INSTALLED_COPY =
  'The Continuum app is no longer installed in this brand’s Slack workspace. Reinstall it to add a channel.';

/** The backend answers 503 `chat_destinations_unavailable` until Slack delivery is wired. */
export function isSlackDeliveryUnavailable(error: unknown): boolean {
  return error instanceof Error && error.message.includes('chat_destinations_unavailable');
}

// The server's codes in the words these surfaces use; an unmapped failure keeps its text.
const SLACK_FAILURE_COPY: Record<string, string> = {
  chat_destinations_unavailable: 'Slack delivery isn’t available yet.',
  slack_not_connected: NOT_CONNECTED_COPY,
  slack_not_installed: NOT_INSTALLED_COPY,
  slack_channel_not_found: 'That channel is gone — pick another.',
  forbidden_brand_role: 'Only brand owners, admins and operators can add a Slack channel.',
  // A 404 here is also another brand's room, on purpose — never phrase it as a permission problem.
  chat_destination_not_found: 'That room is already gone. Refresh the list.',
  chat_destinations_lookup_failed: 'Slack rooms could not be read. Try again.',
};

/** A Slack or render-service failure in words; render_* codes use the discovery copy. */
export function describeSlackFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const code = Object.keys(SLACK_FAILURE_COPY).find((key) => message.includes(key));
  if (code) return SLACK_FAILURE_COPY[code]!;
  return message ? describeRenderDiscoveryFailure(error) : 'Slack did not answer. Try again.';
}
