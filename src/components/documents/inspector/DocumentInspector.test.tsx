import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { DocumentLayout, DocumentRegion } from '@continuum/contracts';
import { act, cleanup, fireEvent } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import { DocumentInspector, type DocumentInspectorState } from './DocumentInspector';

afterEach(cleanup);

const region = (over: Partial<DocumentRegion> & Pick<DocumentRegion, 'id'>): DocumentRegion => ({
  category: 'text',
  name: over.id,
  preview: '',
  box: { page: 1, x: 0.1, y: 0.1, w: 0.3, h: 0.1 },
  confidence: 0.9,
  text: '',
  fields: [],
  table: null,
  ...over,
});

const layout: DocumentLayout = {
  documentId: 'd1',
  pageCount: 1,
  model: 'gemini-3.5-flash',
  parsedAt: '2026-11-24T00:00:00Z',
  durationMs: 2400,
  regions: [
    region({
      id: 'r1',
      category: 'party',
      name: 'vendor',
      preview: 'Halvorsen & Pike Ltd.',
      text: 'Halvorsen & Pike Ltd. 14 Wharf Road',
      fields: [{ name: 'company', value: 'Halvorsen & Pike Ltd.', verified: true }],
    }),
    region({
      id: 'r2',
      category: 'amount',
      name: 'totals',
      preview: 'EUR 14,976.00',
      box: { page: 1, x: 0.5, y: 0.8, w: 0.4, h: 0.1 },
      text: 'Subtotal 12,480.00 VAT 2,496.00 Amount due EUR 14,976.00',
      fields: [
        { name: 'amount_due', value: 'EUR 14,976.00', verified: true },
        { name: 'currency', value: 'Euro', verified: false },
      ],
    }),
  ],
};

const parsed: DocumentInspectorState = {
  status: 'parsed',
  layout,
  fileUrl: 'https://signed/invoice.png',
  mimeType: 'image/png',
  cached: false,
};

const rowOf = (container: HTMLElement, id: string) =>
  container.querySelector<HTMLElement>(`[data-row-id="${id}"]`);
const boxOf = (container: HTMLElement, id: string) =>
  container.querySelector<HTMLElement>(`[data-region-id="${id}"]`);

describe('DocumentInspector', () => {
  it('draws every region on the page and lists it, with the parse summary', () => {
    const { container, getByText } = render(
      <DocumentInspector state={parsed} name="invoice.png" />,
    );
    expect(boxOf(container, 'r1')?.style.left).toBe('10.0%');
    expect(boxOf(container, 'r2')?.style.top).toBe('80.0%');
    expect(rowOf(container, 'r1')?.textContent).toContain('Halvorsen & Pike Ltd.');
    expect(getByText(/2 regions · 3 fields/)).toBeTruthy();
    expect(getByText('2.4s')).toBeTruthy();
  });

  it('opens a region into its fields from the page, marking which values were checked', async () => {
    const onSelectRegion = mock((_id: string | null) => {});
    const { container, getByLabelText } = render(
      <DocumentInspector state={parsed} name="invoice.png" onSelectRegion={onSelectRegion} />,
    );
    await act(async () => {
      fireEvent.click(boxOf(container, 'r2') as HTMLElement);
    });
    expect(onSelectRegion).toHaveBeenLastCalledWith('r2');
    expect(boxOf(container, 'r2')?.getAttribute('aria-pressed')).toBe('true');
    expect(boxOf(container, 'r1')?.style.opacity).toBe('0.55');
    expect(rowOf(container, 'r2')?.textContent).toContain('amount_due');
    expect(getByLabelText('Found word for word on the page')).toBeTruthy();
    expect(getByLabelText('Not found word for word on the page; check it')).toBeTruthy();
  });

  it('follows a controlled selection and puts a cited passage back on its region', () => {
    const onSelectRegion = mock((_id: string | null) => {});
    const { container, rerender } = render(
      <DocumentInspector
        state={parsed}
        name="invoice.png"
        selectedRegionId={null}
        onSelectRegion={onSelectRegion}
        focusPassage="the amount due was EUR 14,976.00"
      />,
    );
    expect(onSelectRegion).toHaveBeenCalledWith('r2');
    expect(boxOf(container, 'r2')?.getAttribute('aria-pressed')).toBe('false');
    rerender(
      <DocumentInspector
        state={parsed}
        name="invoice.png"
        selectedRegionId="r1"
        onSelectRegion={onSelectRegion}
      />,
    );
    expect(boxOf(container, 'r1')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('says what is happening before, instead of and after a failed parse', () => {
    const onRerun = mock(() => {});
    const { getByText, rerender } = render(
      <DocumentInspector state={{ status: 'parsing' }} name="x.pdf" onRerun={onRerun} />,
    );
    expect(getByText('Reading the page layout…')).toBeTruthy();
    expect(getByText(/Fields appear here after parsing/)).toBeTruthy();

    rerender(<DocumentInspector state={{ status: 'unsupported' }} name="x.docx" />);
    expect(getByText(/Only PDFs and images can be inspected/)).toBeTruthy();

    rerender(<DocumentInspector state={{ status: 'error' }} name="x.pdf" onRerun={onRerun} />);
    fireEvent.click(getByText('Try again'));
    expect(onRerun).toHaveBeenCalledTimes(1);
  });
});
