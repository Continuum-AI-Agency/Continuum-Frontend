import { describe, expect, test } from 'bun:test';
import {
  AUTOMATION_SOURCE_LIFECYCLE,
  type AutomationCapabilitiesResponse,
  automationSourceKindSchema,
} from '@continuum/contracts';
import { automationSourceLabel, buildAutomationSourceOptions } from './source-options';

const capabilities = (
  sources: AutomationCapabilitiesResponse['sources'],
): AutomationCapabilitiesResponse => ({
  sources,
  mcpReadTools: [],
  generatedAt: '2026-07-29T00:00:00.000Z',
});

describe('buildAutomationSourceOptions', () => {
  test('offers only the source kinds the server reports', () => {
    const options = buildAutomationSourceOptions({
      capabilities: capabilities([
        { source: 'library', lifecycle: 'production', availability: 'ready', reason: null },
        { source: 'trends', lifecycle: 'production', availability: 'ready', reason: null },
      ]),
    });

    expect(options.map((option) => option.value)).toEqual(['library', 'trends']);
  });

  // Derives its subject rather than naming one: which kinds are preview changes
  // every time a resolver ships, and a test that pins the value goes stale the
  // day the thing it describes starts working.
  test('carries the server’s lifecycle and reason rather than the bundled constant', () => {
    const bundledProduction = automationSourceKindSchema.options.find(
      (kind) => AUTOMATION_SOURCE_LIFECYCLE[kind] === 'production',
    );
    expect(bundledProduction).toBeDefined();

    const options = buildAutomationSourceOptions({
      capabilities: capabilities([
        {
          source: bundledProduction as string,
          lifecycle: 'preview',
          availability: 'unavailable',
          reason: 'Rolled back on the server.',
        },
      ]),
    });

    // Bundled says production; the server says preview; the server wins.
    expect(options[0]).toMatchObject({
      value: bundledProduction,
      disabled: false,
      preview: true,
      reason: 'Rolled back on the server.',
    });
  });

  test('falls back to the bundled kind list when capabilities have not loaded', () => {
    for (const capabilityState of [null, undefined]) {
      const options = buildAutomationSourceOptions({ capabilities: capabilityState });
      expect(options.map((option) => option.value)).toEqual([
        ...automationSourceKindSchema.options,
      ]);
      expect(options.find((option) => option.value === 'live_web')?.preview).toBe(true);
    }
  });

  test('falls back to the bundled list when the server reports no sources at all', () => {
    const options = buildAutomationSourceOptions({ capabilities: capabilities([]) });
    expect(options.length).toBe(automationSourceKindSchema.options.length);
  });

  // A node configured with a kind the server has stopped advertising — rolled
  // back, or renamed — must stay editable. Dropping it would leave the Select
  // with no matching item and silently re-point the node.
  test('keeps a stored source selectable when the server no longer offers it', () => {
    const options = buildAutomationSourceOptions({
      capabilities: capabilities([
        { source: 'library', lifecycle: 'production', availability: 'ready', reason: null },
      ]),
      selected: 'a_kind_rolled_back',
    });

    const stored = options.find((option) => option.value === 'a_kind_rolled_back');
    expect(stored?.disabled).toBe(false);
    expect(stored?.label).toContain('unavailable');
  });

  test('does not duplicate the stored source when the server still offers it', () => {
    const options = buildAutomationSourceOptions({
      capabilities: capabilities([
        { source: 'library', lifecycle: 'production', availability: 'ready', reason: null },
      ]),
      selected: 'library',
    });

    expect(options.filter((option) => option.value === 'library')).toHaveLength(1);
  });

  // Every option stays selectable on purpose: a preview source is a legitimate
  // disabled placeholder, and publish readiness is the gate that refuses it.
  test('never disables an option, whatever the server reports', () => {
    const options = buildAutomationSourceOptions({
      capabilities: capabilities([
        {
          source: 'live_web',
          lifecycle: 'preview',
          availability: 'unavailable',
          reason: 'Preview source.',
        },
      ]),
    });

    expect(options[0]?.disabled).toBe(false);
    expect(options[0]?.preview).toBe(true);
  });
});

describe('automationSourceLabel', () => {
  test('names every bundled kind explicitly rather than deriving it', () => {
    for (const kind of automationSourceKindSchema.options) {
      const label = automationSourceLabel(kind);
      expect(label).not.toBe(kind);
      expect(label).not.toContain('_');
    }
  });

  // Every kind this build knows is named in the map above; the fallback exists
  // only for a kind the SERVER ships first, which by definition is not in it.
  test('humanizes a kind shipped after this build instead of rendering the raw id', () => {
    expect(automationSourceLabel('a_kind_shipped_later')).toBe('A kind shipped later');
  });
});
