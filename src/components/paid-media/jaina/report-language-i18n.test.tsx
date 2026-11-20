import { afterEach, describe, expect, it, setSystemTime } from 'bun:test';
import { cleanup, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { DeltaBadge } from '@/components/shared/DeltaBadge';
import { englishMessages, render } from '@/i18n/__tests__/render';
import { frontendCheckpointReportSchema } from '@/lib/jaina/schemas';
import commonPt from '../../../../messages/common/pt-BR.json';
import scalePt from '../../../../messages/scale/pt-BR.json';
import type { AnswerLanguage } from './answerLanguage';
import { AnswerLanguageProvider } from './answerLanguageContext';
import StepsBlock from './blocks/StepsBlock';
import { reportDeltaPresentation } from './reportChrome';
import { buildJainaReportHtml } from './reportExport';

afterEach(() => {
  cleanup();
  setSystemTime();
});

const report = frontendCheckpointReportSchema.parse({
  language: 'en',
  report_title: 'Customer-authored report',
  executive_summary: 'Keep the original language.',
  budget: null,
  performance_snapshot: [{ metric: 'Spend', value: 1234.5, format: 'currency' }],
  blocks: [],
  sections: [],
  strategic_recommendations: [],
  follow_up_questions: [],
  handoff_trace: [],
  execution_objectives: [],
  cached_sources: [],
  graphs: [],
});
const block = {
  block_id: 'steps-locale',
  category: 'steps' as const,
  scope: 'account' as const,
  title: 'Customer-authored title',
  priority: 'primary' as const,
  items: [
    {
      action: 'Original action',
      where: 'Original location',
      expected_effect: 'Original outcome',
      figure: {
        label: 'Original metric',
        value: 1234.5,
        format: 'number' as const,
        unit: null,
        currency: null,
        percent_basis: null,
      },
      cite_ids: [],
    },
  ],
  citations: [],
};

function LocalizedReport({ language }: { language: AnswerLanguage }) {
  return (
    <NextIntlClientProvider
      locale="pt-BR"
      timeZone="UTC"
      messages={{ ...englishMessages, common: commonPt, scale: scalePt }}
    >
      <AnswerLanguageProvider language={language}>
        <StepsBlock block={block} isStreaming={false} />
      </AnswerLanguageProvider>
    </NextIntlClientProvider>
  );
}

describe('Jaina report language remains independent of UI locale', () => {
  it.each([
    ['en', '1,234.5'],
    ['es', '1234,5'],
  ] as const)('prints report figures in %s while the UI is pt-BR', (language, expected) => {
    render(<LocalizedReport language={language} />);
    expect(screen.getByText(expected)).toBeTruthy();
    expect(screen.getByText('Customer-authored title')).toBeTruthy();
    expect(screen.getByText('Original action')).toBeTruthy();
    expect(screen.queryByText('1.234,5')).toBeNull();
  });
  it('keeps legacy exported HTML bytes independent of the surrounding UI and report providers', () => {
    setSystemTime(new Date('2026-11-11T12:34:56Z'));
    const before = JSON.stringify(report);
    const baseline = buildJainaReportHtml({ report, fallbackTables: [] });
    function ExportProbe() {
      return (
        <output data-testid="export-bytes">
          {buildJainaReportHtml({ report, fallbackTables: [] })}
        </output>
      );
    }
    const { rerender } = render(
      <NextIntlClientProvider
        locale="pt-BR"
        timeZone="UTC"
        messages={{ ...englishMessages, common: commonPt, scale: scalePt }}
      >
        <AnswerLanguageProvider language="es">
          <ExportProbe />
        </AnswerLanguageProvider>
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId('export-bytes').textContent).toBe(baseline);
    rerender(
      <NextIntlClientProvider locale="es" timeZone="UTC" messages={englishMessages}>
        <AnswerLanguageProvider language="en">
          <ExportProbe />
        </AnswerLanguageProvider>
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId('export-bytes').textContent).toBe(baseline);
    expect(JSON.stringify(report)).toBe(before);
  });
});

for (const [language, expected] of [
  ['en', 'Down 12%, good'],
  ['es', 'Baja 12%, bueno'],
] as const) {
  it(`keeps report delta judgement in ${language} under pt-BR UI`, () => {
    render(
      <NextIntlClientProvider
        locale="pt-BR"
        timeZone="UTC"
        messages={{ ...englishMessages, common: commonPt, scale: scalePt }}
      >
        <DeltaBadge
          value={-11.6}
          goodWhenDown
          presentation={reportDeltaPresentation(-11.6, true, language)}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole('img', { name: expected })).toBeTruthy();
    expect(screen.getByText('12%')).toBeTruthy();
  });
}
