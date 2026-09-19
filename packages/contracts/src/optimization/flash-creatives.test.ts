import { describe, expect, it } from 'bun:test';
import {
  assignFlashPorts,
  explainFlashUnfit,
  flashPrompts,
  pickFlashPipelines,
  readFlashJobResult,
} from './flash-creatives';

const cap = (over: Record<string, unknown>) =>
  ({
    contract_version: 2,
    pipeline_id: 'p',
    identity: { family_id: 'f', revision: 1, contract_hash: 'a'.repeat(64) },
    name: 'Flash ad variations',
    source: 'brand',
    inputs: [
      {
        input_id: 'prompt',
        label: 'Prompt',
        required: true,
        semantic_role: 'prompt',
        kind: 'text',
      },
    ],
    controls: [],
    outputs: [{ output_id: 'out', kind: 'asset', label: 'Image', media: 'image', count: 3 }],
    execution_policy: {
      runtime: 'server',
      timeout_seconds: 600,
      max_attempts: 2,
      max_generations: 6,
    },
    cost_policy: {
      currency: 'USD',
      max_amount_minor: 100,
      approval: 'within_limit',
      on_exceed: 'refuse',
    },
    quality_policy: { minimum_score: 0.8, required_checks: ['brand'], on_failure: 'refuse' },
    ...over,
  }) as never;

describe('pickFlashPipelines', () => {
  it('ranks a paid, negative-aware, brand workflow above a generic global one and drops client-only', () => {
    const picks = pickFlashPipelines(
      [
        cap({ pipeline_id: 'generic', source: 'global', name: 'Portrait painter' }),
        cap({
          pipeline_id: 'paid',
          inputs: [
            {
              input_id: 'prompt',
              label: 'Prompt',
              required: true,
              semantic_role: 'prompt',
              kind: 'text',
            },
            {
              input_id: 'neg',
              label: 'Negative prompt',
              required: false,
              semantic_role: 'negative_prompt',
              kind: 'text',
            },
            {
              input_id: 'ref',
              label: 'Reference',
              required: false,
              semantic_role: 'reference',
              kind: 'asset',
              media: 'image',
              min_items: 0,
              max_items: 3,
            },
          ],
        }),
        cap({
          pipeline_id: 'client',
          execution_policy: {
            runtime: 'client',
            timeout_seconds: 60,
            max_attempts: 1,
            max_generations: 1,
          },
        }),
        cap({
          pipeline_id: 'video',
          outputs: [{ output_id: 'o', kind: 'asset', label: 'V', media: 'video', count: 1 }],
        }),
      ],
      { ratio: '4:5', hasReference: true, count: 3 },
    );
    expect(picks.map((p) => p.capability.pipeline_id)).toEqual(['paid', 'generic', 'paid']);
    expect(picks[0].reasons).toContain('takes a negative prompt');
    expect(picks[0].reasons).toContain('accepts a reference image');
  });
  it('excludes a workflow whose required reference cannot be supplied', () => {
    const picks = pickFlashPipelines(
      [
        cap({
          inputs: [
            {
              input_id: 'prompt',
              label: 'Prompt',
              required: true,
              semantic_role: 'prompt',
              kind: 'text',
            },
            {
              input_id: 'ref',
              label: 'Reference',
              required: true,
              semantic_role: 'reference',
              kind: 'asset',
              media: 'image',
              min_items: 1,
              max_items: 1,
            },
          ],
        }),
      ],
      { ratio: null, hasReference: false, count: 1 },
    );
    expect(picks).toEqual([]);
  });
});

describe('flashPrompts + assignFlashPorts', () => {
  it('writes a positive prompt from the argument and a fixed negative prompt, varied by index', () => {
    const base = {
      angle: 'Discount offer',
      hook: 'Value / price',
      audience: 'Prospecting · Broad',
      why: 'wins at $29 vs $164',
      cta: 'Sign up',
      sourceAdName: 'V3',
      brandName: 'Vivo',
    };
    const a = flashPrompts({ ...base, variant: 0 });
    const b = flashPrompts({ ...base, variant: 1 });
    expect(a.positive).toContain('Communication angle to keep: Discount offer.');
    expect(a.positive).toContain('Why now: wins at $29 vs $164.');
    expect(a.negative).toContain('No invented claims');
    expect(a.positive).not.toBe(b.positive);
  });
  it('fills prompt, negative and reference ports; refuses when a required port stays empty', () => {
    const prompts = { positive: 'P', negative: 'N' };
    expect(
      assignFlashPorts(
        [
          { id: 'p', kind: 'text', label: 'Prompt', required: true },
          { id: 'n', kind: 'text', label: 'Negative prompt', required: false },
          { id: 'r', kind: 'asset', label: 'Reference', required: false, maxItems: 2 },
        ],
        prompts,
        ['asset-1'],
      ),
    ).toEqual([
      { portId: 'p', text: 'P' },
      { portId: 'n', text: 'N' },
      { portId: 'r', assetIds: ['asset-1'] },
    ]);
    expect(assignFlashPorts([{ id: 'r', kind: 'asset', required: true }], prompts, [])).toBeNull();
    expect(
      assignFlashPorts([{ id: 'e', kind: 'element', required: true }], prompts, []),
    ).toBeNull();
    expect(assignFlashPorts([{ id: 'r', kind: 'asset', required: false }], prompts, [])).toBeNull();
  });
});

describe('readFlashJobResult', () => {
  it('lists the primary asset first, then the other outputs, and the room', () => {
    expect(
      readFlashJobResult({
        asset_id: 'a1',
        result: { assets: ['a2', 'a3'], roomId: 'room', publishedToMeta: false },
      }),
    ).toEqual({ assetIds: ['a1', 'a2', 'a3'], roomId: 'room', publishedToMeta: false, adId: null });
    expect(readFlashJobResult({ asset_id: null, result: null })).toEqual({
      assetIds: [],
      roomId: null,
      publishedToMeta: false,
      adId: null,
    });
  });
});

describe('explainFlashUnfit', () => {
  it('names the one thing that disqualifies a pipeline, and nothing for a fit one', () => {
    expect(explainFlashUnfit(cap({}), { hasReference: false })).toBeNull();
    expect(
      explainFlashUnfit(
        cap({
          execution_policy: {
            runtime: 'client',
            timeout_seconds: 60,
            max_attempts: 1,
            max_generations: 1,
          },
        }),
        { hasReference: false },
      ),
    ).toMatch(/browser/);
    expect(
      explainFlashUnfit(
        cap({ outputs: [{ output_id: 'o', kind: 'asset', label: 'V', media: 'video', count: 1 }] }),
        { hasReference: false },
      ),
    ).toMatch(/image output/);
    expect(explainFlashUnfit(cap({ inputs: [] }), { hasReference: false })).toMatch(/text input/);
    expect(
      explainFlashUnfit(
        cap({
          inputs: [
            {
              input_id: 'prompt',
              label: 'Prompt',
              required: true,
              semantic_role: 'prompt',
              kind: 'text',
            },
            {
              input_id: 'ref',
              label: 'Reference',
              required: true,
              semantic_role: 'reference',
              kind: 'asset',
              media: 'image',
              min_items: 1,
              max_items: 1,
            },
          ],
        }),
        { hasReference: false },
      ),
    ).toMatch(/reference image/);
  });
});
