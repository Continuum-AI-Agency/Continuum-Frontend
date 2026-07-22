import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  buildCalendarGenerationPayload,
  streamCalendarGeneration,
} from '@/components/organic/primitives/organic-calendar-api';
import type {
  CalendarGenerationEvent,
  CalendarGenerationRequest,
} from '@/lib/organic/calendar-generation';

describe('organic-calendar-api', () => {
  const mockFetch = mock(() => {});
  global.fetch = mockFetch;

  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('buildCalendarGenerationPayload', () => {
    test('validates and returns valid payload', () => {
      const payload: CalendarGenerationRequest = {
        brandProfileId: 'brand-123',
        weekStart: '2026-01-26',
        timezone: 'America/New_York',
        placements: [
          {
            placementId: 'placement-1',
            trendId: 'trend-1',
            dayId: '2026-01-26',
            scheduledAt: '2026-01-26T09:00:00.000Z',
            timeLabel: '9:00 AM',
            platform: 'instagram',
            accountId: 'ig-account-1',
            seedSource: 'trend',
            desiredFormat: 'Post',
          },
        ],
        platformAccountIds: { instagram: 'ig-account-1' },
        options: {
          schedulePreset: 'beta-launch',
          includeNewsletter: true,
          guidancePrompt: 'Generate engaging content',
          language: 'en',
          preferredPlatforms: ['instagram'],
        },
      };

      const result = buildCalendarGenerationPayload(payload);
      expect(result.brandProfileId).toBe('brand-123');
      expect(result.placements).toHaveLength(1);
      expect(result.options?.schedulePreset).toBe('beta-launch');
    });

    test('throws on invalid payload', () => {
      const invalidPayload = {
        brandProfileId: '',
        weekStart: '2026-01-26',
        timezone: 'America/New_York',
        placements: [],
      };

      expect(() => buildCalendarGenerationPayload(invalidPayload as any)).toThrow();
    });

    test('handles minimal valid payload', () => {
      const minimalPayload: CalendarGenerationRequest = {
        brandProfileId: 'brand-123',
        weekStart: '2026-01-26',
        timezone: 'UTC',
        placements: [],
      };

      const result = buildCalendarGenerationPayload(minimalPayload);
      expect(result.brandProfileId).toBe('brand-123');
      expect(result.placements).toEqual([]);
    });
  });

  describe('streamCalendarGeneration', () => {
    test('calls fetch with correct headers and body', async () => {
      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: mock(() =>
              Promise.resolve({
                done: true,
                value: undefined,
              }),
            ),
          }),
        },
      };
      mockFetch.mockImplementationOnce(() => Promise.resolve(mockResponse));

      const payload: CalendarGenerationRequest = {
        brandProfileId: 'brand-123',
        weekStart: '2026-01-26',
        timezone: 'UTC',
        placements: [],
      };

      const events: CalendarGenerationEvent[] = [];
      await streamCalendarGeneration(payload, (event) => {
        events.push(event);
      });

      expect(mockFetch).toHaveBeenCalled();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/organic/generate-calendar');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['Accept']).toBe('application/x-ndjson');
      expect(JSON.parse(options.body)).toEqual(payload);
    });

    test('parses progress events from NDJSON stream', async () => {
      const encoder = new TextEncoder();
      const progressData = encoder.encode(
        JSON.stringify({ type: 'progress', completed: 1, total: 5, message: 'Processing...' }) +
          '\n',
      );

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => {
            let readCount = 0;
            return {
              read: mock(() => {
                readCount++;
                if (readCount === 1) {
                  return Promise.resolve({ done: false, value: progressData });
                }
                return Promise.resolve({ done: true });
              }),
            };
          },
        },
      };
      mockFetch.mockImplementationOnce(() => Promise.resolve(mockResponse));

      const payload: CalendarGenerationRequest = {
        brandProfileId: 'brand-123',
        weekStart: '2026-01-26',
        timezone: 'UTC',
        placements: [],
      };

      const events: CalendarGenerationEvent[] = [];
      await streamCalendarGeneration(payload, (event) => {
        events.push(event);
      });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('progress');
      expect((events[0] as any).completed).toBe(1);
      expect((events[0] as any).total).toBe(5);
    });

    test('parses placement events from NDJSON stream', async () => {
      const encoder = new TextEncoder();
      const placementData = encoder.encode(
        JSON.stringify({
          type: 'placement',
          placement: {
            placementId: 'placement-1',
            schedule: { dayId: '2026-01-26', scheduledAt: '2026-01-26T09:00:00.000Z' },
            platform: { name: 'instagram' },
            content: { type: 'Post', format: 'Reel', titleTopic: 'Test Content' },
          },
        }) + '\n',
      );

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => {
            let readCount = 0;
            return {
              read: mock(() => {
                readCount++;
                if (readCount === 1) {
                  return Promise.resolve({ done: false, value: placementData });
                }
                return Promise.resolve({ done: true });
              }),
            };
          },
        },
      };
      mockFetch.mockImplementationOnce(() => Promise.resolve(mockResponse));

      const payload: CalendarGenerationRequest = {
        brandProfileId: 'brand-123',
        weekStart: '2026-01-26',
        timezone: 'UTC',
        placements: [],
      };

      const events: CalendarGenerationEvent[] = [];
      await streamCalendarGeneration(payload, (event) => {
        events.push(event);
      });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('placement');
    });

    test('parses error events from NDJSON stream', async () => {
      const encoder = new TextEncoder();
      const errorData = encoder.encode(
        JSON.stringify({
          type: 'error',
          code: 'GENERATION_FAILED',
          message: 'Failed to generate',
        }) + '\n',
      );

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => {
            let readCount = 0;
            return {
              read: mock(() => {
                readCount++;
                if (readCount === 1) {
                  return Promise.resolve({ done: false, value: errorData });
                }
                return Promise.resolve({ done: true });
              }),
            };
          },
        },
      };
      mockFetch.mockImplementationOnce(() => Promise.resolve(mockResponse));

      const payload: CalendarGenerationRequest = {
        brandProfileId: 'brand-123',
        weekStart: '2026-01-26',
        timezone: 'UTC',
        placements: [],
      };

      const events: CalendarGenerationEvent[] = [];
      await streamCalendarGeneration(payload, (event) => {
        events.push(event);
      });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('error');
      expect((events[0] as any).message).toBe('Failed to generate');
    });

    test('parses complete event from NDJSON stream', async () => {
      const encoder = new TextEncoder();
      const completeData = encoder.encode(JSON.stringify({ type: 'complete' }) + '\n');

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => {
            let readCount = 0;
            return {
              read: mock(() => {
                readCount++;
                if (readCount === 1) {
                  return Promise.resolve({ done: false, value: completeData });
                }
                return Promise.resolve({ done: true });
              }),
            };
          },
        },
      };
      mockFetch.mockImplementationOnce(() => Promise.resolve(mockResponse));

      const payload: CalendarGenerationRequest = {
        brandProfileId: 'brand-123',
        weekStart: '2026-01-26',
        timezone: 'UTC',
        placements: [],
      };

      const events: CalendarGenerationEvent[] = [];
      await streamCalendarGeneration(payload, (event) => {
        events.push(event);
      });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('complete');
    });

    test('handles multiple events in single stream chunk', async () => {
      const encoder = new TextEncoder();
      const multiEventData = encoder.encode(
        JSON.stringify({ type: 'progress', completed: 1, total: 3 }) +
          '\n' +
          JSON.stringify({ type: 'progress', completed: 2, total: 3 }) +
          '\n' +
          JSON.stringify({ type: 'complete' }) +
          '\n',
      );

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => {
            let readCount = 0;
            return {
              read: mock(() => {
                readCount++;
                if (readCount === 1) {
                  return Promise.resolve({ done: false, value: multiEventData });
                }
                return Promise.resolve({ done: true });
              }),
            };
          },
        },
      };
      mockFetch.mockImplementationOnce(() => Promise.resolve(mockResponse));

      const payload: CalendarGenerationRequest = {
        brandProfileId: 'brand-123',
        weekStart: '2026-01-26',
        timezone: 'UTC',
        placements: [],
      };

      const events: CalendarGenerationEvent[] = [];
      await streamCalendarGeneration(payload, (event) => {
        events.push(event);
      });

      expect(events).toHaveLength(3);
      expect(events[0].type).toBe('progress');
      expect(events[1].type).toBe('progress');
      expect(events[2].type).toBe('complete');
    });

    test('throws error on non-ok response', async () => {
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: 'Server error' }),
        }),
      );

      const payload: CalendarGenerationRequest = {
        brandProfileId: 'brand-123',
        weekStart: '2026-01-26',
        timezone: 'UTC',
        placements: [],
      };

      await expect(streamCalendarGeneration(payload, () => {})).rejects.toThrow('Server error');
    });

    test('throws error when response has no body', async () => {
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          body: null,
        }),
      );

      const payload: CalendarGenerationRequest = {
        brandProfileId: 'brand-123',
        weekStart: '2026-01-26',
        timezone: 'UTC',
        placements: [],
      };

      await expect(streamCalendarGeneration(payload, () => {})).rejects.toThrow(
        'Failed to start calendar generation',
      );
    });

    test('handles incomplete JSON lines across chunks', async () => {
      const encoder = new TextEncoder();
      const chunk1 = encoder.encode('{"type": "progress", "completed": 1, ');
      const chunk2 = encoder.encode('"total": 2}\n');

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => {
            let readCount = 0;
            return {
              read: mock(() => {
                readCount++;
                if (readCount === 1) {
                  return Promise.resolve({ done: false, value: chunk1 });
                } else if (readCount === 2) {
                  return Promise.resolve({ done: false, value: chunk2 });
                }
                return Promise.resolve({ done: true });
              }),
            };
          },
        },
      };
      mockFetch.mockImplementationOnce(() => Promise.resolve(mockResponse));

      const payload: CalendarGenerationRequest = {
        brandProfileId: 'brand-123',
        weekStart: '2026-01-26',
        timezone: 'UTC',
        placements: [],
      };

      const events: CalendarGenerationEvent[] = [];
      await streamCalendarGeneration(payload, (event) => {
        events.push(event);
      });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('progress');
    });

    test('skips invalid JSON lines', async () => {
      const encoder = new TextEncoder();
      const mixedData = encoder.encode(
        JSON.stringify({ type: 'progress', completed: 1, total: 2 }) +
          '\n' +
          'invalid json line\n' +
          JSON.stringify({ type: 'complete' }) +
          '\n',
      );

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => {
            let readCount = 0;
            return {
              read: mock(() => {
                readCount++;
                if (readCount === 1) {
                  return Promise.resolve({ done: false, value: mixedData });
                }
                return Promise.resolve({ done: true });
              }),
            };
          },
        },
      };
      mockFetch.mockImplementationOnce(() => Promise.resolve(mockResponse));

      const payload: CalendarGenerationRequest = {
        brandProfileId: 'brand-123',
        weekStart: '2026-01-26',
        timezone: 'UTC',
        placements: [],
      };

      const events: CalendarGenerationEvent[] = [];
      await streamCalendarGeneration(payload, (event) => {
        events.push(event);
      });

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('progress');
      expect(events[1].type).toBe('complete');
    });
  });
});
