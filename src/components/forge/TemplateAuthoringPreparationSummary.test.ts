import { describe, expect, test } from 'bun:test';
import type { TemplateAuthoringDocument } from '@continuum/contracts';
import type { useTemplateAuthoringLifecycle } from './useTemplateAuthoringLifecycle';
import { templatePreparationSummary } from './TemplateAuthoringPreparationPanel';

type Workflow = ReturnType<typeof useTemplateAuthoringLifecycle>;
const dependencies: TemplateAuthoringDocument['dependencies'] = [];

function workflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    state: 'ready',
    artifact: null,
    preparation: null,
    renders: [],
    error: null,
    isCurrent: true,
    canReview: false,
    canPublish: false,
    retry: async () => {},
    review: async () => false,
    commit: async () => null,
    reviewAndCommit: async () => null,
    ...overrides,
  } as Workflow;
}

function artifact(state: 'prepared' | 'committed', nativeAfterEffects: string, versionId?: string): NonNullable<Workflow['artifact']> {
  return {
    state,
    verification: { nativeAfterEffects },
    commit: versionId ? { versionId } : null,
  } as NonNullable<Workflow['artifact']>;
}

describe('templatePreparationSummary', () => {
  test('shows named missing artwork before generic runner input', () => {
    const result = templatePreparationSummary(
      workflow({
        state: 'needs-input',
        preparation: {
          progress: {
            stage: 'private_preflight_complete',
            providerActivation: 'pending',
            diagnostics: [{
              code: 'authoring_preparation_artwork_missing',
              missingFootage: [{ name: 'Portrait photo', file: 'media/portrait.jpg' }],
            }],
          },
        } as Workflow['preparation'],
      }),
      'saved',
      false,
      dependencies,
    );

    expect(result).toEqual({
      label: 'Artwork needs attention',
      detail: 'Resolve these missing package dependencies: Portrait photo.',
      action: 'checks',
    });
  });

  test('lists exact missing font faces and routes to Fonts check', () => {
    const result = templatePreparationSummary(
      workflow({
        preparation: {
          progress: {
            diagnostics: [{
              code: 'authoring_preparation_font_missing',
              affectedFontPostScriptNames: ['FoundrySans-Regular', 'FoundrySans-Bold'],
            }],
          },
        } as Workflow['preparation'],
      }),
      'saved',
      false,
      dependencies,
    );

    expect(result.label).toBe('Fonts need attention');
    expect(result.detail).toContain('FoundrySans-Regular, FoundrySans-Bold');
    expect(result.action).toBe('fonts');
  });

  test('puts draft conflict ahead of publishing readiness', () => {
    const result = templatePreparationSummary(
      workflow({ canPublish: true }),
      'source-mismatch',
      false,
      dependencies,
    );

    expect(result.label).toBe('Draft conflict');
    expect(result.action).toBe('save');
  });

  test('prioritizes save failures, pending formats and active package work', () => {
    const saveFailure = templatePreparationSummary(
      workflow({ preparation: { progress: { diagnostics: [{
        code: 'authoring_preparation_font_missing',
        affectedFontPostScriptNames: ['FoundrySans-Regular'],
      }] } } as Workflow['preparation'] }),
      'error',
      true,
      dependencies,
    );
    expect(saveFailure.label).toBe('Save failed');
    expect(saveFailure.detail).toContain('Retry saving');

    const formatPending = templatePreparationSummary(
      workflow({
        state: 'compiling',
        preparation: { progress: { checks: { format: 'pending' } } } as Workflow['preparation'],
      }),
      'saved',
      false,
      dependencies,
    );
    expect(formatPending.label).toBe('Delivery formats pending');

    const compiling = templatePreparationSummary(
      workflow({ state: 'compiling', artifact: artifact('prepared', 'pending') }),
      'saved',
      false,
      dependencies,
    );
    expect(compiling.label).toBe('Building package');
  });

  test('does not call a package ready when native proof is missing and publishing is disabled', () => {
    const result = templatePreparationSummary(
      workflow({ artifact: artifact('prepared', 'pending'), canPublish: false }),
      'saved',
      false,
      dependencies,
    );

    expect(result.label).toBe('Native render pending');
    expect(result.detail).toContain('Native sample frames have not been verified');
    expect(result.action).toBe('checks');
  });

  test('confirms a committed version from its receipt', () => {
    const result = templatePreparationSummary(
      workflow({ artifact: artifact('committed', 'passed', 'version-42') }),
      'saved',
      false,
      dependencies,
    );

    expect(result).toEqual({
      label: 'Version published',
      detail: 'Version version-42 was published from this exact package.',
      action: null,
    });
  });
});
