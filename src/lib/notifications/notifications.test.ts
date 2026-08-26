import { describe, expect, it } from 'bun:test';
import type { AppNotification } from '@continuum/contracts';
import { describeNotification, mapNotificationRow, type NotificationRow } from './notifications';
import { type ReviewPingTarget, selectablePingTargets } from './reviewPing';

const baseRow: NotificationRow = {
  id: 'n-1',
  brand_id: 'brand-1',
  recipient_user_id: 'user-2',
  actor_user_id: 'user-1',
  kind: 'review_request',
  payload: {
    assetId: 'asset-1',
    assetName: 'Summer Reel v3',
    actorName: 'Duane',
    message: 'Check the grade',
  },
  read_at: null,
  created_at: '2026-07-11T10:00:00.000Z',
};

function notification(overrides: Partial<AppNotification>): AppNotification {
  const mapped = mapNotificationRow(baseRow);
  if (!mapped) throw new Error('base row must map');
  return { ...mapped, ...overrides };
}

describe('mapNotificationRow', () => {
  it('maps a snake_case row to the contracts shape', () => {
    const mapped = mapNotificationRow(baseRow);
    expect(mapped).not.toBeNull();
    expect(mapped?.brandId).toBe('brand-1');
    expect(mapped?.recipientUserId).toBe('user-2');
    expect(mapped?.kind).toBe('review_request');
    expect(mapped?.readAt).toBeNull();
    expect(mapped?.payload.assetName).toBe('Summer Reel v3');
  });

  it('drops rows with unknown kinds', () => {
    expect(mapNotificationRow({ ...baseRow, kind: 'billing_alert' })).toBeNull();
  });

  it('coerces non-object payloads to an empty record', () => {
    const mapped = mapNotificationRow({ ...baseRow, payload: 'oops' });
    expect(mapped).not.toBeNull();
    expect(mapped?.payload).toEqual({});
  });
});

describe('describeNotification', () => {
  it('describes a review request with actor, asset, message, and asset deep link', () => {
    const display = describeNotification(notification({}));
    expect(display.title).toBe('Duane asked you to review “Summer Reel v3”');
    expect(display.detail).toBe('Check the grade');
    expect(display.href).toBe('/library?assetId=asset-1');
  });

  it('falls back gracefully when the payload is empty', () => {
    const display = describeNotification(notification({ payload: {} }));
    expect(display.title).toBe('A teammate asked you to review “a creative”');
    expect(display.detail).toBeNull();
    expect(display.href).toBe('/library');
  });

  it('humanizes review status changes', () => {
    const display = describeNotification(
      notification({
        kind: 'review_status_change',
        payload: { assetId: 'asset-1', assetName: 'Summer Reel v3', status: 'needs_changes' },
      }),
    );
    expect(display.title).toBe('“Summer Reel v3” moved to needs changes');
    expect(display.href).toBe('/library?assetId=asset-1');
  });

  it('describes replies and mentions with the comment excerpt as detail', () => {
    const reply = describeNotification(
      notification({
        kind: 'comment_reply',
        payload: { actorName: 'Ana', assetName: 'Reel', excerpt: 'see @Bo note' },
      }),
    );
    expect(reply.title).toBe('Ana replied on “Reel”');
    expect(reply.detail).toBe('see @Bo note');

    const mention = describeNotification(
      notification({
        kind: 'comment_mention',
        payload: { actorName: 'Ana', assetName: 'Reel' },
      }),
    );
    expect(mention.title).toBe('Ana mentioned you on “Reel”');
    expect(mention.detail).toBeNull();
    expect(mention.href).toBe(mention.href);
  });
});

describe('selectablePingTargets', () => {
  const members: ReviewPingTarget[] = [
    { id: 'user-1', email: 'self@example.com', role: 'owner' },
    { id: 'user-2', email: 'ana@example.com', role: 'admin' },
    { id: 'user-3', email: null, role: 'viewer' },
  ];

  it('excludes the caller and preserves order', () => {
    expect(selectablePingTargets(members, 'user-1').map((m) => m.id)).toEqual(['user-2', 'user-3']);
  });

  it('keeps everyone when the caller is unknown', () => {
    expect(selectablePingTargets(members, null)).toHaveLength(3);
  });
});
