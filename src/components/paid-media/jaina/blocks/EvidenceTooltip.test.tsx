import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { AnswerLanguageProvider } from '../answerLanguageContext';
import { EvidenceTooltip } from './EvidenceTooltip';

afterEach(() => {
  cleanup();
});

describe('EvidenceTooltip', () => {
  it('describes computed provenance with period, entity, record and reference counts', () => {
    render(
      <EvidenceTooltip
        provenance={{
          source: 'computed',
          tool: 'get_top_ads',
          period: { since: '2026-07-01', until: '2026-07-12', requested_label: null },
          entity_label: 'Campaign One',
          record_count: 5,
        }}
        datasetId="ds_ab12cd34"
        evidenceRefs={['row:ad-1:18-24:female', 'meta:insights:act-1']}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Data provenance' });
    const description = document.getElementById(trigger.getAttribute('aria-describedby') ?? '');
    expect(description?.textContent).toContain('Verified data');
    expect(description?.textContent).toContain('Data period: 2026-07-01 → 2026-07-12');
    expect(description?.textContent).toContain('Entity: Campaign One');
    expect(description?.textContent).toContain('Records: 5');
    expect(description?.textContent).toContain('Evidence references: 2');
    expect(description?.textContent).toContain(
      'derived classifications remain separately identified',
    );
  });

  it('falls back to model-authored framing when no provenance or dataset id exists', () => {
    render(<EvidenceTooltip provenance={null} datasetId={null} />);
    const trigger = screen.getByRole('button', { name: 'Data provenance' });
    const description = document.getElementById(trigger.getAttribute('aria-describedby') ?? '');
    expect(description?.textContent).toContain('Model-authored');
    expect(description?.textContent).toContain('Cross-check important figures');
  });

  it('treats a bare dataset_id (legacy block without provenance) as computed', () => {
    render(<EvidenceTooltip provenance={null} datasetId="ds_legacy1" />);
    const trigger = screen.getByRole('button', { name: 'Data provenance' });
    const description = document.getElementById(trigger.getAttribute('aria-describedby') ?? '');
    expect(description?.textContent).toContain('Verified data');
  });
});

// gate-p3 follow-up 2: a screen reader announced each ⓘ beside a Spanish answer as "Verified data.
// … Source: get_key_metrics. Entity: account-521903353286118. … ds_7854f4c5. ds_e940f907" (the
// beta re-shots' visible text). The hover panel keeps the tool and ids for checking; what is read
// on focus, every time, is the reader's.
describe('EvidenceTooltip, as a screen reader says it', () => {
  const props = {
    provenance: {
      source: 'computed' as const,
      tool: 'get_key_metrics',
      period: { since: '2026-10-06', until: '2026-10-19', requested_label: null },
      entity_label: 'account-521903353286118',
      record_count: 14,
    },
    datasetId: 'ds_7854f4c5',
    evidenceRefs: ['ds_7854f4c5', 'ds_e940f907'],
  };
  const describedText = (name: string) => {
    const trigger = screen.getByRole('button', { name });
    return (
      document.getElementById(trigger.getAttribute('aria-describedby') ?? '')?.textContent ?? ''
    );
  };

  it('follows the answer language', () => {
    render(
      <AnswerLanguageProvider language="es">
        <EvidenceTooltip {...props} />
      </AnswerLanguageProvider>,
    );
    const text = describedText('Origen de los datos');
    expect(text).toContain('Datos verificados');
    expect(text).toContain('Periodo de datos: 2026-10-06 → 2026-10-19');
    expect(text).toContain('Registros: 14');
    expect(text).toContain('Referencias de evidencia: 2');
    expect(text).not.toMatch(/Verified|Source|Data period|Records|Evidence references/);
  });

  it('names no tool, dataset id or entity id, in either language', () => {
    for (const [language, name] of [
      ['es', 'Origen de los datos'],
      ['en', 'Data provenance'],
    ] as const) {
      render(
        <AnswerLanguageProvider language={language}>
          <EvidenceTooltip {...props} />
        </AnswerLanguageProvider>,
      );
      expect(describedText(name)).not.toMatch(/get_key_metrics|ds_|521903353286118/);
      cleanup();
    }
  });

  it('keeps an entity that has a name', () => {
    render(
      <EvidenceTooltip
        {...props}
        provenance={{ ...props.provenance, entity_label: 'ITESO // MENSAJES' }}
      />,
    );
    expect(describedText('Data provenance')).toContain('Entity: ITESO // MENSAJES');
  });
});
