/**
 * Every state each template check can be in, and the words it uses for it. The copy is the
 * product here: a check that says "passed" for the wrong reason is worse than no check.
 */

import { describe, expect, test } from 'bun:test';
import type { TemplateRunRow } from '@/lib/library/templateSources';
import { type TemplateCheck, type TemplateChecksInput, templateChecks } from './templateChecks';

const PARSED: TemplateChecksInput = {
  parseState: 'parsed',
  parseError: null,
  variableCount: 12,
  formatCount: 3,
  fontReadiness: {
    parseState: 'parsed',
    missing: 0,
    fonts: [
      { family: 'Inter', layers: 2, held: true },
      { family: 'Geist', layers: 1, held: true },
    ],
  },
  fontCheckFailed: false,
  run: null,
  forgeState: null,
  templateKey: null,
};

function runRow(overrides: Partial<TemplateRunRow>): TemplateRunRow {
  return {
    run_id: 'run-1',
    state: 'building',
    done: false,
    ok: null,
    progress: null,
    findings: [],
    needs: [],
    error: null,
    root_table: null,
    application: null,
    ...overrides,
  };
}

const row = (input: Partial<TemplateChecksInput>, id: TemplateCheck['id']) =>
  templateChecks({ ...PARSED, ...input }).find((check) => check.id === id)!;

describe('templateChecks', () => {
  test('six rows in order, each saying what it checks', () => {
    const checks = templateChecks(PARSED);
    expect(checks.map((check) => check.name)).toEqual([
      'Parse',
      'Fonts',
      'Build',
      'Mapping',
      'Test render',
      'Publish',
    ]);
    for (const check of checks) expect(check.what).toMatch(/^[A-Z].+\.$/);
  });

  test('MAPPING distinguishes verified identity from a name guess and unresolved layers', () => {
    const ready = {
      state: 'ready' as const, identityAvailable: true, slotCount: 1, matchedSlots: 1,
      fields: [{ key: 'headline', label: 'Headline', kind: 'text' as const,
        slotKey: 'text__headline', slotName: 'Headline', comps: ['wide'], sample: 'Hi',
      match: 'layer_id' as const }], unmatchedSlots: [], ignoredSlots: [],
    };
    expect(row({ mappingReview: ready, run: runRow({ state: 'review_ready' }) }, 'mapping'))
      .toMatchObject({ state: 'pass', result: '1 of 1 layers mapped' });
    expect(row({ mappingReview: { ...ready, identityAvailable: false } , run: runRow({ state: 'review_ready' }) }, 'mapping').state)
      .toBe('warn');
    expect(row({ mappingReview: { ...ready, state: 'needs_review', matchedSlots: 0,
      unmatchedSlots: [{ key: 'text__headline', name: 'Headline', kind: 'text', comps: ['wide'] }] },
      run: runRow({ state: 'review_ready' }) }, 'mapping').state).toBe('fail');
  });

  test('PARSE: read, not opened, unreadable, unsupported', () => {
    expect(row({}, 'parse')).toMatchObject({
      state: 'pass',
      result: 'Read 12 variables in 3 formats',
    });
    expect(row({ variableCount: 1, formatCount: 1 }, 'parse').result).toBe(
      'Read 1 variable in 1 format',
    );
    expect(row({ parseState: 'pending' }, 'parse')).toMatchObject({
      state: 'todo',
      result: 'Not opened yet',
    });
    expect(row({ parseState: 'failed', parseError: 'Truncated RIFX' }, 'parse')).toMatchObject({
      state: 'fail',
      result: "Couldn't read this file: Truncated RIFX",
    });
    expect(row({ parseState: 'unsupported' }, 'parse')).toMatchObject({
      state: 'skipped',
      result: "This file type isn't read",
    });
  });

  test('FONTS: all uploaded, missing, unchecked, checking, waiting for the parse', () => {
    expect(row({}, 'fonts')).toMatchObject({
      state: 'pass',
      result: 'All 2 uploaded',
      ticks: ['pass', 'pass'],
    });
    expect(
      row(
        {
          fontReadiness: {
            parseState: 'parsed',
            missing: 1,
            fonts: [
              { family: 'Inter', layers: 2, held: true },
              { family: 'Geist', layers: 1, held: false },
            ],
          },
        },
        'fonts',
      ),
    ).toMatchObject({
      state: 'fail',
      result: '1 of 2 not uploaded: Geist',
      ticks: ['pass', 'fail'],
    });
    expect(row({ fontReadiness: null, fontCheckFailed: true }, 'fonts')).toMatchObject({
      state: 'warn',
      result: "Couldn't check the brand's fonts",
    });
    expect(row({ fontReadiness: null }, 'fonts')).toMatchObject({ state: 'running' });
    expect(
      row({ fontReadiness: { parseState: 'parsed', missing: 0, fonts: [] } }, 'fonts'),
    ).toMatchObject({ state: 'pass', result: 'Uses no typefaces' });
    for (const input of [
      { parseState: 'pending', fontReadiness: null },
      { fontReadiness: { parseState: 'pending' as const, missing: 0, fonts: [] } },
    ]) {
      expect(row(input, 'fonts')).toMatchObject({
        state: 'todo',
        result: 'Waits for the file to be read',
      });
    }
  });

  test('BUILD: not built, running with phase ticks, needs, failed, built', () => {
    expect(row({}, 'build')).toMatchObject({ state: 'todo', result: 'Not built yet' });
    expect(row({ templateKey: '133' }, 'build')).toMatchObject({ state: 'pass', result: 'Built' });
    expect(row({ forgeState: 'published' }, 'build')).toMatchObject({ state: 'pass' });

    const phases = [
      { name: 'analyze', total: 1, done: 1 },
      { name: 'derive', total: 4, done: 2 },
      { name: 'seed', total: 0, done: 0 },
    ];
    expect(
      row(
        {
          run: runRow({
            state: 'building',
            progress: { total: 5, done: 3, pct: 60, phase: 'derive', detail: null, phases },
          }),
        },
        'build',
      ),
    ).toMatchObject({
      state: 'running',
      result: 'Building the spec',
      ticks: ['pass', 'todo', 'todo'],
    });

    const assetNeeds: TemplateRunRow['needs'] = [
      { id: 'n1', kind: 'asset' },
      { id: 'n2', kind: 'asset' },
    ];
    expect(
      row({ run: runRow({ state: 'needs_input', needs: assetNeeds }) }, 'build'),
    ).toMatchObject({
      state: 'warn',
      result: 'Pick a picture for 2 media variables, then build again',
      action: 'resume',
    });
    const mixedNeeds: TemplateRunRow['needs'] = [
      { id: 'n1', kind: 'asset' },
      { id: 'n2', kind: 'unbound_text' },
    ];
    const mixed = row(
      { run: runRow({ state: 'needs_input', needs: mixedNeeds, findings: [{ code: 'x' }] }) },
      'build',
    );
    expect(mixed).toMatchObject({ state: 'warn', result: '2 slots nothing could bind' });
    expect(mixed.chips).toEqual([
      { label: "1 couldn't bind", tone: 'warning' },
      { label: '1 finding', tone: 'muted' },
    ]);

    expect(
      row(
        {
          run: runRow({
            state: 'failed',
            error: { code: 'E', message: 'Spec did not validate' },
            progress: {
              total: 2,
              done: 1,
              pct: 50,
              phase: null,
              detail: null,
              phases: phases.slice(0, 2),
            },
          }),
        },
        'build',
      ),
    ).toMatchObject({
      state: 'fail',
      result: 'Spec did not validate',
      action: 'resume',
      ticks: ['pass', 'fail'],
    });
    expect(row({ run: runRow({ state: 'failed' }) }, 'build').result).toBe(
      'The run stopped on an error.',
    );
    for (const state of ['draft_ready', 'smoking', 'review_ready', 'promoting', 'published']) {
      expect(row({ run: runRow({ state }) }, 'build')).toMatchObject({
        state: 'pass',
        result: 'Built',
      });
    }
  });

  test('TEST RENDER: offered on a draft, running while smoking, passed once reviewed', () => {
    expect(row({}, 'test')).toMatchObject({ state: 'todo', result: 'Not run' });
    expect(row({}, 'test').action).toBeUndefined();
    expect(row({ run: runRow({ state: 'draft_ready' }) }, 'test')).toMatchObject({
      state: 'todo',
      result: 'Not run',
      action: 'smoke',
    });
    expect(row({ run: runRow({ state: 'smoking' }) }, 'test')).toMatchObject({
      state: 'running',
      result: 'Rendering the test frame…',
    });
    for (const state of ['review_ready', 'promoting', 'published']) {
      expect(row({ run: runRow({ state }) }, 'test')).toMatchObject({
        state: 'pass',
        result: 'Test frame rendered',
      });
    }
  });

  test('PUBLISH: a key alone waits for live worker and contract verification', () => {
    expect(row({ templateKey: '133' }, 'publish')).toMatchObject({
      state: 'running',
      result: 'Checking the worker graph and layout…',
    });
    expect(row({ templateKey: '133', publishCheckFailed: true }, 'publish')).toMatchObject({
      state: 'warn',
    });
    const published = { state: 'pass' as const, issues: [], workerAttachmentId: 7, media: [] };
    expect(row({ templateKey: '133', publishVerification: published }, 'publish')).toMatchObject({
      state: 'pass',
      result: 'Published · worker graph and 0 media slots measured',
    });
    expect(
      row(
        {
          templateKey: '133',
          publishVerification: {
            ...published,
            state: 'warn',
            issues: ['Left Jersey: no measured canvas position.'],
          },
        },
        'publish',
      ),
    ).toMatchObject({
      state: 'warn',
      result: 'Left Jersey: no measured canvas position.',
    });
    expect(
      row(
        {
          templateKey: '133',
          publishVerification: {
            ...published,
            state: 'fail',
            issues: ['Worker graph has no reachable AEP attachment.'],
          },
        },
        'publish',
      ),
    ).toMatchObject({
      state: 'fail',
      result: 'Worker graph has no reachable AEP attachment.',
    });
    expect(row({ run: runRow({ state: 'published' }) }, 'publish')).toMatchObject({
      state: 'todo',
      result: 'Not published',
    });
    expect(row({ run: runRow({ state: 'review_ready' }) }, 'publish')).toMatchObject({
      state: 'todo',
      result: 'Not published',
      action: 'promote',
    });
    expect(row({ run: runRow({ state: 'promoting' }) }, 'publish')).toMatchObject({
      state: 'running',
      result: 'Publishing…',
    });
  });
});
