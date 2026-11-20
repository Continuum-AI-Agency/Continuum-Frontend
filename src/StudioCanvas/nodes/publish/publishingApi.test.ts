import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  CAPTION_NOT_SAVED_MESSAGE,
  draftHasSavedCaption,
  publishingApi,
  WRONG_DRAFT_SAVED_MESSAGE,
} from './publishingApi';

// Only the network is stubbed: the real client builds the request and parses the answer.
const BRAND_ID = '78a7a5fa-0000-4000-8000-000000000001';
const DRAFT_ID = 'd4c93d67-0000-4000-8000-000000000002';
const OTHER_DRAFT_ID = '3e4b229f-0000-4000-8000-000000000003';

const originalFetch = globalThis.fetch;
let urls: string[] = [];
let writeAnswer: Record<string, unknown>;
let intentAnswer: { status: number; body: unknown };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  urls = [];
  writeAnswer = { draftId: DRAFT_ID, updatedAt: '2026-11-19T20:21:00Z', created: false };
  intentAnswer = {
    status: 200,
    body: { caption: { present: true, length: 12, preview: 'Hola, mundo!' } },
  };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    return url.includes('/publish-intent')
      ? json(intentAnswer.body, intentAnswer.status)
      : json(writeAnswer);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('publishingApi.writeOrganicDraft', () => {
  it('returns once the caption it sent reads back on the draft', async () => {
    const result = await publishingApi.writeOrganicDraft({
      brandId: BRAND_ID,
      draftId: DRAFT_ID,
      caption: 'Hola, mundo!',
    });

    expect(result.draftId).toBe(DRAFT_ID);
    expect(urls.at(-1)).toContain(`/api/organic/calendar/drafts/${DRAFT_ID}/publish-intent`);
  });

  it('refuses an ok that left the draft without a caption', async () => {
    intentAnswer = { status: 200, body: { caption: { present: false, length: 0, preview: null } } };

    await expect(
      publishingApi.writeOrganicDraft({ brandId: BRAND_ID, draftId: DRAFT_ID, caption: 'Hola' }),
    ).rejects.toThrow(CAPTION_NOT_SAVED_MESSAGE);
  });

  it('refuses an ok for a different draft than the one asked for', async () => {
    writeAnswer = { ...writeAnswer, draftId: OTHER_DRAFT_ID };

    await expect(
      publishingApi.writeOrganicDraft({ brandId: BRAND_ID, draftId: DRAFT_ID, caption: 'Hola' }),
    ).rejects.toThrow(WRONG_DRAFT_SAVED_MESSAGE);
  });

  it('does not read back a caption it never sent', async () => {
    await publishingApi.writeOrganicDraft({
      brandId: BRAND_ID,
      draftId: DRAFT_ID,
      format: 'image',
    });

    expect(urls.some((url) => url.includes('/publish-intent'))).toBe(false);
  });
});

describe('draftHasSavedCaption', () => {
  it('is false when the read-back fails, never assumed saved', async () => {
    intentAnswer = { status: 404, body: { error: 'Draft not found' } };

    expect(await draftHasSavedCaption(DRAFT_ID)).toBe(false);
  });
});
