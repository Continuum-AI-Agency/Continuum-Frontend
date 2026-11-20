import { afterEach, describe, expect, mock, test } from 'bun:test';
import { DOCUMENT_SCOPE_LABELS, documentRenameSchema } from '@continuum/contracts';
import { act, cleanup, fireEvent } from '@testing-library/react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { render } from '@/i18n/__tests__/render';
import en from '../../../messages/common/en.json';
import es from '../../../messages/common/es.json';
import pt from '../../../messages/common/pt-BR.json';
import { DocumentScopeSelect } from './DocumentScopeSelect';
import { RenameDocumentDialog } from './RenameDocumentDialog';
import { type DocumentView, describeError, describeStep } from './types';

afterEach(cleanup);
for (const [locale, common] of [
  ['en', en],
  ['pt-BR', pt],
  ['es', es],
] as const) {
  const t = createTranslator({
    locale,
    namespace: 'common',
    messages: { common },
    onError: (error) => {
      throw error;
    },
  });
  const wrap = (children: ReactNode) => (
    <NextIntlClientProvider
      locale={locale}
      timeZone="UTC"
      messages={{ common }}
      onError={(error) => {
        throw error;
      }}
    >
      {children}
    </NextIntlClientProvider>
  );
  describe(`Document UI boundaries ${locale}`, () => {
    test('localizes schema-required and max-length failures but preserves canonical contract messages and submitted name bytes after existing trim', async () => {
      const submit = mock(async (_name: string) => {});
      const view = render(
        wrap(
          <RenameDocumentDialog open currentName="" onOpenChange={() => {}} onSubmit={submit} />,
        ),
      );
      const input = view.getByRole('textbox');
      const form = document.querySelector('form')!;
      await act(async () => {
        fireEvent.submit(form);
      });
      expect(view.getByText(t('validationRequired'))).toBeTruthy();
      expect(submit).not.toHaveBeenCalled();
      await act(async () => {
        fireEvent.change(input, { target: { value: 'x'.repeat(256) } });
        fireEvent.submit(form);
      });
      expect(view.getByText(t('validationMaxCharacters', { count: 255 }))).toBeTruthy();
      expect(submit).not.toHaveBeenCalled();
      await act(async () => {
        fireEvent.change(input, { target: { value: '  Name is required  ' } });
        fireEvent.submit(form);
      });
      expect(submit).toHaveBeenCalledWith('Name is required');
      const invalid = documentRenameSchema.safeParse({ displayName: ' ' });
      expect(invalid.success).toBe(false);
      if (!invalid.success) expect(invalid.error.issues[0].message).toBe('Name is required');
    });
    test('localizes scope options while selecting the original canonical scope value', async () => {
      const canonical = { ...DOCUMENT_SCOPE_LABELS };
      const change = mock((_value: string) => {});
      const view = render(wrap(<DocumentScopeSelect value="active" onChange={change} />));
      expect(view.getByRole('combobox').textContent).toContain(t('active_9234069'));
      await act(async () => {
        fireEvent.click(view.getByRole('combobox'));
      });
      await act(async () => {
        const option = view.getByRole('option', { name: t('m_33d5667cd5') });
        option.focus();
        fireEvent.keyDown(option, { key: 'Enter' });
      });
      expect(change).toHaveBeenCalledWith('temporary');
      expect(DOCUMENT_SCOPE_LABELS).toEqual(canonical);
    });
    test('localizes a transient typed watchdog timeout without parsing or replacing the raw error diagnostic', () => {
      const doc: DocumentView = {
        id: 'doc-1',
        name: 'Authored file.pdf',
        source: 'upload',
        createdAt: '2026-11-11T20:00:00Z',
        status: 'error',
        errorMessage: 'Opaque original SDK failure',
        uiErrorCode: 'PROCESSING_TIMEOUT',
      };
      const before = structuredClone(doc);
      expect(describeError(doc.errorCode, doc.errorMessage, t, doc.uiErrorCode)).toBe(
        t('documentProcessingTimeout'),
      );
      expect(describeStep(doc, t, locale)).toEqual({
        text: t('documentProcessingTimeout'),
        tone: 'error',
      });
      expect(describeError('EMPTY_TEXT', doc.errorMessage, t, doc.uiErrorCode)).toBe(
        t('m_d36e64a5fe'),
      );
      expect(describeError(undefined, doc.errorMessage)).toBe('Opaque original SDK failure');
      expect(doc).toEqual(before);
    });
  });
}
