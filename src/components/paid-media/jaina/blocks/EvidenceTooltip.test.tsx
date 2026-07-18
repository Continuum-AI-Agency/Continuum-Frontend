import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { EvidenceTooltip } from './EvidenceTooltip';

afterEach(() => {
  cleanup();
});

describe('EvidenceTooltip', () => {
  it('describes computed provenance with tool, period, entity, and record count', () => {
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
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Data provenance' });
    const description = document.getElementById(trigger.getAttribute('aria-describedby') ?? '');
    expect(description?.textContent).toContain('Verified data');
    expect(description?.textContent).toContain('Source: get_top_ads');
    expect(description?.textContent).toContain('Data period: 2026-07-01 → 2026-07-12');
    expect(description?.textContent).toContain('Entity: Campaign One');
    expect(description?.textContent).toContain('Records: 5');
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
