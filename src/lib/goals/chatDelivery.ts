import {
  type GoalChatDelivery,
  type GoalChatDeliveryStatus,
  goalChatDeliverySchema,
  goalChatDeliveryStatusSchema,
  goalSnapshotSchema,
} from '@continuum/contracts';
import { z } from 'zod';

export {
  type GoalChatDelivery,
  type GoalChatDeliveryStatus,
  goalChatDeliverySchema,
  goalChatDeliveryStatusSchema,
};

export const goalSnapshotWithChatDeliveriesSchema = goalSnapshotSchema.extend({
  chatDeliveries: z.array(goalChatDeliverySchema).default([]),
});
export type GoalSnapshotWithChatDeliveries = z.infer<typeof goalSnapshotWithChatDeliveriesSchema>;

export type GoalDeliveryView = {
  id: string;
  recipientUserId: string;
  platform: 'slack' | 'teams' | null;
  status: GoalChatDeliveryStatus;
  label: string;
  detail: string;
  tone: 'success' | 'warning' | 'danger' | 'muted';
  usesInAppFallback: boolean;
};

export function projectGoalDelivery(delivery: GoalChatDelivery): GoalDeliveryView {
  const platform = delivery.platform ? (delivery.platform === 'slack' ? 'Slack' : 'Teams') : 'Chat';

  if (delivery.status === 'acknowledged') {
    return {
      ...delivery,
      platform: delivery.platform ?? null,
      label: 'Acknowledged',
      detail: `${platform} response acknowledged.`,
      tone: 'success',
      usesInAppFallback: false,
    };
  }
  if (delivery.status === 'delivered') {
    return {
      ...delivery,
      platform: delivery.platform ?? null,
      label: `Delivered · ${platform}`,
      detail: 'The teammate can respond from chat or this Goal.',
      tone: 'success',
      usesInAppFallback: false,
    };
  }
  if (delivery.status === 'waiting_for_connection') {
    return {
      ...delivery,
      platform: delivery.platform ?? null,
      label: 'In-app fallback',
      detail: 'No routable Slack or Teams identity. The request remains available here.',
      tone: 'warning',
      usesInAppFallback: true,
    };
  }
  if (delivery.status === 'failed') {
    return {
      ...delivery,
      platform: delivery.platform ?? null,
      label: 'In-app fallback',
      detail:
        delivery.failureSummary ??
        'Chat delivery failed after retries. The request remains available here.',
      tone: 'danger',
      usesInAppFallback: true,
    };
  }
  if (delivery.status === 'cancelled') {
    return {
      ...delivery,
      platform: delivery.platform ?? null,
      label: 'Cancelled',
      detail: 'This delivery is no longer active.',
      tone: 'muted',
      usesInAppFallback: false,
    };
  }
  return {
    ...delivery,
    platform: delivery.platform ?? null,
    label: delivery.status === 'delivering' ? `Sending · ${platform}` : 'Queued',
    detail: 'Chat delivery is in progress. The request is already available here.',
    tone: 'muted',
    usesInAppFallback: false,
  };
}
