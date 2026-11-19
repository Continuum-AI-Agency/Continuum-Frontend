import { afterEach, describe, expect, it } from 'bun:test';
import type { AppNotification } from '@continuum/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '../../../messages/common/en.json';
import es from '../../../messages/common/es.json';
import pt from '../../../messages/common/pt-BR.json';
import { NotificationsPanel } from './NotificationsPanel';

afterEach(cleanup);

describe('localized notifications', () => {
  const cases = [
    {
      locale: 'en',
      messages: en,
      title: 'Notifications',
      sentence: 'Ana asked you to review “Summer Reel”',
    },
    {
      locale: 'pt-BR',
      messages: pt,
      title: 'Notificações',
      sentence: 'Ana pediu sua revisão de “Summer Reel”',
    },
    {
      locale: 'es',
      messages: es,
      title: 'Notificaciones',
      sentence: 'Ana te pidió revisar “Summer Reel”',
    },
  ] as const;
  for (const item of cases)
    it(`renders system copy in ${item.locale} and preserves authored content`, () => {
      const notification: AppNotification = {
        id: 'notification-1',
        brandId: 'brand-1',
        recipientUserId: 'user-1',
        actorUserId: 'user-2',
        kind: 'review_request',
        payload: {
          actorName: 'Ana',
          assetName: 'Summer Reel',
          message: 'Please keep this exact comment',
        },
        readAt: null,
        createdAt: new Date().toISOString(),
      };
      render(
        <NextIntlClientProvider
          locale={item.locale}
          timeZone="UTC"
          messages={{ common: item.messages }}
        >
          <NotificationsPanel
            notifications={[notification]}
            unreadCount={1}
            loading={false}
            onMarkAllRead={() => {}}
            onMarkRead={() => {}}
          />
        </NextIntlClientProvider>,
      );
      expect(screen.getByText(item.title)).toBeTruthy();
      expect(screen.getByText(item.sentence)).toBeTruthy();
      expect(screen.getByText('Please keep this exact comment')).toBeTruthy();
    });
});
