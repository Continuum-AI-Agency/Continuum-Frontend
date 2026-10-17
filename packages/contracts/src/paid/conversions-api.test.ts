import { describe, expect, test } from 'bun:test';
import {
  applyCapiFieldMap,
  capiCsvFieldMap,
  capiEventInputSchema,
  capiEventTimeProblem,
  capiSendRequestSchema,
} from './conversions-api';

const NOW = 1_760_400_000;

const lead = {
  event_name: 'Lead',
  event_time: NOW - 60,
  action_source: 'system_generated' as const,
  user: { email: 'ana@example.com' },
};

describe('capiEventInputSchema', () => {
  test('accepts a CRM lead with one identifier', () => {
    expect(capiEventInputSchema.safeParse(lead).success).toBe(true);
  });

  test('refuses an event Meta could never match', () => {
    const result = capiEventInputSchema.safeParse({ ...lead, user: { first_name: 'Ana' } });
    expect(result.success).toBe(false);
  });

  test('IP alone is not an identifier, IP + user agent is', () => {
    const ipOnly = { ...lead, user: { client_ip_address: '203.0.113.5' } };
    const ipAndAgent = { ...lead, user: { ...ipOnly.user, client_user_agent: 'Mozilla/5.0' } };
    expect(capiEventInputSchema.safeParse(ipOnly).success).toBe(false);
    expect(capiEventInputSchema.safeParse(ipAndAgent).success).toBe(true);
  });

  test('website events need a source url and a user agent', () => {
    const website = { ...lead, action_source: 'website' as const };
    expect(capiEventInputSchema.safeParse(website).success).toBe(false);
    expect(
      capiEventInputSchema.safeParse({
        ...website,
        event_source_url: 'https://shop.example.com/thanks',
        user: { ...lead.user, client_user_agent: 'Mozilla/5.0' },
      }).success,
    ).toBe(true);
  });

  test('a Purchase needs value and currency', () => {
    const purchase = { ...lead, event_name: 'Purchase' };
    expect(capiEventInputSchema.safeParse(purchase).success).toBe(false);
    expect(
      capiEventInputSchema.safeParse({ ...purchase, custom_data: { value: 49.9, currency: 'USD' } })
        .success,
    ).toBe(true);
  });

  test('a send request caps the batch at 1000', () => {
    const request = {
      brandId: 'b17d8151-a9b9-4579-b1d2-7e8f01c2e9dc',
      source: 'csv',
      test: true,
      events: Array.from({ length: 1_001 }, () => lead),
    };
    expect(capiSendRequestSchema.safeParse(request).success).toBe(false);
    expect(
      capiSendRequestSchema.safeParse({ ...request, events: request.events.slice(1) }).success,
    ).toBe(true);
  });
});

describe('capiEventTimeProblem', () => {
  const event = capiEventInputSchema.parse(lead);

  test('inside the 7-day window passes', () => {
    expect(capiEventTimeProblem(event, NOW)).toBeNull();
  });

  test('older than 7 days fails, unless it is a physical-store event within 62', () => {
    const old = { ...event, event_time: NOW - 8 * 86_400 };
    expect(capiEventTimeProblem(old, NOW)).toContain('7 days');
    expect(capiEventTimeProblem({ ...old, action_source: 'physical_store' }, NOW)).toBeNull();
    expect(
      capiEventTimeProblem(
        { ...old, action_source: 'physical_store', event_time: NOW - 63 * 86_400 },
        NOW,
      ),
    ).toContain('62 days');
  });

  test('the future fails beyond a small clock-skew tolerance', () => {
    expect(capiEventTimeProblem({ ...event, event_time: NOW + 60 }, NOW)).toBeNull();
    expect(capiEventTimeProblem({ ...event, event_time: NOW + 3_600 }, NOW)).toContain('future');
  });
});

describe('applyCapiFieldMap', () => {
  const hubspot = {
    objectId: 9001,
    properties: { email: ' Ana@Example.com ', phone: 5551234567, amount: '1,250.50' },
    occurredAt: 1_760_399_000_000,
    lines: [{ sku: 'PLAN-PRO' }],
  };

  test('maps a native payload by dot path, coercing ms timestamps, numbers and amounts', () => {
    const mapped = applyCapiFieldMap(
      hubspot,
      {
        eventName: 'Purchase',
        actionSource: 'system_generated',
        fieldMap: {
          email: 'properties.email',
          phone: 'properties.phone',
          value: 'properties.amount',
          currency: 'properties.missing',
          event_time: 'occurredAt',
          event_id: 'objectId',
          content_name: 'lines.0.sku',
        },
      },
      NOW,
    );
    // Purchase without a currency is refused — the mapping surfaces why.
    expect(mapped.ok).toBe(false);
    if (!mapped.ok) expect(mapped.issues.join(' ')).toContain('currency');
  });

  test('a complete mapping yields the event, with the receipt time when none is mapped', () => {
    const mapped = applyCapiFieldMap(
      hubspot,
      {
        eventName: 'Lead',
        actionSource: 'system_generated',
        fieldMap: {
          email: 'properties.email',
          phone: 'properties.phone',
          value: 'properties.amount',
          event_id: 'objectId',
        },
      },
      NOW,
    );
    expect(mapped).toEqual({
      ok: true,
      event: {
        event_name: 'Lead',
        event_time: NOW,
        event_id: '9001',
        action_source: 'system_generated',
        user: { email: 'Ana@Example.com', phone: '5551234567' },
        custom_data: { value: 1250.5 },
      },
    });
  });

  test('a mapped event_name overrides the source default; ISO times parse', () => {
    const mapped = applyCapiFieldMap(
      { kind: 'Schedule', at: '2025-10-13T22:00:00Z', who: { mail: 'x@y.co' } },
      {
        eventName: 'Lead',
        actionSource: 'system_generated',
        fieldMap: { event_name: 'kind', event_time: 'at', email: 'who.mail' },
      },
      NOW,
    );
    expect(mapped.ok && mapped.event.event_name).toBe('Schedule');
    expect(mapped.ok && mapped.event.event_time).toBe(Date.parse('2025-10-13T22:00:00Z') / 1_000);
  });

  test('order_id doubles as the dedupe key when no event_id is mapped', () => {
    const mapped = applyCapiFieldMap(
      { email: 'a@b.co', order: 'SO-77' },
      {
        eventName: 'Lead',
        actionSource: 'physical_store',
        fieldMap: { email: 'email', order_id: 'order' },
      },
      NOW,
    );
    expect(mapped.ok && mapped.event.event_id).toBe('SO-77');
  });
});

describe('capiCsvFieldMap', () => {
  test('keeps recognized headers (case-insensitive) and drops the rest', () => {
    expect(capiCsvFieldMap(['Email', 'phone', 'Notes', 'value'])).toEqual({
      email: 'Email',
      phone: 'phone',
      value: 'value',
    });
  });
});
