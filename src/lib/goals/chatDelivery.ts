import {
  type GoalChatDelivery,
  type GoalChatDeliveryStatus,
  goalChatDeliverySchema,
  goalChatDeliveryStatusSchema,
  goalSnapshotSchema,
} from '@continuum/contracts';
import { z } from 'zod';
import type { GoalDisplayTranslator } from './displayCopy';

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

export function projectGoalDelivery(
  delivery: GoalChatDelivery,
  t?: GoalDisplayTranslator,
): GoalDeliveryView {
  const platform = delivery.platform
    ? delivery.platform === 'slack'
      ? 'Slack'
      : 'Teams'
    : t
      ? t('m_2ced57f125')
      : 'Chat';

  if (delivery.status === 'acknowledged') {
    return {
      ...delivery,
      platform: delivery.platform ?? null,
      label: t ? t('m_9415af18fe') : 'Acknowledged',
      detail: t ? t('m_44c42023a7', { platform }) : `${platform} response acknowledged.`,
      tone: 'success',
      usesInAppFallback: false,
    };
  }
  if (delivery.status === 'delivered') {
    return {
      ...delivery,
      platform: delivery.platform ?? null,
      label: t ? t('m_f3caa590b3', { platform }) : `Delivered · ${platform}`,
      detail: t ? t('m_b5048a93cc') : 'The teammate can respond from chat or this Goal.',
      tone: 'success',
      usesInAppFallback: false,
    };
  }
  if (delivery.status === 'waiting_for_connection') {
    return {
      ...delivery,
      platform: delivery.platform ?? null,
      label: t ? t('m_5f1f87beee') : 'In-app fallback',
      detail: t
        ? t('m_48e291bef7')
        : 'No routable Slack or Teams identity. The request remains available here.',
      tone: 'warning',
      usesInAppFallback: true,
    };
  }
  if (delivery.status === 'failed') {
    return {
      ...delivery,
      platform: delivery.platform ?? null,
      label: t ? t('m_5f1f87beee') : 'In-app fallback',
      detail: t
        ? t('m_3a24b6f2e7')
        : (delivery.failureSummary ??
          'Chat delivery failed after retries. The request remains available here.'),
      tone: 'danger',
      usesInAppFallback: true,
    };
  }
  if (delivery.status === 'cancelled') {
    return {
      ...delivery,
      platform: delivery.platform ?? null,
      label: t ? t('m_a1bf92eff4') : 'Cancelled',
      detail: t ? t('m_aff0abe34b') : 'This delivery is no longer active.',
      tone: 'muted',
      usesInAppFallback: false,
    };
  }
  return {
    ...delivery,
    platform: delivery.platform ?? null,
    label:
      delivery.status === 'delivering'
        ? t
          ? t('m_430b41688c', { platform })
          : `Sending · ${platform}`
        : t
          ? t('m_6a599877d7')
          : 'Queued',
    detail: t
      ? t('m_fa3a56740e')
      : 'Chat delivery is in progress. The request is already available here.',
    tone: 'muted',
    usesInAppFallback: false,
  };
}
