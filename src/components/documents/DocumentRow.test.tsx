import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import en from '../../../messages/common/en.json';
import es from '../../../messages/common/es.json';
import pt from '../../../messages/common/pt-BR.json';

// Base UI's popover and hover card drive floating-ui loops that never settle under happy-dom
// (see DocumentPreviewCard.test.tsx). Closed popups render nothing, so the row's own markup is
// what these tests see.
const closedPopup = {
  Root: ({ children }: { children: ReactNode }) => <>{children}</>,
  Trigger: ({ children, render }: { children?: ReactNode; render?: ReactNode }) => (
    <>{render ?? children}</>
  ),
  Content: () => null,
};
mock.module('@/components/ui/popover', () => ({
  Popover: closedPopup.Root,
  PopoverTrigger: closedPopup.Trigger,
  PopoverAnchor: closedPopup.Trigger,
  PopoverContent: closedPopup.Content,
}));
mock.module('@/components/ui/hover-card', () => ({
  HoverCard: closedPopup.Root,
  HoverCardTrigger: closedPopup.Trigger,
  HoverCardContent: closedPopup.Content,
}));

import { DocumentRow } from './DocumentRow';
import type { DocumentView } from './types';
import type { DocumentRowActionHandlers } from './useDocumentActions';

afterEach(cleanup);

// The row formats in the viewer's own time zone; pin it so the fixture instant is Nov 25 on
// every host (it is Nov 26 at UTC+12 and later).
process.env.TZ = 'UTC';
const UPLOADED_AT = '2026-11-25T12:00:00.000Z';

function renderRow(locale: string, common: Record<string, unknown>, createdAt: string) {
  const doc: DocumentView = {
    id: 'doc-1',
    name: 'Brand Guidelines.pdf',
    source: 'upload',
    createdAt,
    status: 'ready',
    kind: 'pdf',
    pageCount: 12,
  };
  return render(
    <NextIntlClientProvider locale={locale} timeZone="UTC" messages={{ common }}>
      <ul>
        <DocumentRow
          doc={doc}
          isPinned={false}
          now={Date.parse(UPLOADED_AT)}
          actions={{} as DocumentRowActionHandlers}
          onPinnedChange={() => {}}
          onOpenInline={() => {}}
          onDownload={async () => {}}
          onRemove={() => {}}
        />
      </ul>
    </NextIntlClientProvider>,
  );
}

describe('DocumentRow upload date', () => {
  for (const [locale, common, text] of [
    ['en', en, 'Nov 25, 2026'],
    ['es', es, '25 nov 2026'],
    ['pt-BR', pt, '25 de nov. de 2026'],
  ] as const) {
    test(`shows the upload date in ${locale}`, () => {
      const { container } = renderRow(locale, common, UPLOADED_AT);
      const time = container.querySelector('time');
      expect(time?.getAttribute('dateTime')).toBe(UPLOADED_AT);
      expect(time?.textContent).toBe(text);
    });
  }

  test('renders no date for an unparseable timestamp', () => {
    const { container } = renderRow('en', en, 'not-a-date');
    expect(container.querySelector('time')).toBeNull();
    expect(container.textContent).not.toContain('Invalid');
  });
});
