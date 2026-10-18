import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { TemplateAuthoringDocument } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TemplateAuthoringPreparationPanel } from './TemplateAuthoringPreparationPanel';
import type { useTemplateAuthoringLifecycle } from './useTemplateAuthoringLifecycle';

type Workflow = ReturnType<typeof useTemplateAuthoringLifecycle>;

afterEach(cleanup);

describe('TemplateAuthoringPreparationPanel', () => {
  test('puts named repair guidance before collapsed package facts and keeps download available', () => {
    const scope = {
      brandId: '10000000-0000-4000-8000-000000000001',
      assetId: '10000000-0000-4000-8000-000000000002',
      baseVersionId: '10000000-0000-4000-8000-000000000003',
    };
    const workflow = {
      state: 'needs-input',
      artifact: {
        artifactId: '10000000-0000-4000-8000-000000000004',
        scope,
        draftRevision: 9,
        sourceChecksum: 'a'.repeat(64),
        commandDigest: 'b'.repeat(64),
        packageChecksum: 'c'.repeat(64),
        filename: 'private-template.aep',
        sizeBytes: 4096,
        state: 'prepared',
        verification: {
          packageIntegrity: 'passed',
          writerReadback: 'passed',
          sourcePreservation: 'passed',
          dependencies: 'pending',
          format: 'passed',
          nativeAfterEffects: 'pending',
        },
        createdAt: '2026-10-13T00:00:00.000Z',
        reviewedAt: null,
        commit: null,
      },
      preparation: {
        state: 'needs_input',
        runId: 'preparation-run-9',
        progress: {
          stage: 'private_preflight_pending',
          checks: { format: 'passed', dependencies: 'pending' },
          providerActivation: 'pending',
          diagnostics: [
            {
              code: 'authoring_preparation_font_missing',
              affectedFontPostScriptNames: ['FoundrySans-Regular'],
            },
            {
              code: 'authoring_preparation_artwork_missing',
              missingFootage: [{ name: 'Product image', file: 'media/product.png' }],
            },
          ],
        },
      },
      renders: [],
      error: null,
      isCurrent: true,
      canReview: false,
      canPublish: false,
      retry: async () => {},
      review: async () => false,
      commit: async () => null,
      reviewAndCommit: async () => null,
    } as Workflow;
    const dependencies = [
      {
        footageItemId: 781,
        name: 'Product image',
        mediaCode: 'ZPEG',
        footageFramerate: 0,
        originalFile: 'media/product.png',
        width: 400,
        height: 300,
        affectedLayers: [],
        relinkReason: null,
      },
    ] as TemplateAuthoringDocument['dependencies'];
    const onOpenFontRepair = mock(() => {});

    render(
      <TemplateAuthoringPreparationPanel
        workflow={workflow}
        syncStatus="saved"
        draftDirty={false}
        draftRevision={9}
        dependencies={dependencies}
        onOpenFontRepair={onOpenFontRepair}
        onRelinkDependency={() => {}}
      />,
    );

    const namedRepair = screen.getByText('Product image: media/product.png');
    const namedFont = screen.getByText(/Affected font faces: FoundrySans-Regular/);
    const nextStep = screen.getByTestId('preparation-next-step');
    const preflightSummary = screen.getByText(
      'Package preflight: format passed, dependencies pending · Forge provider pending',
    );
    const detailsTrigger = screen.getByRole('button', { name: /Package details and verification/ });
    expect(
      namedFont.compareDocumentPosition(detailsTrigger) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      namedRepair.compareDocumentPosition(detailsTrigger) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      namedFont.compareDocumentPosition(nextStep) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      namedRepair.compareDocumentPosition(preflightSummary) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByText('Saved private package is waiting for the listed repairs.'),
    ).toBeTruthy();
    expect(
      screen.queryByText(/private package still has unresolved footage dependencies/i),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open Fonts check' }));
    expect(onOpenFontRepair).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Relink from Library' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Download private package' }).hasAttribute('disabled'),
    ).toBe(false);
    expect(screen.queryByText('private-template.aep')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Package verification checks' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Review and publish/ })).toBeNull();

    fireEvent.click(detailsTrigger);
    expect(screen.getByText('private-template.aep')).toBeTruthy();
    expect(screen.getByText('4.0 KB')).toBeTruthy();
    expect(screen.getByText('Package checksum')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Package verification checks' })).toBeTruthy();
    expect(screen.getByText('Native render')).toBeTruthy();
  });
});
