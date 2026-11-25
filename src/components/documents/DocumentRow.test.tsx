import { describe, expect, it } from 'bun:test';
import { NextIntlClientProvider } from 'next-intl';
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import en from '../../../messages/common/en.json';
import es from '../../../messages/common/es.json';

import { DocumentRow } from './DocumentRow';

const props: ComponentProps<typeof DocumentRow> = {
  doc: {
    id: 'doc-1',
    name: 'Brand Guidelines.pdf',
    source: 'upload',
    createdAt: '2026-01-15T12:00:00.000Z',
    status: 'ready',
    kind: 'pdf',
  },
  isPinned: false,
  now: Date.parse('2026-01-16T12:00:00Z'),
  actions: {
    onOpenInline: () => {},
    onDownload: async () => {},
    onRename: async () => {},
    onReplaceFile: async () => {},
    onArchive: async () => {},
    onRestore: async () => {},
    onDeletePermanently: async () => {},
    onSavePermanently: async () => {},
    onCategoryChange: async () => {},
  },
  onPinnedChange: () => {},
  onOpenInline: () => {},
  onDownload: async () => {},
  onRemove: () => {},
};

function renderRow(locale: 'en' | 'es', overrides: Partial<typeof props> = {}) {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      timeZone="UTC"
      messages={{ common: locale === 'es' ? es : en }}
    >
      <DocumentRow {...props} {...overrides} />
    </NextIntlClientProvider>,
  );
}

describe('document upload date in the brand knowledge row', () => {
  it.each([
    ['en', 'Added', 'Jan 15, 2026', 'Ready'],
    ['es', 'Agregado', '15 ene 2026', 'Listo'],
  ] as const)('shows the existing upload date and status in %s', (locale, label, date, status) => {
    const html = renderRow(locale, { showUploadDate: true });
    expect(html).toContain('Brand Guidelines.pdf');
    expect(html).toContain(label);
    expect(html).toContain(date);
    expect(html).toContain(status);
  });

  it('keeps the upload date hidden for existing callers such as onboarding', () => {
    expect(renderRow('en')).not.toContain('Jan 15, 2026');
    expect(renderRow('en')).not.toContain('Added');
  });

  it.each([
    '',
    'invalid',
  ])('uses the existing fallback for an unavailable date: %s', (createdAt) => {
    const html = renderRow('en', {
      showUploadDate: true,
      doc: { ...props.doc, createdAt },
    });
    expect(html).toContain('—');
    expect(html).not.toContain('Invalid Date');
  });
});
