import { describe, expect, it } from 'bun:test';
import {
  notificationChannelSchema,
  notificationDeliverySchema,
  notificationFrequencySchema,
  notificationPreferenceSchema,
  webPushSubscriptionSchema,
} from './notifications';

const ID = '11111111-1111-4111-8111-111111111111';
const AT = '2026-09-27T00:00:00Z';

describe('notification preferences', () => {
  it('parses a per-kind, per-channel preference', () => {
    const preference = {
      userId: ID,
      kind: 'comment_mention',
      channel: 'web_push',
      frequency: 'daily',
      updatedAt: AT,
    } as const;
    expect(notificationPreferenceSchema.parse(preference)).toEqual(preference);
  });

  it('rejects an unknown channel, frequency, or a kind the DB would refuse', () => {
    expect(notificationChannelSchema.safeParse('sms').success).toBe(false);
    expect(notificationFrequencySchema.safeParse('weekly').success).toBe(false);
    expect(
      notificationPreferenceSchema.safeParse({
        userId: ID,
        kind: 'Comment Mention',
        channel: 'email',
        frequency: 'never',
        updatedAt: AT,
      }).success,
    ).toBe(false);
  });
});

describe('notification deliveries', () => {
  it('parses a failed delivery attempt and rejects an unknown status', () => {
    const delivery = {
      notificationId: ID,
      channel: 'email',
      status: 'failed',
      frequency: 'immediate',
      dueAt: AT,
      attempts: 2,
      lastError: 'smtp 550',
      providerRef: null,
      updatedAt: AT,
    } as const;
    expect(notificationDeliverySchema.parse(delivery)).toEqual(delivery);
    expect(notificationDeliverySchema.safeParse({ ...delivery, status: 'bounced' }).success).toBe(
      false,
    );
  });
});

describe('web push subscriptions', () => {
  const subscription = {
    id: ID,
    userId: ID,
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    p256dh: 'key',
    auth: 'secret',
    userAgent: null,
    createdAt: AT,
    lastSeenAt: AT,
  };

  it('parses a subscription', () => {
    expect(webPushSubscriptionSchema.parse(subscription)).toEqual(subscription);
  });

  it('rejects a non-https endpoint', () => {
    expect(
      webPushSubscriptionSchema.safeParse({ ...subscription, endpoint: 'http://push.example/x' })
        .success,
    ).toBe(false);
  });
});
