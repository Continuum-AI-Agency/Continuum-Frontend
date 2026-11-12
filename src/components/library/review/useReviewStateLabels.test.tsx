import { afterEach, describe, expect, test } from 'bun:test';
import { DEFAULT_REVIEW_STATE_LABELS } from '@continuum/contracts';
import { cleanup, render, renderHook, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import libraryEs from '../../../../messages/library/es.json';
import libraryPt from '../../../../messages/library/pt-BR.json';
import { setBrandReviewStates, useReviewStateLabels } from './useReviewStateLabels';

afterEach(cleanup);

describe('review label language and authorship', () => {
  for (const entry of [
    {
      locale: 'pt-BR' as const,
      messages: libraryPt,
      draft: 'Rascunho',
      approved: 'Aprovado',
    },
    {
      locale: 'es' as const,
      messages: libraryEs,
      draft: 'Borrador',
      approved: 'Aprobado',
    },
  ]) {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <NextIntlClientProvider
        locale={entry.locale}
        timeZone="UTC"
        messages={{ library: entry.messages }}
      >
        {children}
      </NextIntlClientProvider>
    );

    test(`${entry.locale}: initial defaults use the UI language`, () => {
      const { result } = renderHook(() => useReviewStateLabels(null), {
        wrapper,
      });
      expect(result.current.draft.label).toBe(entry.draft);
      expect(result.current.approved.label).toBe(entry.approved);
    });

    test(`${entry.locale}: origin metadata preserves authored labels, including English defaults`, () => {
      const brandId = `stored-labels-${entry.locale}`;
      setBrandReviewStates(brandId, {
        labels: DEFAULT_REVIEW_STATE_LABELS.map((label) => ({ ...label })),
        customStates: [],
        customizedStates: ['approved'],
      });
      const { result } = renderHook(() => useReviewStateLabels(brandId), {
        wrapper,
      });
      expect(result.current.draft.label).toBe(entry.draft);
      expect(result.current.approved.label).toBe('Approved');
      expect(result.current.approved.color).toBe('#10B981');
    });

    test(`${entry.locale}: older responses preserve label copy without guessing its language`, () => {
      const brandId = `legacy-labels-${entry.locale}`;
      setBrandReviewStates(brandId, {
        labels: DEFAULT_REVIEW_STATE_LABELS.map((label) => ({
          ...label,
          label: label.state === 'draft' ? 'Legal work' : label.label,
        })),
        customStates: [],
      });
      const { result } = renderHook(() => useReviewStateLabels(brandId), {
        wrapper,
      });
      expect(result.current.draft.label).toBe('Legal work');
      expect(result.current.approved.label).toBe('Approved');
    });
  }

  test('switching UI language reuses raw brand labels and preserves the authored override', () => {
    const brandId = 'review-label-language-switch';
    setBrandReviewStates(brandId, {
      labels: DEFAULT_REVIEW_STATE_LABELS.map((label) => ({ ...label })),
      customStates: [],
      customizedStates: ['approved'],
    });
    function Probe() {
      const labels = useReviewStateLabels(brandId);
      return (
        <span>
          {labels.draft.label} · {labels.approved.label}
        </span>
      );
    }
    const view = render(
      <NextIntlClientProvider locale="pt-BR" timeZone="UTC" messages={{ library: libraryPt }}>
        <Probe />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText('Rascunho · Approved')).toBeTruthy();
    view.rerender(
      <NextIntlClientProvider locale="es" timeZone="UTC" messages={{ library: libraryEs }}>
        <Probe />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText('Borrador · Approved')).toBeTruthy();
  });
});
