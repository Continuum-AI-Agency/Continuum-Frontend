import { afterEach, describe, expect, mock, test } from 'bun:test';
import type {
  SaveTemplateLayerVariantRequest,
  TemplateAuthoringDocument,
  TemplateAuthoringDraft,
  TemplateAuthoringDraftPut,
  TemplateEditableLayer,
  TemplateLayerInventoryResponse,
} from '@continuum/contracts';

const layer: TemplateEditableLayer = {
  compId: 63,
  comp: 'Main',
  layerId: 114,
  name: 'Headline',
  kind: 'text',
  visible: true,
  visibilityReason: null,
  textReason: null,
  text: 'Hello',
  font: null,
  fontSize: 40,
  slotKeys: [],
  visibilitySlotKeys: [],
  index: 0,
  position: [100, 200],
  rotation: 0,
  scale: [100, 100],
  opacity: 100,
  transformLocks: {},
  parentName: null,
  parentId: null,
};
const inventory: TemplateLayerInventoryResponse = {
  compId: 63,
  comps: [{ id: 63, name: 'Main', orderReason: null }],
  layers: [layer],
  warnings: [],
  lineage: { role: 'golden', parent: null },
  designImport: false,
};
const savedLayers: SaveTemplateLayerVariantRequest[] = [];
const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text data-layer-id="114">Hello</text></svg>';
const scope = {
  brandId: '00000000-0000-4000-8000-000000000001',
  assetId: '00000000-0000-4000-8000-000000000002',
  baseVersionId: '00000000-0000-4000-8000-000000000003',
};
const checksum = 'c'.repeat(64);
const authoringDocument: TemplateAuthoringDocument = {
  scope, sourceChecksum: checksum, sourceHeadVersionId: scope.baseVersionId,
  readiness: 'ready', diagnostics: [], exposureKeys: [], fontChoices: [],
  compositions: [{ compId: 63, name: 'Main', width: 400, height: 300,
    frameRate: 30, durationSec: 5, clock: {}, parentCompIds: [], orderReason: null,
    creationReason: 'Not supported by this fixture.', nodeIds: ['aep:63:114'] }],
  nodes: [{ ...layer, nodeId: 'aep:63:114', sourceRef: { compId: 63, layerId: 114 },
    sourceNodeId: null, sourceCompositionId: 63, parentNodeId: null,
    textContent: layer.text, fontRef: null, fillColor: null,
    capabilities: { transform: true, visibility: true, font: false, text: false,
      order: true, exposure: false, creation: false, duplicate: false, delete: false,
      grouping: false, masks: false, artboardMutation: false, keyframes: false },
    keyframeChannels: [], opaqueSourceRef: { versionId: scope.baseVersionId, checksum } }],
  opaqueSourceRef: { versionId: scope.baseVersionId, checksum, authority: 'pinned-source-package' },
};
let persistedDraft: TemplateAuthoringDraft | null = null;
const draftWrites: TemplateAuthoringDraftPut[] = [];
let failNextSave = true;
const library = { ...(await import('@/lib/library/templateSources')) };
mock.module('@/lib/library/templateSources', () => ({
  ...library,
  fetchTemplateAuthoringUserId: async () => 'exit-guard-test-user',
  fetchTemplateAuthoringDocument: async () => authoringDocument,
  fetchTemplateAuthoringDraft: async () => persistedDraft,
  putTemplateAuthoringDraft: async (_asset: string, request: TemplateAuthoringDraftPut) => {
    draftWrites.push(structuredClone(request));
    if (failNextSave) { failNextSave = false; throw new Error('Local offline save fixture'); }
    persistedDraft = {
      scope, sourceChecksum: checksum, requiresReconciliation: false,
      currentSource: { templateSourceVersionId: scope.baseVersionId,
        templateSourceChecksum: checksum, assetHeadVersionId: scope.baseVersionId,
        assetHeadChecksum: checksum },
      revision: request.expectedRevision + 1, commands: structuredClone(request.commands),
      projectedDocument: authoringDocument, updatedAt: '2026-10-14T00:00:00.000Z',
    };
    return persistedDraft;
  },
  fetchTemplateLayerInventory: async () => inventory,
  fetchTemplateLayerScene: async (
    _brand: string,
    _asset: string,
    _version: string,
    compId: number | null,
  ) => ({
    compId: compId ?? 63,
    svg,
    warnings: [],
  }),
  previewTemplateLayers: async (_asset: string, request: { compId: number | null }) => ({
    ...inventory,
    compId: request.compId ?? 63,
    svg,
  }),
  saveTemplateLayerVariant: async (_asset: string, request: SaveTemplateLayerVariantRequest) => {
    savedLayers.push(request);
    return {
      assetId: 'new-variant',
      versionId: 'new-version',
      parseState: 'parsed',
      checksum: 'a'.repeat(64),
    };
  },
  fetchTemplateLayerVariants: async () => ({ lineage: inventory.lineage, variants: [] }),
  fetchTemplateVariables: async () => ({ variables: [] }),
  editableTemplateFonts: async () => [],
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import { TemplateAuthoringEditor } from './TemplateAuthoringEditor';
import { useForgeExitGuard } from './useForgeExitGuard';

const BRAND = '00000000-0000-4000-8000-000000000001';
const ASSET = '00000000-0000-4000-8000-000000000002';
const VERSION = '00000000-0000-4000-8000-000000000003';
const CLIENT = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function GuardedEditor() {
  const guard = useForgeExitGuard();
  const [active, setActive] = useState(true);
  return (
    <QueryClientProvider client={CLIENT}>
      <TemplateAuthoringEditor
        brandId={BRAND}
        assetId={ASSET}
        versionId={VERSION}
        name="Promo"
        active={active}
        onSaved={async () => {}}
        onOpenVariant={() => {
          document.body.dataset.openedVariant = 'yes';
        }}
        onDraftChange={guard.onDraftChange}
      />
      <button type="button" onClick={() => setActive(false)}>
        Switch inner tab
      </button>
      <button
        type="button"
        onClick={() =>
          guard.runGuarded(() => {
            document.body.dataset.exited = 'yes';
          })
        }
      >
        Leave Forge
      </button>
      {guard.dialog}
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  savedLayers.length = 0;
  draftWrites.length = 0;
  persistedDraft = null;
  failNextSave = true;
  delete document.body.dataset.exited;
  delete document.body.dataset.openedVariant;
});

describe('Forge editor exit guard integration', () => {
  test('saves the retained private draft before leaving, without publishing a golden variant', async () => {
    render(<GuardedEditor />);
    const position = await screen.findByLabelText('Position X');
    fireEvent.change(position, { target: { value: '140' } });
    fireEvent.blur(position);
    expect((await screen.findAllByRole('button', { name: 'Retry draft save' })).length).toBeGreaterThan(0);
    expect(persistedDraft).toBeNull();
    expect((position as HTMLInputElement).value).toBe('140');
    fireEvent.click(screen.getByRole('button', { name: 'Switch inner tab' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave Forge' }));
    expect(document.body.dataset.exited).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Save private draft' }));
    await waitFor(() => expect(document.body.dataset.exited).toBe('yes'));
    expect(document.body.dataset.openedVariant).toBeUndefined();
    expect(savedLayers).toHaveLength(0);
    expect(draftWrites.at(-1)?.expectedRevision).toBe(0);
    expect(draftWrites.at(-1)?.baseVersionId).toBe(VERSION);
    expect(draftWrites.at(-1)?.commands).toHaveLength(1);
    expect(draftWrites.at(-1)?.commands[0]).toMatchObject({
      type: 'layer.edit', nodeId: 'aep:63:114',
      edit: { compId: 63, layerId: 114, position: [140, 200] },
    });
    expect(persistedDraft?.revision).toBe(1);
    expect(persistedDraft?.scope).toEqual(scope);
  });
});
