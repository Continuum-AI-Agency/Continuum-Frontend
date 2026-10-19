// The Frontend benches' production mode, at $0 against fake health routes. GREEN: a run on
// https://app.trycontinuum.ai that saw one valid Frontend and one valid Backend revision before
// and after records two PASS steps and the `verified production revision: <frontend rev>` note the
// scorecard's Live point binds to. NEGATIVE: an unlisted origin is refused before any session is
// minted; beta never gets the note; a revision that changed or broke mid-run is a FAIL with no note.
import { describe, expect, test } from 'bun:test';
import { REVISION_STEP as BACKEND_STEP } from '../../../Continuum-Backend/scripts/_bench/prodRevision';
import {
  FRONTEND_REVISION_STEP,
  PRODUCTION_BACKEND,
  PRODUCTION_FRONTEND,
  productionOrigin,
  servingRevisions,
  verifyServingRevisions,
} from './prodMode';

const BETA = 'https://app.beta.trycontinuum.ai';
const FE = 'e56178e';
const BE = 'b568efbc';

/** Health routes that serve each body in turn per URL, recording the URLs asked for. */
function health(routes: Record<string, Array<{ status?: number; body: unknown }>>) {
  const asked: string[] = [];
  const fetcher = async (url: string) => {
    asked.push(url);
    const next = routes[url]?.shift();
    if (!next) throw new Error(`${url} asked more times than the test served`);
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
  };
  return { fetcher, asked };
}
const feHealth = (origin: string) => `${origin}/api/healthz`;
const beHealth = `${PRODUCTION_BACKEND}/healthz`;

function recorder() {
  const steps: Array<{ step: string; ok: boolean; detail?: string }> = [];
  const notes: string[] = [];
  return {
    steps,
    notes,
    check: (step: string, ok: boolean, detail?: string) => steps.push({ step, ok, detail }),
    note: (message: string) => notes.push(message),
  };
}

describe('productionOrigin', () => {
  test('unset or empty: the local mode', () => {
    expect(productionOrigin(undefined)).toBeUndefined();
    expect(productionOrigin('')).toBeUndefined();
  });

  test('1 is the production Frontend', () => {
    expect(productionOrigin('1')).toBe(PRODUCTION_FRONTEND);
    expect(PRODUCTION_FRONTEND).toBe('https://app.trycontinuum.ai');
  });

  test('an allowed origin, without its trailing slashes', () => {
    expect(productionOrigin(`${BETA}/`)).toBe(BETA);
    expect(productionOrigin(PRODUCTION_FRONTEND)).toBe(PRODUCTION_FRONTEND);
  });

  test.each([
    'http://app.trycontinuum.ai',
    'https://app.trycontinuum.ai.example.com',
    'https://app.trycontinuum.ai:8443',
    'https://staging.trycontinuum.ai',
    'http://localhost:3000',
    'true',
    '0',
  ])('refuses %s: the bench session never goes to an unlisted host', (value) => {
    expect(() => productionOrigin(value)).toThrow('VIDEO_EDITOR_PROD');
  });
});

describe('servingRevisions', () => {
  test('reads the Frontend /api/healthz and the production Backend /healthz', async () => {
    const { fetcher, asked } = health({
      [feHealth(PRODUCTION_FRONTEND)]: [{ body: { status: 'ok', rev: FE } }],
      [beHealth]: [{ body: { ok: true, rev: BE } }],
    });
    expect(await servingRevisions(PRODUCTION_FRONTEND, fetcher)).toEqual({
      frontend: FE,
      backend: BE,
    });
    expect(asked.toSorted()).toEqual([beHealth, feHealth(PRODUCTION_FRONTEND)].toSorted());
  });

  test.each([
    ['a Frontend built without its commit', { rev: 'unknown' }],
    ['uppercase hex', { rev: 'E56178E' }],
    ['too short', { rev: 'e5617' }],
    ['no revision', { status: 'ok' }],
  ])('refuses %s', async (_, body) => {
    const { fetcher } = health({
      [feHealth(PRODUCTION_FRONTEND)]: [{ body }],
      [beHealth]: [{ body: { rev: BE } }],
    });
    await expect(servingRevisions(PRODUCTION_FRONTEND, fetcher)).rejects.toThrow('/api/healthz');
  });

  test('refuses a Backend revision on a failed response', async () => {
    const { fetcher } = health({
      [feHealth(PRODUCTION_FRONTEND)]: [{ body: { rev: FE } }],
      [beHealth]: [{ status: 503, body: { rev: BE } }],
    });
    await expect(servingRevisions(PRODUCTION_FRONTEND, fetcher)).rejects.toThrow('/healthz');
  });
});

describe('verifyServingRevisions', () => {
  const before = { frontend: FE, backend: BE };

  test('production, both held: two PASS steps and the note naming the Frontend revision', async () => {
    const rec = recorder();
    const { fetcher } = health({
      [feHealth(PRODUCTION_FRONTEND)]: [{ body: { rev: FE } }],
      [beHealth]: [{ body: { rev: BE } }],
    });
    expect(await verifyServingRevisions(rec, PRODUCTION_FRONTEND, before, fetcher)).toBe(true);
    expect(rec.steps).toEqual([
      { step: FRONTEND_REVISION_STEP, ok: true, detail: `${PRODUCTION_FRONTEND} ${FE} → ${FE}` },
      { step: BACKEND_STEP, ok: true, detail: `${PRODUCTION_BACKEND} ${BE} → ${BE}` },
    ]);
    expect(rec.notes).toEqual([`verified production revision: ${FE}`]);
  });

  test('beta, both held: PASS, never the note', async () => {
    const rec = recorder();
    const { fetcher } = health({
      [feHealth(BETA)]: [{ body: { rev: FE } }],
      [beHealth]: [{ body: { rev: BE } }],
    });
    expect(await verifyServingRevisions(rec, BETA, before, fetcher)).toBe(true);
    expect(rec.steps.map((step) => step.ok)).toEqual([true, true]);
    expect(rec.notes).toEqual([]);
  });

  test('the Frontend changed mid-run (a promotion): FAIL and no note', async () => {
    const rec = recorder();
    const { fetcher } = health({
      [feHealth(PRODUCTION_FRONTEND)]: [{ body: { rev: '40b1230' } }],
      [beHealth]: [{ body: { rev: BE } }],
    });
    expect(await verifyServingRevisions(rec, PRODUCTION_FRONTEND, before, fetcher)).toBe(false);
    expect(rec.steps.map((step) => step.ok)).toEqual([false, true]);
    expect(rec.notes).toEqual([]);
  });

  test('the Backend changed mid-run (a deploy): FAIL and no note', async () => {
    const rec = recorder();
    const { fetcher } = health({
      [feHealth(PRODUCTION_FRONTEND)]: [{ body: { rev: FE } }],
      [beHealth]: [{ body: { rev: '6defaf99' } }],
    });
    expect(await verifyServingRevisions(rec, PRODUCTION_FRONTEND, before, fetcher)).toBe(false);
    expect(rec.steps.map((step) => step.ok)).toEqual([true, false]);
    expect(rec.notes).toEqual([]);
  });

  test('a health route that broke after the run: FAIL naming it, never a throw', async () => {
    const rec = recorder();
    const { fetcher } = health({
      [feHealth(PRODUCTION_FRONTEND)]: [{ status: 500, body: {} }],
      [beHealth]: [{ body: { rev: BE } }],
    });
    expect(await verifyServingRevisions(rec, PRODUCTION_FRONTEND, before, fetcher)).toBe(false);
    expect(rec.steps[0]?.ok).toBe(false);
    expect(rec.steps[0]?.detail).toContain('/api/healthz');
    expect(rec.notes).toEqual([]);
  });

  test('a malformed revision before the run is never vouched for', async () => {
    const rec = recorder();
    const { fetcher } = health({
      [feHealth(PRODUCTION_FRONTEND)]: [{ body: { rev: 'unknown' } }],
      [beHealth]: [{ body: { rev: BE } }],
    });
    expect(
      await verifyServingRevisions(
        rec,
        PRODUCTION_FRONTEND,
        { frontend: 'unknown', backend: BE },
        fetcher,
      ),
    ).toBe(false);
    expect(rec.notes).toEqual([]);
  });
});
