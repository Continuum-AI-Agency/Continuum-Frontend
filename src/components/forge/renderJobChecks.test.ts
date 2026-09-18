/**
 * Every state each render check can be in, and the words it uses for it. A judge that reads
 * "Judging…" forever, or a placement row that says "fits" for a slot nobody measured, is worse
 * than no row at all — so the copy is what these assert.
 */

import { describe, expect, test } from 'bun:test';
import type {
  ApiRenderFitVerdict,
  ApiRenderJob,
  ApiRenderJudge,
  ApiRenderJudgeFrame,
  ApiRenderOutput,
} from '@continuum/contracts';
import { type JobCheck, jobSteps, renderJobChecks } from './renderJobChecks';

const NOW = Date.parse('2026-09-15T12:00:00.000Z');
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

const image = (fileName: string): ApiRenderOutput => ({
  id: `id-${fileName}`,
  kind: 'image',
  fileName,
  mimeType: 'image/jpeg',
  url: `https://cdn.test/${fileName}`,
  width: null,
  height: null,
  assetId: null,
  versionId: null,
});

const FILES = [
  image('Producto_individual_con_descuento_16_9_9w5xxwa.jpg'),
  image('Producto_individual_con_descuento_1_1_1mjxxwb.jpg'),
  image('Producto_individual_con_descuento_9_16_ooqxxwb.jpg'),
];

const JOB: ApiRenderJob = {
  id: '11111111-1111-4111-8111-111111111111',
  brandId: '22222222-2222-4222-8222-222222222222',
  templateKey: '133',
  templateName: 'Producto individual',
  contractHash: 'hash',
  taskUid: 'T1',
  status: 'finished',
  test: true,
  outputs: FILES,
  delivery: [],
  error: null,
  createdAt: minutesAgo(30),
  updatedAt: minutesAgo(1),
  finishedAt: minutesAgo(27.5),
  label: 'Spain',
  renderRequestId: null,
  renderSetId: null,
  renderSetRowId: null,
  rootRowId: null,
  parentRowId: null,
  renderSetName: null,
  labelPath: ['Spain'],
  renderSetRevision: null,
  templateSource: null,
  environment: null,
  fit: null,
  judge: null,
  deliveryTarget: null,
  slackDelivery: null,
  approval: null,
};

const COMP = { name: 'Producto individual con descuento 1:1', width: 1080, height: 1080 };

const slot = (overrides: Partial<ApiRenderFitVerdict> & Pick<ApiRenderFitVerdict, 'key'>) => ({
  state: 'ok' as const,
  shapeClass: 'square' as const,
  box: [100, 100, 1000, 1000] as [number, number, number, number],
  clippedPx: [0, 0, 0, 0] as [number, number, number, number],
  insideFraction: 1,
  scale: [1, 1] as [number, number],
  covers: [],
  why: 'lands inside',
  ...overrides,
});

const fit = (slots: ApiRenderFitVerdict[], escalate = true) => ({
  comp: COMP,
  slots,
  escalate,
  why: '1 slot could not be measured — the finished frame goes to the judge',
});

const frame = (
  ratio: string,
  state: ApiRenderJudgeFrame['state'],
  kinds: string[] = [],
): ApiRenderJudgeFrame => ({
  outputId: `id-${ratio}`,
  fileName: `file_${ratio.replace(':', '_')}_x.jpg`,
  ratio,
  state,
  verdict: {
    overall: state === 'fail' ? 'fail' : 'pass',
    confidence: 0.9,
    findings: kinds.map((kind) => ({
      kind: kind as never,
      layerHint: 'Headline',
      layerId: null,
      severity: 'high',
      bbox: null,
      note: null,
    })),
  },
  why: null,
  model: 'gemini-3.8-flash',
  level: 'high',
  votes: 1,
});

const judge = (overrides: Partial<ApiRenderJudge>): ApiRenderJudge => ({
  state: 'pass',
  verdict: null,
  why: null,
  model: 'gemini-3.8-flash',
  level: 'high',
  votes: 1,
  escalatedBecause: 'placed by a rig',
  judgedAt: minutesAgo(20),
  ...overrides,
});

const LABELS = { product: 'Product image', headline: 'Headline' };
const row = (checks: JobCheck[], name: string) => {
  const found = checks.find((check) => check.name === name);
  if (!found) throw new Error(`no ${name} row`);
  return found;
};
const checksOf = (job: Partial<ApiRenderJob>) => renderJobChecks({ ...JOB, ...job }, LABELS, NOW);

describe('renderJobChecks', () => {
  test('rows in the order a render passes through them, each saying what it checks', () => {
    const checks = checksOf({});
    expect(checks.map((check) => check.name)).toEqual([
      'Inputs',
      'Placement',
      'Brand',
      'Render',
      'Judge',
      'Delivery',
    ]);
    expect(row(checks, 'Inputs')).toMatchObject({ state: 'pass', result: 'All inputs accepted.' });
    expect(row(checks, 'Brand')).toMatchObject({ state: 'pass', result: 'No blocking issues' });
    expect(row(checks, 'Placement').what).toBe(
      "Works out where each picked image lands from its size and the slot's measured position. Arithmetic, not a look at the frame.",
    );
  });

  test('render: file count and a duration from finishedAt, never updatedAt', () => {
    expect(row(checksOf({}), 'Render')).toMatchObject({
      state: 'pass',
      result: '3 files',
      duration: '2m 30s',
    });
    expect(
      row(checksOf({ status: 'failed', error: 'Render fleet timed out', outputs: [] }), 'Render'),
    ).toMatchObject({ state: 'fail', result: 'Render fleet timed out' });
    // The legacy literal every old fleet failure carries reads as a sentence, here and in the
    // tray's Running step, which reads jobSteps.
    const legacy = { ...JOB, status: 'failed' as const, error: 'render_error', outputs: [] };
    const sentence = 'The render farm reported an error and sent no file.';
    expect(row(renderJobChecks(legacy, {}, NOW), 'Render').result).toBe(sentence);
    expect(jobSteps(legacy).find((step) => step.label === 'Rendering')).toMatchObject({
      state: 'error',
      detail: sentence,
    });
    expect(row(checksOf({ status: 'rendering', finishedAt: null }), 'Render').state).toBe(
      'running',
    );
  });

  describe('placement', () => {
    test('every slot state, as a sentence each, measured in one comp', () => {
      const checks = checksOf({
        fit: fit([
          slot({
            key: 'product',
            state: 'clipped',
            box: [-120, -120, 1200, 1200],
            clippedPx: [0, 120, 0, 120],
            insideFraction: 0.82,
            covers: [{ key: 'headline', label: 'Headline', coverage: 0.4 }],
          }),
          slot({ key: 'headline', state: 'ok', box: [90, 60, 990, 960] }),
          slot({
            key: 'logo',
            state: 'unknown',
            box: [0, 0, 200, 200],
            why: 'placed by a rig in the template, which fits the asset at render time — checked on the finished frame',
          }),
          slot({
            key: 'badge',
            state: 'unknown',
            shapeClass: null,
            box: null,
            why: 'no asset is chosen for this slot yet',
          }),
          slot({
            key: 'sticker',
            state: 'unknown',
            box: null,
            why: 'this template has no measured placement for the slot, so where the asset lands cannot be said — the render will be judged instead',
          }),
        ]),
      });
      const placement = row(checks, 'Placement');
      expect(placement.state).toBe('warn');
      expect(placement.result).toBe("1 image cut off · 3 couldn't be measured · 1 image fits");
      expect(placement.ticks).toEqual(['warn', 'pass', 'todo', 'todo', 'todo']);
      expect(placement.lines).toEqual([
        'Product image — drawn at 1320×1320; 120 px off top and bottom (18% off-frame). Covers 40% of Headline.',
        'Headline — drawn at 900×900; lands inside the frame.',
        "logo — Placed by a rig that sizes the image at render time. Can't be predicted; the frame goes to the judge.",
        'badge — No image picked.',
        'sticker — This template has no measured position for this slot.',
        'Measured in Producto individual con descuento 1:1 1080×1080 only.',
      ]);
    });

    test('all fit, none to place, and a render with no placement check', () => {
      expect(
        row(
          checksOf({ fit: fit([slot({ key: 'a' }), slot({ key: 'b' }), slot({ key: 'c' })]) }),
          'Placement',
        ),
      ).toMatchObject({ state: 'pass', result: '3 images fit' });
      expect(row(checksOf({ fit: { ...fit([], false), comp: null } }), 'Placement')).toMatchObject({
        state: 'skipped',
        result: 'No image slots',
        lines: [],
      });
      expect(row(checksOf({ fit: null }), 'Placement')).toMatchObject({
        state: 'skipped',
        result: 'No placement check',
      });
      expect(
        row(
          checksOf({ fit: fit([slot({ key: 'logo', state: 'unknown', box: null, why: 'x' })]) }),
          'Placement',
        ).result,
      ).toBe("1 couldn't be measured");
    });
  });

  describe('judge', () => {
    test('a verdict per format, findings in words, model and age', () => {
      const checks = checksOf({
        fit: fit([slot({ key: 'logo', state: 'unknown' })]),
        judge: judge({
          state: 'fail',
          judgedAt: minutesAgo(25),
          frames: [
            frame('16:9', 'pass'),
            frame('1:1', 'pass'),
            frame('9:16', 'fail', ['clipped', 'occluded']),
          ],
        }),
      });
      const judged = row(checks, 'Judge');
      expect(judged.state).toBe('fail');
      expect(judged.result).toBe('16:9 ✓ · 1:1 ✓ · 9:16 ✗ 2 problems');
      expect(judged.ticks).toEqual(['pass', 'pass', 'fail']);
      expect(judged.duration).toBe('2m 30s');
      expect(judged.lines).toEqual([
        '9:16: Headline is cut off at the edge',
        '9:16: Something covers Headline',
        'Model gemini-3.8-flash · high · 25m ago',
        'The judge catches about half of real problems, and is right about 9 in 10 of the ones it flags.',
      ]);
    });

    test('an unknown verdict says why it could not judge', () => {
      expect(
        row(
          checksOf({
            fit: fit([]),
            judge: judge({ state: 'unknown', why: 'no Vertex credential', frames: [] }),
          }),
          'Judge',
        ),
      ).toMatchObject({ state: 'warn', result: "Couldn't judge: no Vertex credential" });
    });

    test('a verdict from before every format was judged reads as one frame', () => {
      expect(row(checksOf({ fit: fit([]), judge: judge({ state: 'pass' }) }), 'Judge').result).toBe(
        'Judged one frame ✓',
      );
    });

    test('a video-only render has no still to judge', () => {
      const video = { ...image('clip_16_9_x.mp4'), kind: 'video' as const };
      expect(row(checksOf({ outputs: [video], fit: fit([]), judge: null }), 'Judge')).toMatchObject(
        {
          state: 'skipped',
          result: 'This render has no still frame; the judge reads images.',
        },
      );
    });

    test('not escalated: nothing to judge', () => {
      expect(row(checksOf({ fit: fit([slot({ key: 'a' })], false) }), 'Judge')).toMatchObject({
        state: 'skipped',
        result: 'Not needed — every image was measured and fits.',
      });
    });

    test('escalated but still rendering: says what it will do and why', () => {
      expect(
        row(checksOf({ status: 'rendering', finishedAt: null, fit: fit([]) }), 'Judge'),
      ).toMatchObject({
        state: 'todo',
        result:
          'Will check the frames when the render finishes. Sent because: 1 slot could not be measured — the finished frame goes to the judge',
      });
    });

    test('finished and unjudged: waiting under 10 minutes, then says it runs in the background', () => {
      expect(row(checksOf({ finishedAt: minutesAgo(4), fit: fit([]) }), 'Judge')).toMatchObject({
        state: 'running',
        result: 'Waiting for the judge…',
      });
      const late = row(checksOf({ finishedAt: minutesAgo(12), fit: fit([]) }), 'Judge');
      // Never an endless spinner: past ten minutes it stops spinning and shows how long.
      expect(late).toMatchObject({
        state: 'todo',
        result: 'Still waiting — the judge runs on a background pass.',
        duration: '12m 0s',
      });
    });
  });

  test('delivery: a failed render delivers nothing; a posted one reads its steps', () => {
    expect(row(checksOf({ status: 'failed', outputs: [] }), 'Delivery').state).toBe('skipped');
    const delivered = row(
      checksOf({
        outputs: FILES.map((file) => ({
          ...file,
          assetId: '77777777-7777-4777-8777-777777777771',
        })),
        slackDelivery: {
          destinationId: '66666666-6666-4666-8666-666666666661',
          channelName: 'renders',
          status: 'posted',
        },
      }),
      'Delivery',
    );
    expect(delivered).toMatchObject({
      state: 'pass',
      result: 'Saved to Library · posted to #renders',
    });
  });
});
