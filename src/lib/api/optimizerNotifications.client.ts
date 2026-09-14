import {
  type ListSlackChannelsResponse,
  listSlackChannelsResponseSchema,
  type OptimizerNotificationSettings,
  optimizerNotificationSettingsSchema,
  type SaveOptimizerNotificationRequest,
} from '@continuum/contracts';
import { http } from './http';

const settingsPath = (brandId: string) =>
  `/api/chat/optimizer-notifications/${encodeURIComponent(brandId)}`;

export function getOptimizerNotificationSettings(
  brandId: string,
  signal?: AbortSignal,
): Promise<OptimizerNotificationSettings> {
  return http.request({
    path: settingsPath(brandId),
    schema: optimizerNotificationSettingsSchema,
    signal,
  });
}

export function saveOptimizerNotificationSettings(
  brandId: string,
  body: SaveOptimizerNotificationRequest,
): Promise<OptimizerNotificationSettings> {
  return http.request({
    path: settingsPath(brandId),
    method: 'PUT',
    body,
    schema: optimizerNotificationSettingsSchema,
  });
}

export async function disableOptimizerNotifications(brandId: string): Promise<void> {
  await http.request({ path: settingsPath(brandId), method: 'DELETE' });
}

export function listSlackChannels(signal?: AbortSignal): Promise<ListSlackChannelsResponse> {
  return http.request({
    path: '/api/chat/slack/channels',
    schema: listSlackChannelsResponseSchema,
    signal,
  });
}
