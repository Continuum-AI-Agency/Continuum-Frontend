import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { CapiSource } from '@continuum/contracts';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FieldMapEditor } from './CapiSourcesPanel';

afterEach(cleanup);

const source: CapiSource = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'HubSpot closed-won',
  publicId: 'capi_public_1',
  eventName: 'Purchase',
  actionSource: 'system_generated',
  fieldMap: { email: 'contact.email', value: 'deal.lines.0.amount', currency: 'deal.ccy' },
  requireSignature: false,
  enabled: true,
  lastReceivedAt: null,
  createdAt: '2026-10-14T00:00:00.000Z',
};

const paste = (payload: unknown) =>
  fireEvent.change(screen.getByLabelText('Sample payload (JSON)'), {
    target: { value: JSON.stringify(payload) },
  });

describe('FieldMapEditor', () => {
  test('previews the mapped event live, then shows why a payload would be refused', async () => {
    const onSave = mock(async () => {});
    render(<FieldMapEditor source={source} readOnly={false} onSave={onSave} />);

    paste({
      contact: { email: 'ada@example.com' },
      deal: { ccy: 'EUR', lines: [{ amount: 120 }] },
    });
    const preview = screen.getByText(/"email": "ada@example.com"/);
    expect(preview.textContent).toContain('"value": 120');
    expect(preview.textContent).toContain('"event_name": "Purchase"');

    paste({ contact: {}, deal: { ccy: 'EUR', lines: [{ amount: 120 }] } });
    expect(screen.getByText(/needs at least one of email/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Sample payload (JSON)'), { target: { value: '{' } });
    expect(screen.getByText('That is not valid JSON.')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save mapping' }));
    });
    expect(onSave).toHaveBeenCalledWith(source.fieldMap);
  });
});
