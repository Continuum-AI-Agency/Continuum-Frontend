import { afterEach, describe, expect, mock, test } from 'bun:test';
import type {
  SaveTemplateLayerVariantRequest,
  TemplateLayerInventoryResponse,
  TemplateLayerPreviewRequest,
  TemplatePreview,
  TemplateLineage,
  TemplateAuthoringCommand,
  TemplateAuthoringDocument,
  TemplateAuthoringDraft,
  TemplateAuthoringDraftPut,
  TemplateAuthoringArtifact,
  TemplateAuthoringPreparation,
  TemplateAuthoringCompileRequest,
  TemplateAuthoringPreparationRequest,
  TemplateAuthoringNativeRenderRequest,
  TemplateAuthoringNode,
  TemplateAuthoringWorkspacePreviewResponse,
  TemplateRevisionVariant,
  MediaAsset,
} from '@continuum/contracts';
import type { TemplateVariablesResponse } from '@/lib/library/templateSources';
import type { AuthoringEditableLayer } from './authoringTemplateLayerTypes';

const layer = (over: Partial<AuthoringEditableLayer>): AuthoringEditableLayer => ({
  compId: 63,
  comp: 'Middle Text line',
  layerId: 1,
  name: 'Layer',
  kind: 'artwork',
  visible: true,
  visibilityReason: null,
  textReason: null,
  text: null,
  font: null,
  fontSize: null,
  slotKeys: [],
  visibilitySlotKeys: [],
  index: 0,
  x: 100,
  y: 200,
  position: [100, 200],
  rotation: 0,
  scale: [100, 100],
  opacity: 100,
  transformLocks: {},
  parentName: null,
  parentId: null,
  ...over,
});
const LAYERS = [
  layer({
    layerId: 114,
    name: 'MENOS',
    text: 'MENOS DE 2.5',
    kind: 'text',
    index: 0,
    fontSize: 50,
  }),
  layer({
    layerId: 71,
    name: 'Red Box',
    index: 1,
    transformLocks: { scale: 'Scale is set by an expression and must be edited in its source.' },
  }),
  layer({
    layerId: 70,
    name: 'White Box',
    index: 2,
    transformLocks: {
      position: 'Position is set by an expression and must be edited in its source.',
    },
  }),
  layer({ layerId: 9, compId: 412, comp: 'Card B', name: 'Card', index: 0 }),
];
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">' +
  '<g data-layer-id="70"><polygon points="0,0 400,0 400,300 0,300"/></g>' +
  '<g data-layer-id="71"><polygon points="10,10 20,10 20,20 10,20"/></g>' +
  '<g data-layer-id="114"><text x="100" y="200">MENOS</text></g></svg>';
const GOLDEN: TemplateLineage = { role: 'golden', parent: null };
let inventory: TemplateLayerInventoryResponse;
const fresh = (
  over: Partial<TemplateLayerInventoryResponse> = {},
): TemplateLayerInventoryResponse => ({
  compId: 63,
  comps: [
    { id: 63, name: 'Middle Text line', orderReason: null },
    {
      id: 412,
      name: 'Card B',
      orderReason:
        'An expression finds layers by their position in this composition, so their order is fixed.',
    },
  ],
  layers: LAYERS,
  warnings: [],
  lineage: GOLDEN,
  designImport: false,
  ...over,
});
inventory = fresh();
let readInventory: () => Promise<TemplateLayerInventoryResponse> = async () => inventory;
const inventories = mock(() => readInventory());
const scenes = mock(async (_b: string, _a: string, _v: string, compId: number | null) => ({
  compId: compId ?? inventory.compId,
  svg: SVG,
  warnings: [],
}));
const compose = async (_assetId: string, request: TemplateLayerPreviewRequest) => {
  const { lineage: _l, designImport: _d, ...view } = inventory;
  return { ...view, compId: request.compId ?? inventory.compId, svg: SVG };
};
const previews = mock(compose);
const save = async (_assetId: string, request: SaveTemplateLayerVariantRequest) => ({
  assetId: request.saveTo === 'new_variant' ? '00000000-0000-4000-8000-0000000000c1' : 'a',
  versionId: '00000000-0000-4000-8000-0000000000v2'.replace('v', '0'),
  parseState: 'parsed',
  checksum: 'a'.repeat(64),
});
const saves = mock(save);
const authoringScope = {
  brandId: '00000000-0000-4000-8000-000000000001',
  assetId: 'a',
  baseVersionId: '00000000-0000-4000-8000-000000000002',
};
const authoringChecksum = 'c'.repeat(64);
const packageChecksum = 'f'.repeat(64);
const authoringDocument = {
  scope: authoringScope,
  sourceChecksum: authoringChecksum,
  sourceHeadVersionId: authoringScope.baseVersionId,
  readiness: 'ready',
  diagnostics: [],
  exposureKeys: [],
  fontChoices: [],
  compositions: [
    { compId: 63, name: 'Middle Text line', width: 400, height: 300, frameRate: 30, durationSec: 5, clock: {}, parentCompIds: [], orderReason: null, creationReason: 'No verified text creation in fixture.', artboardReason: null, nodeIds: LAYERS.filter((item) => item.compId === 63).map((item) => `aep:${item.compId}:${item.layerId}`) },
    { compId: 412, name: 'Card B', width: 400, height: 300, frameRate: 30, durationSec: 5, clock: {}, parentCompIds: [], orderReason: 'fixed', creationReason: 'No verified text creation in fixture.', nodeIds: ['aep:412:9'] },
  ],
  nodes: LAYERS.map((item) => ({
    nodeId: `aep:${item.compId}:${item.layerId}`,
    sourceRef: { compId: item.compId, layerId: item.layerId },
    sourceNodeId: null,
    sourceCompositionId: item.compId,
    parentNodeId: null,
    name: item.name,
    textContent: item.text,
    fontRef: null,
    fillColor: null,
    kind: item.kind,
    index: item.index,
    visible: item.visible,
    visibilityReason: item.visibilityReason,
    textReason: item.textReason,
    font: item.font,
    fontSize: item.fontSize,
    position: item.position,
    rotation: item.rotation,
    scale: item.scale,
    opacity: item.opacity,
    transformLocks: item.transformLocks,
    capabilities: { transform: true, visibility: true, font: true, text: false, order: item.compId === 63, exposure: false, creation: false, duplicate: false, delete: false, grouping: false, masks: false, artboardMutation: false, keyframes: false },
    keyframeChannels: [],
    duplicateReason: 'Not part of this fixture.',
    deleteReason: 'Not part of this fixture.',
    opaqueSourceRef: { versionId: authoringScope.baseVersionId, checksum: authoringChecksum },
  })),
  opaqueSourceRef: {
    versionId: authoringScope.baseVersionId,
    checksum: authoringChecksum,
    authority: 'pinned-source-package',
  },
} as TemplateAuthoringDocument;
let authoringProjectionSource: TemplateAuthoringDocument = authoringDocument;
let authoringDraft: TemplateAuthoringDraft | null = null;
let authoringTestUserId = 'test-user-0';
let authoringTestUserSequence = 0;
let failNextPinnedArtworkPreview = false;
let nextPinnedArtworkPreviewRequest: Promise<{
  id: string;
  assetId: string;
  checksum: string;
  mimeType: string;
  fileName: string;
  width: number;
  height: number;
  signedUrl: string;
}> | null = null;
const authoringDocumentReads = mock(
  async (_assetId: string, brandId: string, baseVersionId: string) => ({
    ...authoringDocument,
    scope: { ...authoringScope, brandId, baseVersionId },
    sourceHeadVersionId: baseVersionId,
    opaqueSourceRef: { ...authoringDocument.opaqueSourceRef, versionId: baseVersionId },
  }),
);
const authoringDraftReads = mock(
  async (_assetId: string, _brandId: string, baseVersionId: string) =>
    authoringDraft?.scope.baseVersionId === baseVersionId ? authoringDraft : null,
);
const authoringDraftWrites = mock(async (_assetId: string, request: TemplateAuthoringDraftPut) => {
  authoringDraft = {
    scope: { ...authoringScope, baseVersionId: request.baseVersionId },
    sourceChecksum: authoringChecksum,
    requiresReconciliation: false,
    currentSource: {
      templateSourceVersionId: request.baseVersionId,
      templateSourceChecksum: authoringChecksum,
      assetHeadVersionId: request.baseVersionId,
      assetHeadChecksum: authoringChecksum,
    },
    revision: request.expectedRevision + 1,
    commands: structuredClone(request.commands) as TemplateAuthoringCommand[],
    projectedDocument: projectTemplateAuthoringCommands(authoringProjectionSource, request.commands),
    updatedAt: '2026-10-11T00:00:00.000Z',
  };
  return authoringDraft;
});
const verificationPending = {
  packageIntegrity: 'pending' as const,
  writerReadback: 'pending' as const,
  sourcePreservation: 'pending' as const,
  dependencies: 'pending' as const,
  format: 'pending' as const,
  nativeAfterEffects: 'pending' as const,
  status: 'pending' as const,
};
let authoringArtifact: TemplateAuthoringArtifact = {
  artifactId: '10000000-0000-4000-8000-000000000301',
  scope: authoringScope,
  draftRevision: 1,
  sourceChecksum: authoringChecksum,
  commandDigest: 'e'.repeat(64),
  packageChecksum,
  filename: 'private-template.aep',
  sizeBytes: 4096,
  state: 'prepared',
  verification: verificationPending,
  createdAt: '2026-10-11T00:00:00.000Z',
  reviewedAt: null,
  commit: null,
};
let authoringPreparation: TemplateAuthoringPreparation = {
  artifactId: authoringArtifact.artifactId,
  scope: authoringScope,
  userId: '10000000-0000-4000-8000-000000000302',
  draftRevision: 1,
  sourceChecksum: authoringChecksum,
  commandDigest: authoringArtifact.commandDigest,
  packageChecksum,
  state: 'draft_ready',
  runId: 'forge-preparation-fixture',
  forgeState: 'draft_ready',
  progress: null,
  errorCode: null,
  updatedAt: '2026-10-11T00:00:00.000Z',
};
const compileAuthoring = mock(async (_assetId: string, request: TemplateAuthoringCompileRequest) => ({
  ...authoringArtifact,
  draftRevision: request.expectedRevision,
  scope: { ...authoringScope, brandId: request.brandId, baseVersionId: request.baseVersionId },
}));
const prepareAuthoring = mock(async (_assetId: string, _artifactId: string, _scope: { brandId: string; baseVersionId: string }, request: TemplateAuthoringPreparationRequest) => ({
  ...authoringPreparation,
  artifactId: request.artifactId,
  draftRevision: request.expectedDraftRevision,
  sourceChecksum: request.sourceChecksum,
  commandDigest: request.commandDigest,
  packageChecksum: request.packageChecksum,
}));
const nativeRenders = mock(async (_assetId: string, _artifactId: string, _scope: { brandId: string; baseVersionId: string }, request: TemplateAuthoringNativeRenderRequest) => ({
  renderId: '10000000-0000-4000-8000-000000000303',
  artifactId: authoringArtifact.artifactId,
  scope: authoringScope,
  userId: '10000000-0000-4000-8000-000000000302',
  draftRevision: request.expectedDraftRevision,
  sourceChecksum: request.sourceChecksum,
  commandDigest: request.commandDigest,
  packageChecksum: request.packageChecksum,
  requestDigest: 'a'.repeat(64),
  engine: null,
  state: 'needs_input' as const,
  errorCode: 'PRIVATE_NATIVE_RENDER_UNAVAILABLE',
  frames: [],
  updatedAt: '2026-10-11T00:00:00.000Z',
}));
const authoringArtifactReads = mock(async () => authoringArtifact);
const reviewAuthoring = mock(async () => ({ ...authoringArtifact, state: 'reviewed' as const, reviewedAt: '2026-10-11T00:00:00.000Z' }));
const commitAuthoring = mock(async () => ({ ...authoringArtifact, state: 'committed' as const, commit: {
  assetId: '10000000-0000-4000-8000-000000000304',
  versionId: '10000000-0000-4000-8000-000000000305',
  packageChecksum,
} }));
const sampleFrameRead = mock(async () => ({ blob: new Blob(['verified-frame']), sha256: 'b'.repeat(64), stale: false }));
const authoringFontPreviews = mock(async (_assetId: string, _scope: unknown, font: { sha256: string }) => ({
  bytes: new ArrayBuffer(16), contentType: 'font/ttf', sha256: font.sha256,
}));
const workspacePreviews = mock(async (
  _assetId: string,
  _scope: { brandId: string; baseVersionId: string },
  revision: number,
  compId?: number,
): Promise<TemplateAuthoringWorkspacePreviewResponse> => {
  const { lineage: _lineage, designImport: _designImport, ...preview } = inventory;
  return {
    ...preview,
    compId: compId ?? inventory.compId,
    svg: SVG,
    artifactId: '10000000-0000-4000-8000-000000000401',
    packageChecksum: '9'.repeat(64),
    draftRevision: revision,
  };
});
const stageForForge = mock(async () => ({
  artifact: { artifactId: '10000000-0000-4000-8000-000000000402', purpose: 'workspace_seed' },
  map: {},
}));
const revisionVariants = mock(async () => ([{
  templateId: '10000000-0000-4000-8000-000000000201',
  variantId: '10000000-0000-4000-8000-000000000202',
  name: 'Original',
  original: inventory.lineage.role === 'golden',
  parentRevisionId: null,
  draftHeadRevisionId: '10000000-0000-4000-8000-000000000203',
  publishedHeadRevisionId: null,
  archivedAt: null,
  tags: [],
  sourceKind: 'after_effects',
  revisions: [{
    id: '10000000-0000-4000-8000-000000000204',
    sourceAssetId: 'a',
    sourceVersionId: VERSION,
  }],
}] as unknown as TemplateRevisionVariant[]));
const fieldReads = mock(async (): Promise<TemplateVariablesResponse> => ({
  variables: [],
  edits: [],
  parseState: 'parsed',
}));
const sources = { ...(await import('@/lib/library/templateSources')) };
mock.module('@/lib/library/templateSources', () => ({
  ...sources,
  fetchTemplateLayerInventory: inventories,
  fetchTemplateLayerScene: scenes,
  previewTemplateLayers: previews,
  saveTemplateLayerVariant: saves,
  fetchTemplateAuthoringUserId: async () => authoringTestUserId,
  fetchTemplateAuthoringDocument: authoringDocumentReads,
  fetchTemplateAuthoringDraft: authoringDraftReads,
  fetchTemplateAuthoringWorkspacePreview: workspacePreviews,
  fetchTemplateAuthoringFontPreview: authoringFontPreviews,
  putTemplateAuthoringDraft: authoringDraftWrites,
  compileTemplateAuthoring: compileAuthoring,
  prepareTemplateAuthoringArtifact: prepareAuthoring,
  requestTemplateAuthoringNativeRender: nativeRenders,
  fetchTemplateAuthoringArtifact: authoringArtifactReads,
  fetchTemplateAuthoringPreparation: async () => authoringPreparation,
  fetchTemplateAuthoringNativeRender: async () => ({
    renderId: '10000000-0000-4000-8000-000000000303', artifactId: authoringArtifact.artifactId,
    scope: authoringScope, userId: '10000000-0000-4000-8000-000000000302', draftRevision: authoringArtifact.draftRevision,
    sourceChecksum: authoringArtifact.sourceChecksum, commandDigest: authoringArtifact.commandDigest,
    packageChecksum: authoringArtifact.packageChecksum, requestDigest: 'a'.repeat(64), engine: null,
    state: 'needs_input' as const, errorCode: 'PRIVATE_NATIVE_RENDER_UNAVAILABLE', frames: [],
    updatedAt: '2026-10-11T00:00:00.000Z',
  }),
  fetchTemplateAuthoringNativeRenderFrame: sampleFrameRead,
  reviewTemplateAuthoringArtifact: reviewAuthoring,
  commitTemplateAuthoringArtifact: commitAuthoring,
  fetchPinnedArtworkPreview: async (_brandId: string, assetRef: { assetId: string; versionId: string; sha256: string }) => {
    if (failNextPinnedArtworkPreview) {
      failNextPinnedArtworkPreview = false;
      throw new Error('Could not verify the selected Library image once.');
    }
    if (nextPinnedArtworkPreviewRequest) {
      const pending = nextPinnedArtworkPreviewRequest;
      nextPinnedArtworkPreviewRequest = null;
      return pending;
    }
    const jpeg = assetRef.assetId.endsWith('103');
    return {
      id: assetRef.versionId, assetId: assetRef.assetId, checksum: assetRef.sha256,
      mimeType: jpeg ? 'image/jpeg' : 'image/png', fileName: jpeg ? 'Pinned.jpg' : 'Pinned.png', width: 320, height: 180,
      signedUrl: jpeg ? '/fixture/pinned-image.jpg' : '/fixture/pinned-image.png',
    };
  },
  fetchTemplateRevisionVariants: revisionVariants,
  fetchTemplateVariables: fieldReads,
  editableTemplateFonts: async () => [],
}));
mock.module('@/lib/api/hyperframesAgent.client', () => ({
  stageHyperframesRevisionForForge: stageForForge,
}));
mock.module('@/components/library/editor/LibraryMediaPickerDialog', () => ({
  LibraryMediaPickerDialog: ({ open, onOpenChange, onPickAssets, copy }: {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    onPickAssets?: (assets: MediaAsset[]) => void;
    copy?: { title: string; description: string; confirm: string };
  }) => <div data-testid="library-media-picker" data-open={String(!!open)}>
    {open ? <div role="dialog" aria-label={copy?.title} onKeyDown={(event) => {
      if (event.key === 'Escape') onOpenChange?.(false);
    }}>
    <p>{copy?.description}</p>
    <button type="button" onClick={() => { onOpenChange?.(false); }}>Cancel</button>
    <button type="button" onClick={() => {
      onPickAssets?.([{
      id: '10000000-0000-4000-8000-000000000101', brandId: BRAND, kind: 'image', mimeType: 'image/png',
      fileName: 'Pinned.png', title: 'Pinned image', width: 320, height: 180,
      headVersionId: '10000000-0000-4000-8000-000000000102', checksum: 'd'.repeat(64),
      } as MediaAsset]);
      onOpenChange?.(false);
    }}>Pick exact Library image</button>
    <button type="button" onClick={() => {
      onPickAssets?.([{
      id: '10000000-0000-4000-8000-000000000103', brandId: BRAND, kind: 'image', mimeType: 'image/jpeg',
      fileName: 'Pinned.jpg', title: 'Pinned JPEG', width: 320, height: 180,
      headVersionId: '10000000-0000-4000-8000-000000000104', checksum: 'e'.repeat(64),
      } as MediaAsset]);
      onOpenChange?.(false);
    }}>Pick exact Library JPEG</button>
    </div> : null}
  </div>,
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { LayerDraftState } from './layerDraft';
import { projectTemplateAuthoringCommands } from './templateAuthoringProjection';
import { templateAuthoringWorkspaceIdentity } from './useTemplateAuthoringDraft';
import { readTemplateAuthoringViewState } from './templateDraftRecovery';
import { applyLayerChange, stackOf, TemplateAuthoringEditor as TemplateLayerEditor } from './TemplateAuthoringEditor';

const BRAND = '00000000-0000-4000-8000-000000000001';
const VERSION = '00000000-0000-4000-8000-000000000002';
const privateDraftStores = new Map<string, Map<IDBValidKey, unknown>>();
const privateDraftTestDatabase = {
  objectStoreNames: { contains: (name: string) => privateDraftStores.has(name) },
  createObjectStore(name: string) {
    privateDraftStores.set(name, new Map());
    return {};
  },
  transaction(name: string) {
    const transaction: IDBTransaction = {
      db: undefined as never,
      durability: 'default',
      error: null,
      mode: 'readonly',
      objectStoreNames: {} as DOMStringList,
      onabort: null,
      oncomplete: null,
      onerror: null,
      abort: () => {},
      commit: () => {},
      objectStore: () => {
        const store = privateDraftStores.get(name)!;
        const request = <T,>(result: T): IDBRequest<T> => {
          const pending = { result, error: null, source: null, transaction, readyState: 'done', onsuccess: null, onerror: null } as unknown as IDBRequest<T>;
          queueMicrotask(() => { pending.onsuccess?.(new Event('success') as unknown as IDBRequestEventMap['success']); transaction.oncomplete?.(new Event('complete') as unknown as IDBTransactionEventMap['complete']); });
          return pending;
        };
        return {
          get: (key: IDBValidKey) => request(store.get(key)),
          getAll: () => request([...store.values()]),
          put(value: { id?: IDBValidKey }, key?: IDBValidKey) { const id = key ?? value.id; if (id !== undefined) store.set(id, structuredClone(value)); return request(id); },
          delete(key: IDBValidKey) { store.delete(key); return request(undefined); },
        } as unknown as IDBObjectStore;
      },
    };
    return transaction;
  },
  close() {},
};
const privateDraftTestIndexedDb = {
  open() {
    const request = { result: privateDraftTestDatabase, error: null, onupgradeneeded: null, onsuccess: null, onerror: null } as unknown as IDBOpenDBRequest;
    queueMicrotask(() => {
      request.onupgradeneeded?.(new Event('upgradeneeded') as unknown as IDBVersionChangeEvent);
      request.onsuccess?.(new Event('success') as unknown as IDBRequestEventMap['success']);
    });
    return request;
  },
} as unknown as IDBFactory;
const originalPrivateDraftIndexedDb = globalThis.indexedDB;
const enablePrivateDraftTestStorage = () => Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: privateDraftTestIndexedDb });
const persistedDraftForTest = (
  revision: number,
  commands: TemplateAuthoringCommand[],
): TemplateAuthoringDraft => ({
  scope: authoringScope,
  sourceChecksum: authoringChecksum,
  requiresReconciliation: false,
  currentSource: {
    templateSourceVersionId: authoringScope.baseVersionId,
    templateSourceChecksum: authoringChecksum,
    assetHeadVersionId: authoringScope.baseVersionId,
    assetHeadChecksum: authoringChecksum,
  },
  revision,
  commands,
  projectedDocument: projectTemplateAuthoringCommands(authoringDocument, commands),
  updatedAt: '2026-10-11T00:00:00.000Z',
});
const seedWorkspacePackage = {
  kind: 'hyperframes_seed' as const,
  artifactId: '10000000-0000-4000-8000-000000000411',
  packageChecksum: '9'.repeat(64),
  sourceRevisionId: '10000000-0000-4000-8000-000000000412',
  sourceHtmlSha256: '1'.repeat(64),
  extractedSceneSha256: '2'.repeat(64),
};
const seedAuthoringDocument: TemplateAuthoringDocument = {
  ...authoringDocument,
  workspacePackage: seedWorkspacePackage,
  nodes: authoringDocument.nodes.map((node) => ({
    ...node,
    opaqueSourceRef: {
      versionId: null,
      checksum: seedWorkspacePackage.packageChecksum,
      workspacePackage: seedWorkspacePackage,
    },
  })),
};
const packageFontChoice = {
  kind: 'workspace_package' as const,
  packageChecksum: seedWorkspacePackage.packageChecksum,
  postScriptName: 'DejaVuSans',
  sha256: '8'.repeat(64),
  scope: 'workspace_package' as const,
};
const packageFontAuthoringDocument: TemplateAuthoringDocument = {
  ...seedAuthoringDocument,
  fontChoices: [packageFontChoice],
  compositions: seedAuthoringDocument.compositions.map((composition) => ({ ...composition, creationReason: null })),
};
const originalFontFace = globalThis.FontFace;
const originalDocumentFonts = document.fonts;
const seededDraftForTest = (revision: number): TemplateAuthoringDraft => ({
  ...persistedDraftForTest(revision, []),
  seed: {
    artifactId: seedWorkspacePackage.artifactId,
    packageChecksum: seedWorkspacePackage.packageChecksum,
    attachedAtRevision: 1,
    sourceRevisionId: seedWorkspacePackage.sourceRevisionId,
    sourceHtmlSha256: seedWorkspacePackage.sourceHtmlSha256,
    extractedSceneSha256: seedWorkspacePackage.extractedSceneSha256,
  },
  projectedDocument: projectTemplateAuthoringCommands(seedAuthoringDocument, []),
});
stageForForge.mockImplementation(async (_revisionId: string, request: { expectedDraftRevision: number }) => {
  authoringDraft = seededDraftForTest(request.expectedDraftRevision + 1);
  return { artifact: { artifactId: seedWorkspacePackage.artifactId, purpose: 'workspace_seed' }, map: {} };
});
const nextRevision = {
  assetId: 'a',
  versionId: '00000000-0000-4000-8000-000000000003',
  parseState: 'parsed' as const,
  checksum: 'b'.repeat(64),
};
const AUTHORING_PARSE = {
  parser: 'after-effects',
  sourceFamily: 'aep',
  missingFootage: [],
  comps: [
    { name: 'Middle Text line', width: 400, height: 300, durationSec: 5, frameRate: 30, isDelivery: true },
  ],
  ratios: [{ ratio: '4:3', width: 400, height: 300, comps: ['Middle Text line'] }],
  slots: [],
} as TemplatePreview;
afterEach(() => {
  cleanup();
  failNextPinnedArtworkPreview = false;
  nextPinnedArtworkPreviewRequest = null;
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: originalPrivateDraftIndexedDb });
  Object.defineProperty(globalThis, 'FontFace', { configurable: true, value: originalFontFace });
  Object.defineProperty(document, 'fonts', { configurable: true, value: originalDocumentFonts });
  for (const spy of [
    inventories,
    scenes,
    previews,
    saves,
    revisionVariants,
    fieldReads,
    authoringDocumentReads,
    authoringDraftReads,
    authoringDraftWrites,
    compileAuthoring,
    prepareAuthoring,
    nativeRenders,
    authoringArtifactReads,
    reviewAuthoring,
    commitAuthoring,
    sampleFrameRead,
    workspacePreviews,
    authoringFontPreviews,
    stageForForge,
  ])
    spy.mockClear();
  saves.mockImplementation(save);
  authoringFontPreviews.mockImplementation(async (_assetId, _scope, font) => ({
    fontSha256: font.sha256,
    bytes: new Uint8Array([1, 2, 3]),
    contentType: 'font/woff2',
  }));
  authoringDraft = null;
  authoringProjectionSource = authoringDocument;
  authoringArtifact = {
    artifactId: '10000000-0000-4000-8000-000000000301', scope: authoringScope, draftRevision: 1,
    sourceChecksum: authoringChecksum, commandDigest: 'e'.repeat(64), packageChecksum,
    filename: 'private-template.aep', sizeBytes: 4096, state: 'prepared', verification: verificationPending,
    createdAt: '2026-10-11T00:00:00.000Z', reviewedAt: null, commit: null,
  };
  authoringPreparation = {
    artifactId: authoringArtifact.artifactId, scope: authoringScope,
    userId: '10000000-0000-4000-8000-000000000302', draftRevision: 1,
    sourceChecksum: authoringChecksum, commandDigest: authoringArtifact.commandDigest, packageChecksum,
    state: 'draft_ready', runId: 'forge-preparation-fixture', forgeState: 'draft_ready', progress: null,
    errorCode: null, updatedAt: '2026-10-11T00:00:00.000Z',
  };
  compileAuthoring.mockImplementation(async (_assetId, request) => ({
    ...authoringArtifact, scope: { ...authoringScope, brandId: request.brandId, baseVersionId: request.baseVersionId },
    draftRevision: request.expectedRevision,
  }));
  prepareAuthoring.mockImplementation(async (_assetId, _artifactId, _scope, request) => ({
    ...authoringPreparation, artifactId: request.artifactId, draftRevision: request.expectedDraftRevision,
    sourceChecksum: request.sourceChecksum, commandDigest: request.commandDigest, packageChecksum: request.packageChecksum,
  }));
  nativeRenders.mockImplementation(async (_assetId, _artifactId, _scope, request) => ({
    renderId: '10000000-0000-4000-8000-000000000303', artifactId: authoringArtifact.artifactId,
    scope: authoringScope, userId: '10000000-0000-4000-8000-000000000302', draftRevision: request.expectedDraftRevision,
    sourceChecksum: request.sourceChecksum, commandDigest: request.commandDigest, packageChecksum: request.packageChecksum,
    requestDigest: 'a'.repeat(64), engine: null, state: 'needs_input', errorCode: 'PRIVATE_NATIVE_RENDER_UNAVAILABLE',
    frames: [], updatedAt: '2026-10-11T00:00:00.000Z',
  }));
  authoringArtifactReads.mockImplementation(async () => authoringArtifact);
  reviewAuthoring.mockImplementation(async () => ({ ...authoringArtifact, state: 'reviewed', reviewedAt: '2026-10-11T00:00:00.000Z' }));
  commitAuthoring.mockImplementation(async () => ({ ...authoringArtifact, state: 'committed', commit: {
    assetId: '10000000-0000-4000-8000-000000000304', versionId: '10000000-0000-4000-8000-000000000305', packageChecksum,
  } }));
  authoringTestUserId = `test-user-${++authoringTestUserSequence}`;
  authoringDocumentReads.mockImplementation(async (_assetId, brandId, baseVersionId) => ({
    ...authoringDocument,
    scope: { ...authoringScope, brandId, baseVersionId },
    sourceHeadVersionId: baseVersionId,
    opaqueSourceRef: { ...authoringDocument.opaqueSourceRef, versionId: baseVersionId },
  }));
  authoringDraftWrites.mockImplementation(async (_assetId, request) => {
    authoringDraft = {
      scope: { ...authoringScope, baseVersionId: request.baseVersionId },
      sourceChecksum: authoringChecksum,
      requiresReconciliation: false,
      currentSource: {
        templateSourceVersionId: request.baseVersionId,
        templateSourceChecksum: authoringChecksum,
        assetHeadVersionId: request.baseVersionId,
        assetHeadChecksum: authoringChecksum,
      },
      revision: request.expectedRevision + 1,
      commands: structuredClone(request.commands),
      projectedDocument: projectTemplateAuthoringCommands(authoringProjectionSource, request.commands),
      updatedAt: '2026-10-11T00:00:00.000Z',
    };
    return authoringDraft;
  });
  inventory = fresh();
  readInventory = async () => inventory;
  previews.mockImplementation(compose);
});
const editor = (
  onOpenVariant = mock((_id: string) => {}),
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  onDraftChange?: (draft: LayerDraftState | null) => void,
  onSaved: () => Promise<void> = async () => {},
  versionId = VERSION,
  parse?: TemplatePreview | null,
  onOpenFontRepair?: () => void,
  hyperframesRevisionId?: string,
) =>
  render(
    <QueryClientProvider client={client}>
      <TemplateLayerEditor
        brandId={BRAND}
        assetId="a"
        versionId={versionId}
        name="Card B"
        parse={parse ?? AUTHORING_PARSE}
        active
        onSaved={onSaved}
        onOpenVariant={onOpenVariant}
        onDraftChange={onDraftChange}
        onOpenFontRepair={onOpenFontRepair}
        hyperframesRevisionId={hyperframesRevisionId}
      />
    </QueryClientProvider>,
  );

// Synthetic verified fixture used only to exercise the explicit review/commit UI.
// It does not represent an After Effects production run.
const enableVerifiedAuthoringFixture = () => {
  authoringArtifact = {
    ...authoringArtifact,
    verification: {
      packageIntegrity: 'passed',
      writerReadback: 'passed',
      sourcePreservation: 'passed',
      dependencies: 'passed',
      format: 'passed',
      nativeAfterEffects: 'passed',
      status: 'passed',
    },
  };
  authoringPreparation = { ...authoringPreparation, state: 'review_ready' };
  nativeRenders.mockImplementation(async (_assetId, _artifactId, _scope, request) => ({
    renderId: '10000000-0000-4000-8000-000000000303',
    artifactId: authoringArtifact.artifactId,
    scope: authoringScope,
    userId: '10000000-0000-4000-8000-000000000302',
    draftRevision: request.expectedDraftRevision,
    sourceChecksum: request.sourceChecksum,
    commandDigest: request.commandDigest,
    packageChecksum: request.packageChecksum,
    requestDigest: 'a'.repeat(64),
    engine: 'after-effects',
    state: 'completed',
    errorCode: null,
    frames: [{
      frameId: '10000000-0000-4000-8000-000000000306',
      compId: 63,
      frameIndex: 74,
      frameTimeSeconds: 74 / 30,
      formatId: 'Middle Text line',
      mimeType: 'image/png',
      width: 400,
      height: 300,
      frameRate: { numerator: 30, denominator: 1 },
      checksum: 'b'.repeat(64),
      stale: false,
    }],
    updatedAt: '2026-10-11T00:00:00.000Z',
  }));
};

const waitForAuthoringReadyToPublish = async (actionName: string) => {
  await waitFor(() => {
    const persisted = authoringDraft;
    expect(persisted).not.toBeNull();
    expect(persisted!.commands.length).toBeGreaterThan(0);
    expect(screen.getByText(`Draft saved · revision ${persisted!.revision}`)).toBeTruthy();
  });
  await waitFor(() => expect(compileAuthoring).toHaveBeenCalled());
  await waitFor(() => expect(prepareAuthoring).toHaveBeenCalled());
  await waitFor(() => expect(nativeRenders).toHaveBeenCalled());
  const publish = await screen.findByRole('button', { name: actionName });
  await waitFor(() => expect((publish as HTMLButtonElement).disabled).toBe(false));
};

describe('applyLayerChange', () => {
  test('a value equal to the file drops out, and a layer with nothing left is not edited', () => {
    const [text] = LAYERS;
    const moved = applyLayerChange({}, LAYERS, text!, { x: 120, y: 200, rotation: 0 });
    expect(moved).toEqual({ '63:114': { compId: 63, layerId: 114, x: 120 } });
    expect(applyLayerChange(moved, LAYERS, text!, { x: 100, y: 200 })).toEqual({});
  });
  test('a shared Show field moves every layer it drives', () => {
    const shared = [
      layer({ layerId: 1, visibilitySlotKeys: ['show-logo'] }),
      layer({ layerId: 2, compId: 412, visibilitySlotKeys: ['show-logo'] }),
    ];
    expect(Object.keys(applyLayerChange({}, shared, shared[0]!, { visible: false }))).toEqual([
      '63:1',
      '412:2',
    ]);
  });
});

test('stackOf lists a comp front first', () => {
  expect(stackOf([...LAYERS].reverse(), 63)).toEqual([114, 71, 70]);
});

describe('TemplateLayerEditor', () => {
  test('creates an empty private draft with revision-zero CAS before importing a seed on first use', async () => {
    enablePrivateDraftTestStorage();
    authoringDraft = null;
    editor(undefined, undefined, undefined, undefined, VERSION, undefined, undefined, '10000000-0000-4000-8000-000000000413');
    const importButton = await screen.findByRole('button', { name: 'Create private draft and import' });
    await waitFor(() => expect((importButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(importButton);

    await waitFor(() => expect(authoringDraftWrites).toHaveBeenCalledWith('a', {
      brandId: BRAND, baseVersionId: VERSION, expectedRevision: 0, commands: [],
    }));
    await waitFor(() => expect(stageForForge).toHaveBeenCalledWith(
      '10000000-0000-4000-8000-000000000413',
      { brandId: BRAND, assetId: 'a', baseVersionId: VERSION, expectedDraftRevision: 1 },
    ));
    expect(await screen.findByTestId('hyperframes-seed-attached')).toBeTruthy();
  });

  test('reconciles a lost empty-draft bootstrap response only from exact empty scope', async () => {
    enablePrivateDraftTestStorage();
    authoringDraft = null;
    authoringDraftWrites.mockImplementation(async () => {
      authoringDraft = persistedDraftForTest(1, []);
      throw new Error('Bootstrap response was lost.');
    });
    editor(undefined, undefined, undefined, undefined, VERSION, undefined, undefined, '10000000-0000-4000-8000-000000000413');
    const importButton = await screen.findByRole('button', { name: 'Create private draft and import' });
    await waitFor(() => expect((importButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(importButton);

    await waitFor(() => expect(stageForForge).toHaveBeenCalledWith(
      '10000000-0000-4000-8000-000000000413',
      { brandId: BRAND, assetId: 'a', baseVersionId: VERSION, expectedDraftRevision: 1 },
    ));
    expect(await screen.findByTestId('hyperframes-seed-attached')).toBeTruthy();
  });

  test('imports a private HyperFrames seed into the current workspace and switches to exact seed preview pins', async () => {
    enablePrivateDraftTestStorage();
    authoringDraft = persistedDraftForTest(1, []);
    const initialBaseInventoryCalls = inventories.mock.calls.length;
    const initialBaseSceneCalls = scenes.mock.calls.length;
    editor(undefined, undefined, undefined, undefined, VERSION, undefined, undefined, '10000000-0000-4000-8000-000000000413');
    const importButton = await screen.findByRole('button', { name: 'Import into this Forge workspace' });
    await waitFor(() => expect((importButton as HTMLButtonElement).disabled).toBe(false));
    await waitFor(() => expect(inventories.mock.calls.length).toBeGreaterThan(initialBaseInventoryCalls));
    await waitFor(() => expect(scenes.mock.calls.length).toBeGreaterThan(initialBaseSceneCalls));
    const baseInventoryCallsBeforeImport = inventories.mock.calls.length;
    const baseSceneCallsBeforeImport = scenes.mock.calls.length;
    fireEvent.click(importButton);

    await waitFor(() => expect(stageForForge).toHaveBeenCalledWith(
      '10000000-0000-4000-8000-000000000413',
      { brandId: BRAND, assetId: 'a', baseVersionId: VERSION, expectedDraftRevision: 1 },
    ));
    expect(await screen.findByTestId('hyperframes-seed-attached')).toBeTruthy();
    await waitFor(() => expect(workspacePreviews).toHaveBeenCalledWith(
      'a', { brandId: BRAND, baseVersionId: VERSION }, 2, undefined,
    ));
    expect(inventories).toHaveBeenCalledTimes(baseInventoryCallsBeforeImport);
    expect(scenes).toHaveBeenCalledTimes(baseSceneCallsBeforeImport);
    expect(saves).not.toHaveBeenCalled();
    expect(commitAuthoring).not.toHaveBeenCalled();
  });

  test('reconciles a seed attach when the private export completes but its response is lost', async () => {
    enablePrivateDraftTestStorage();
    authoringDraft = persistedDraftForTest(1, []);
    stageForForge.mockImplementation(async (_revisionId: string, request: { expectedDraftRevision: number }) => {
      authoringDraft = seededDraftForTest(request.expectedDraftRevision + 1);
      throw new Error('The import response was lost.');
    });
    editor(undefined, undefined, undefined, undefined, VERSION, undefined, undefined, '10000000-0000-4000-8000-000000000413');
    const importButton = await screen.findByRole('button', { name: 'Import into this Forge workspace' });
    await waitFor(() => expect((importButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(importButton);

    expect(await screen.findByTestId('hyperframes-seed-attached')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(workspacePreviews).toHaveBeenCalledWith(
      'a', { brandId: BRAND, baseVersionId: VERSION }, 2, undefined,
    );
    expect(saves).not.toHaveBeenCalled();
    expect(commitAuthoring).not.toHaveBeenCalled();
  });

  test('keeps pre-seed recovery visible but blocks restoring it into a different private package', async () => {
    enablePrivateDraftTestStorage();
    authoringDraft = seededDraftForTest(2);
    const recoveryId = 'old-workspace-recovery';
    privateDraftStores.set('recoveries', new Map([[recoveryId, {
      id: recoveryId,
      userId: authoringTestUserId,
      scope: authoringScope,
      workspaceIdentity: templateAuthoringWorkspaceIdentity(undefined, authoringChecksum),
      sourceChecksum: authoringChecksum,
      revision: 1,
      commands: [{ type: 'layer.edit', nodeId: 'aep:63:114', edit: { compId: 63, layerId: 114, text: 'Recovered headline' } }],
      persistedCommands: [],
      savedAt: '2026-10-11T00:00:00.000Z',
      reason: 'local',
    }]]));
    editor();

    fireEvent.click(await screen.findByText(/Browse saved recovery copies/));
    const restore = await screen.findByRole('button', { name: 'Different workspace · preserved' });
    expect((restore as HTMLButtonElement).disabled).toBe(true);
    expect(authoringDraftWrites).not.toHaveBeenCalled();
  });

  test('pending artboard eligibility stays locked with readable status copy', async () => {
    authoringDocumentReads.mockImplementation(async (_assetId, brandId, baseVersionId) => ({
      ...authoringDocument,
      scope: { ...authoringScope, brandId, baseVersionId },
      compositions: authoringDocument.compositions.map((composition) => ({
        ...composition,
        artboardReason: composition.compId === 63 ? 'authoring_artboard_preflight_pending' : composition.artboardReason,
      })),
    }));
    editor();
    fireEvent.click(await screen.findByRole('button', { name: 'Create and artboard tools' }));
    const width = await screen.findByRole('spinbutton', { name: 'Composition width' });
    expect(width.hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Apply composition size' })).toBeNull();
    expect(screen.getByText('Composition size editing is waiting for a verified source check.')).toBeTruthy();
  });

  test('artboard resize uses its positive capability, updates the actual preview frame, and saves a command', async () => {
    editor();
    fireEvent.click(await screen.findByRole('button', { name: 'Create and artboard tools' }));
    const width = await screen.findByRole('spinbutton', { name: 'Composition width' });
    const height = screen.getByRole('spinbutton', { name: 'Composition height' });
    await waitFor(() => expect((width as HTMLInputElement).value).toBe('400'));
    expect((height as HTMLInputElement).value).toBe('300');
    fireEvent.change(width, { target: { value: '640' } });
    fireEvent.change(height, { target: { value: '360' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply composition size' }));
    await waitFor(() => expect(authoringDraftWrites).toHaveBeenCalled());
    expect(authoringDraftWrites.mock.calls.at(-1)?.[1].commands).toContainEqual({
      type: 'artboard.resize', compId: 63, width: 640, height: 360,
    });
    await waitFor(() => expect(document.querySelector('[data-effective-artboard="640x360"]')?.getAttribute('viewBox')).toBe('0 0 640 360'));
    expect(screen.getByRole('button', { name: 'Review and publish variant' }).hasAttribute('disabled')).toBe(true);
    expect(saves).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Undo layer change' }));
    await waitFor(() => expect(document.querySelector('[data-effective-artboard="400x300"]')?.getAttribute('viewBox')).toBe('0 0 400 300'));
    fireEvent.click(screen.getByRole('button', { name: 'Redo layer change' }));
    await waitFor(() => expect(document.querySelector('[data-effective-artboard="640x360"]')?.getAttribute('viewBox')).toBe('0 0 640 360'));
  });

  test('a new draft artboard selects by stable UUID and has no native composition ID', async () => {
    editor();
    fireEvent.click(await screen.findByRole('button', { name: 'Create and artboard tools' }));
    const name = await screen.findByRole('textbox', { name: 'New artboard name' });
    fireEvent.change(name, { target: { value: 'Promo card' } });
    const addArtboard = screen.getByRole('button', { name: 'Add artboard' }) as HTMLButtonElement;
    await waitFor(() => expect(addArtboard.disabled).toBe(false));
    fireEvent.click(addArtboard);
    await waitFor(() => expect(authoringDraftWrites).toHaveBeenCalled());
    const create = authoringDraftWrites.mock.calls.at(-1)?.[1].commands.find((command) => command.type === 'artboard.create');
    expect(create).toMatchObject({ type: 'artboard.create', name: 'Promo card', width: 400, height: 300 });
    if (create?.type !== 'artboard.create') throw new Error('Expected a draft artboard create command.');
    expect(create.artboardId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(authoringDraftWrites.mock.calls.at(-1)?.[1].commands.some((command) => 'compId' in command && command.compId === null)).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Rectangle' }));
    await waitFor(() => expect(authoringDraftWrites.mock.calls.at(-1)?.[1].commands).toContainEqual(
      expect.objectContaining({ type: 'shape.create', artboardId: create.artboardId }),
    ));
    expect(document.querySelector('[data-effective-artboard="400x300"]')?.getAttribute('viewBox')).toBe('0 0 400 300');
    expect(document.querySelector(`[data-authored-node-id^="draft:"]`)).toBeTruthy();
  });

  test('typing a new draft position after clearing it persists the completed number without a zero command', async () => {
    editor();
    fireEvent.click(await screen.findByRole('button', { name: 'Create and artboard tools' }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'New artboard name' }), { target: { value: 'Position entry' } });
    const addArtboard = screen.getByRole('button', { name: 'Add artboard' }) as HTMLButtonElement;
    await waitFor(() => expect(addArtboard.disabled).toBe(false));
    fireEvent.click(addArtboard);
    await waitFor(() => expect(authoringDraftWrites.mock.calls.at(-1)?.[1].commands.some((command) => command.type === 'artboard.create')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Rectangle' }));
    await waitFor(() => expect(authoringDraftWrites.mock.calls.at(-1)?.[1].commands.some((command) => command.type === 'shape.create')).toBe(true));

    const x = await screen.findByRole('textbox', { name: 'X position' });
    const writesBeforeEdit = authoringDraftWrites.mock.calls.length;
    fireEvent.change(x, { target: { value: '' } });
    fireEvent.change(x, { target: { value: '499' } });
    expect((x as HTMLInputElement).value).toBe('499');
    fireEvent.blur(x);

    await waitFor(() => expect(authoringDraftWrites.mock.calls.length).toBeGreaterThan(writesBeforeEdit));
    const savedCommands = authoringDraftWrites.mock.calls.at(-1)?.[1].commands ?? [];
    expect(savedCommands).toContainEqual(expect.objectContaining({
      type: 'layer.edit',
      edit: expect.objectContaining({ position: [499, 150] }),
    }));
    expect(savedCommands).not.toContainEqual(expect.objectContaining({
      type: 'layer.edit',
      edit: expect.objectContaining({ position: [0, 150] }),
    }));
    expect(authoringDraftWrites.mock.calls.at(-1)?.[1].expectedRevision).toBeGreaterThan(0);
    expect(saves).not.toHaveBeenCalled();
  });

  test('duplicating a native composition creates a draft UUID target and preserves its source layers', async () => {
    editor();
    await screen.findByRole('list', { name: 'Layers' });
    fireEvent.click(await screen.findByRole('button', { name: 'Create and artboard tools' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Duplicate', exact: true })[0]!);
    await waitFor(() => expect(authoringDraftWrites).toHaveBeenCalled());
    const duplicate = authoringDraftWrites.mock.calls.at(-1)?.[1].commands.find((command) => command.type === 'artboard.duplicate');
    expect(duplicate).toMatchObject({ type: 'artboard.duplicate', sourceCompId: 63, name: 'Middle Text line copy' });
    if (duplicate?.type !== 'artboard.duplicate') throw new Error('Expected a draft artboard duplicate command.');
    expect(duplicate.artboardId).toMatch(/^[0-9a-f-]{36}$/i);
    fireEvent.click(screen.getByRole('button', { name: 'Ellipse' }));
    await waitFor(() => expect(authoringDraftWrites.mock.calls.at(-1)?.[1].commands).toContainEqual(
      expect.objectContaining({ type: 'shape.create', artboardId: duplicate.artboardId }),
    ));
    expect(authoringDraftWrites.mock.calls.at(-1)?.[1].commands.some((command) => command.type === 'shape.create' && 'compId' in command)).toBe(false);
    expect(document.querySelector('[data-layer-id="114"]')).toBeTruthy();
    expect(document.querySelector('[data-layer-id="114"]')).toBeTruthy();
  });

  test('document capability locks override an unlocked inventory row without disabling independent font controls', async () => {
    enablePrivateDraftTestStorage();
    authoringDocumentReads.mockImplementation(async (_assetId, brandId, baseVersionId) => ({
      ...authoringDocument,
      scope: {...authoringScope, brandId, baseVersionId},
      sourceHeadVersionId: baseVersionId,
      nodes: authoringDocument.nodes.map(node => node.sourceRef?.layerId === 114
        ? {...node, capabilities:{...node.capabilities,transform:false},transformLocks:{position:'The source parent hierarchy is preserved.'}}
        : node),
      opaqueSourceRef:{...authoringDocument.opaqueSourceRef,versionId:baseVersionId},
    }));
    editor();
    await screen.findByRole('list',{name:'Layers'});
    await waitFor(() => expect((screen.getByRole('textbox',{name:'Position X'}) as HTMLInputElement).disabled).toBe(true));
    expect((screen.getByRole('textbox',{name:'Rotation'}) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('textbox',{name:'Opacity'}) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('textbox',{name:'Scale X'}) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('textbox',{name:'Text size (pt)'}) as HTMLInputElement).disabled).toBe(false);
    expect(screen.getByText('The source parent hierarchy is preserved.')).toBeTruthy();
    expect(screen.queryByRole('button',{name:'Rotate selected layer'})).toBeNull();
  });

  test('restores the selected composition, layer, and playhead after editor remount', async () => {
    enablePrivateDraftTestStorage();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = editor(undefined, client);
    const layers = await screen.findByRole('list', { name: 'Layers' });
    fireEvent.change(screen.getByLabelText('Search layers'), { target: { value: 'Card' } });
    fireEvent.click(within(layers).getByRole('button', { name: /^Card/ }));
    await waitFor(() => expect(scenes.mock.calls.at(-1)?.[3]).toBe(412));

    const playhead = await screen.findByLabelText('Timeline playhead') as HTMLInputElement;
    fireEvent.change(playhead, { target: { value: '2.5' } });
    const workspaceIdentity = templateAuthoringWorkspaceIdentity(undefined, authoringChecksum);
    await waitFor(async () => {
      const saved = await readTemplateAuthoringViewState(authoringTestUserId, authoringScope, workspaceIdentity);
      expect(saved).toMatchObject({
        compositionKey: 'aep:412',
        selectedNodeId: 'aep:412:9',
        playheadSec: 2.5,
      });
    });

    view.unmount();
    editor(undefined, client);
    await screen.findByRole('list', { name: 'Layers' });
    await waitFor(() => expect(within(screen.getByRole('combobox', { name: 'Composition' })).getByText('Card B')).toBeTruthy());
    expect((await screen.findByLabelText('Timeline playhead') as HTMLInputElement).value).toBe('2.5');
    expect(screen.getByText('Selected: Card')).toBeTruthy();
  });

  test('edits created shape timing and a fresh transform channel through the mounted timeline', async () => {
    enablePrivateDraftTestStorage();
    editor();
    await screen.findByRole('list', { name: 'Layers' });
    fireEvent.click(await screen.findByRole('button', { name: 'Create and artboard tools' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ellipse' }));
    await waitFor(() => expect(authoringDraftWrites.mock.calls.at(-1)?.[1].commands.some((command) => command.type === 'shape.create')).toBe(true));
    const create = authoringDraftWrites.mock.calls.at(-1)?.[1].commands.find((command) => command.type === 'shape.create');
    if (create?.type !== 'shape.create') throw new Error('Expected a saved shape.create command.');
    const nodeId = create.nodeId;

    const layerIn = await screen.findByRole('spinbutton', { name: 'Layer in time' });
    const layerOut = screen.getByRole('spinbutton', { name: 'Layer out time' });
    expect((layerIn as HTMLInputElement).disabled).toBe(false);
    fireEvent.change(layerIn, { target: { value: '0.5' } });
    fireEvent.change(layerOut, { target: { value: '3.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply timing' }));
    await waitFor(() => expect(authoringDraftWrites.mock.calls.at(-1)?.[1].commands).toContainEqual({
      type: 'layer.timing', nodeId, inSec: 0.5, outSec: 3.5,
    }));

    expect(screen.queryByRole('list', { name: 'Motion channels' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Edit keyframes/ }));
    const motionChannels = await screen.findByRole('list', { name: 'Motion channels' });
    fireEvent.click(within(motionChannels).getByRole('button', { name: /^Rotation / }));
    fireEvent.click(screen.getByRole('button', { name: 'Add at playhead' }));
    await waitFor(() => expect(authoringDraftWrites.mock.calls.at(-1)?.[1].commands.some((command) =>
      command.type === 'layer.keyframes.replace' && command.nodeId === nodeId && command.channel === 'rotation',
    )).toBe(true));
    const keyframes = authoringDraftWrites.mock.calls.at(-1)?.[1].commands.find((command) =>
      command.type === 'layer.keyframes.replace' && command.channel === 'rotation',
    );
    expect(keyframes).toMatchObject({
      type: 'layer.keyframes.replace', nodeId, channelId: `authoring:${nodeId}:ADBE Rotate Z`,
      keyframes: [expect.objectContaining({ value: 0, inInterpolation: 'LINEAR', outInterpolation: 'LINEAR' })],
    });
  });

  test('plays generated-node motion into its SVG pose without changing canonical authoring history', async () => {
    const nodeId = 'draft:30000000-0000-4000-8000-000000000001';
    const generated = {
      ...authoringDocument.nodes[1]!,
      nodeId,
      sourceRef: null,
      sourceNodeId: null,
      sourceCompositionId: 63,
      parentNodeId: null,
      name: 'Generated playback shape',
      kind: 'shape' as const,
      shape: 'rectangle' as const,
      size: [40, 24] as [number, number],
      pathPosition: [0, 0] as [number, number],
      position: [36, 36] as [number, number],
      rotation: 0,
      scale: [100, 100] as [number, number],
      opacity: 100,
      visible: true,
      inSec: 0,
      outSec: 5,
      timingReason: null,
      capabilities: { ...authoringDocument.nodes[1]!.capabilities, keyframes: true, timing: true },
      keyframeChannels: [
        { channelId: `${nodeId}:ADBE Position`, channel: 'position' as const, matchName: 'ADBE Position', frameRate: 30, dimensions: 3, separated: false, baseValue: [36, 36, 0], reason: null, keyframes: [
          { keyframeId: `${nodeId}:position:0`, timeSec: 0, value: [36, 36, 0], inInterpolation: 'LINEAR' as const, outInterpolation: 'LINEAR' as const, inEase: [], outEase: [] },
          { keyframeId: `${nodeId}:position:5`, timeSec: 5, value: [48, 42, 0], inInterpolation: 'LINEAR' as const, outInterpolation: 'LINEAR' as const, inEase: [], outEase: [] },
        ] },
        { channelId: `${nodeId}:ADBE Opacity`, channel: 'opacity' as const, matchName: 'ADBE Opacity', frameRate: 30, dimensions: 1, separated: false, baseValue: 100, reason: null, keyframes: [
          { keyframeId: `${nodeId}:opacity:0`, timeSec: 0, value: 100, inInterpolation: 'LINEAR' as const, outInterpolation: 'LINEAR' as const, inEase: [], outEase: [] },
          { keyframeId: `${nodeId}:opacity:5`, timeSec: 5, value: 70, inInterpolation: 'LINEAR' as const, outInterpolation: 'LINEAR' as const, inEase: [], outEase: [] },
        ] },
      ],
    } as unknown as TemplateAuthoringNode;
    const sourceDocument = {
      ...authoringDocument,
      compositions: authoringDocument.compositions.map((composition) => composition.compId === 63
        ? { ...composition, nodeIds: [...composition.nodeIds, nodeId] }
        : composition),
      nodes: [...authoringDocument.nodes, generated],
    };
    authoringProjectionSource = sourceDocument;
    authoringDocumentReads.mockImplementation(async (_assetId, brandId, baseVersionId) => ({
      ...sourceDocument,
      scope: { ...authoringScope, brandId, baseVersionId },
      sourceHeadVersionId: baseVersionId,
      opaqueSourceRef: { ...sourceDocument.opaqueSourceRef, versionId: baseVersionId },
    }));

    const originalRequestFrame = window.requestAnimationFrame;
    const originalCancelFrame = window.cancelAnimationFrame;
    const originalPerformanceNow = performance.now;
    let tick: FrameRequestCallback | null = null;
    Object.defineProperty(window, 'requestAnimationFrame', { configurable: true, value: (callback: FrameRequestCallback) => {
      tick = callback;
      return 1;
    } });
    Object.defineProperty(window, 'cancelAnimationFrame', { configurable: true, value: () => {} });
    Object.defineProperty(performance, 'now', { configurable: true, value: () => 1_000 });
    try {
      editor();
      const rows = await screen.findByRole('list', { name: 'Layers' });
      fireEvent.click(within(rows).getByText('Generated playback shape'));
      const authoredSvgNode = document.querySelector<SVGGElement>(`[data-authored-node-id="${nodeId}"]`);
      expect(authoredSvgNode?.getAttribute('transform')).toBe('translate(36 36) rotate(0) scale(1 1)');
      expect(authoredSvgNode?.getAttribute('opacity')).toBe('1');
      const play = await screen.findByRole('button', { name: 'Play' });
      fireEvent.click(play);
      await waitFor(() => expect(tick).toBeTruthy());
      await act(async () => { tick?.(3_200); });
      await waitFor(() => {
        expect(document.querySelector(`[data-authored-node-id="${nodeId}"]`)?.getAttribute('transform'))
          .toBe('translate(41.28 38.64) rotate(0) scale(1 1)');
        expect(document.querySelector(`[data-authored-node-id="${nodeId}"]`)?.getAttribute('opacity')).toBe('0.868');
      });
      expect((screen.getByLabelText('Timeline playhead') as HTMLInputElement).value).toBe('2.2');
      expect(authoringDraftWrites).not.toHaveBeenCalled();
      expect(authoringDraft?.commands ?? []).toEqual([]);
      expect(generated.position).toEqual([36, 36]);
      expect(generated.opacity).toBe(100);
    } finally {
      Object.defineProperty(window, 'requestAnimationFrame', { configurable: true, value: originalRequestFrame });
      Object.defineProperty(window, 'cancelAnimationFrame', { configurable: true, value: originalCancelFrame });
      Object.defineProperty(performance, 'now', { configurable: true, value: originalPerformanceNow });
    }
  });

  test('relinks an exact native JPEG dependency only to a pinned immutable JPEG with matching dimensions', async () => {
    enablePrivateDraftTestStorage();
    authoringProjectionSource = {
      ...authoringDocument,
      dependencies: [{
        footageItemId: 781,
        name: 'Portrait photo',
        mediaCode: 'ZPEG',
        footageFramerate: 0,
        originalFile: 'media/portrait.jpg',
        width: 320,
        height: 180,
        affectedLayers: [{ compId: 63, layerUid: 71 }],
        relinkReason: null,
      }],
    };
    authoringDocumentReads.mockImplementation(async (_assetId, brandId, baseVersionId) => ({
      ...authoringProjectionSource,
      scope: { ...authoringScope, brandId, baseVersionId },
      sourceHeadVersionId: baseVersionId,
      opaqueSourceRef: { ...authoringProjectionSource.opaqueSourceRef, versionId: baseVersionId },
    }));
    authoringPreparation = {
      ...authoringPreparation,
      state: 'pending',
      runId: null,
      forgeState: null,
      errorCode: 'authoring_preparation_provider_activation_pending',
      progress: {
        stage: 'private_preflight_pending',
        checks: { format: 'passed', dependencies: 'pending' },
        providerActivation: 'pending',
        diagnostics: [{
          code: 'authoring_preparation_artwork_missing',
          reason: 'The exact JPEG package dependency is missing.',
          missingFootage: [{ name: 'Portrait photo', file: 'media/portrait.jpg' }],
        }],
      },
    };
    editor();
    fireEvent.click(await screen.findByRole('button', { name: 'Create and artboard tools' }));
    const width = await screen.findByRole('spinbutton', { name: 'Composition width' });
    const height = screen.getByRole('spinbutton', { name: 'Composition height' });
    await waitFor(() => expect((width as HTMLInputElement).disabled).toBe(false));
    fireEvent.change(width, { target: { value: '640' } });
    fireEvent.change(height, { target: { value: '360' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply composition size' }));
    await waitFor(() => expect(compileAuthoring).toHaveBeenCalledTimes(1), { timeout: 2500 });
    fireEvent.click(await screen.findByRole('button', { name: 'Show preparation details' }));
    expect(await screen.findByText('Portrait photo: media/portrait.jpg')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Relink from Library' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick exact Library JPEG' }));
    await waitFor(() => expect(authoringDraftWrites.mock.calls.at(-1)?.[1].commands).toContainEqual({
      type: 'dependency.relink',
      footageItemId: 781,
      assetRef: {
        assetId: '10000000-0000-4000-8000-000000000103',
        versionId: '10000000-0000-4000-8000-000000000104',
        sha256: 'e'.repeat(64),
      },
    }));
    expect(screen.getByText(/queued for this private package.*verify the relink during compilation/i)).toBeTruthy();
    expect(screen.queryByText(/dependencies passed/i)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Approve for version saving' })).toBeNull();
    expect(saves).not.toHaveBeenCalled();
  });

  test('drops a held relink preview when the editor switches to a different source version', async () => {
    enablePrivateDraftTestStorage();
    const nextBrand = '00000000-0000-4000-8000-000000000010';
    const nextVersion = '00000000-0000-4000-8000-000000000009';
    const nextChecksum = 'a'.repeat(64);
    authoringProjectionSource = {
      ...authoringDocument,
      dependencies: [{
        footageItemId: 782,
        name: 'Source-switch image',
        mediaCode: 'png!',
        footageFramerate: 0,
        originalFile: 'media/source-switch.png',
        width: 320,
        height: 180,
        affectedLayers: [{ compId: 63, layerUid: 71 }],
        relinkReason: null,
      }],
    };
    const existingCommands: TemplateAuthoringCommand[] = [{
      type: 'layer.edit',
      nodeId: 'aep:63:114',
      edit: { compId: 63, layerId: 114, position: [101, 200] },
    }];
    authoringDraft = {
      ...persistedDraftForTest(1, existingCommands),
      projectedDocument: projectTemplateAuthoringCommands(authoringProjectionSource, existingCommands),
    };
    authoringDraftReads.mockImplementation(async (_assetId, brandId, baseVersionId) =>
      authoringDraft?.scope.brandId === brandId && authoringDraft.scope.baseVersionId === baseVersionId
        ? authoringDraft
        : null,
    );
    authoringDraftWrites.mockImplementation(async (assetId, request) => {
      const sourceChecksum = request.brandId === nextBrand && request.baseVersionId === nextVersion
        ? nextChecksum
        : authoringChecksum;
      authoringDraft = {
        scope: { brandId: request.brandId, assetId, baseVersionId: request.baseVersionId },
        sourceChecksum,
        requiresReconciliation: false,
        currentSource: {
          templateSourceVersionId: request.baseVersionId,
          templateSourceChecksum: sourceChecksum,
          assetHeadVersionId: request.baseVersionId,
          assetHeadChecksum: sourceChecksum,
        },
        revision: request.expectedRevision + 1,
        commands: structuredClone(request.commands),
        projectedDocument: projectTemplateAuthoringCommands(authoringProjectionSource, request.commands),
        updatedAt: '2026-10-11T00:00:00.000Z',
      };
      return authoringDraft;
    });
    authoringDocumentReads.mockImplementation(async (_assetId, brandId, baseVersionId) => {
      const sourceChecksum = brandId === nextBrand && baseVersionId === nextVersion ? nextChecksum : authoringChecksum;
      return {
        ...authoringProjectionSource,
        scope: { ...authoringScope, brandId, baseVersionId },
        sourceChecksum,
        sourceHeadVersionId: baseVersionId,
        opaqueSourceRef: { ...authoringProjectionSource.opaqueSourceRef, versionId: baseVersionId, checksum: sourceChecksum },
      };
    });
    authoringPreparation = {
      ...authoringPreparation,
      state: 'pending',
      runId: null,
      forgeState: null,
      progress: {
        stage: 'private_preflight_pending',
        checks: { format: 'passed', dependencies: 'pending' },
        providerActivation: 'pending',
        diagnostics: [{
          code: 'authoring_preparation_artwork_missing',
          reason: 'The current source has one missing image.',
          missingFootage: [{ name: 'Source-switch image', file: 'media/source-switch.png' }],
        }],
      },
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = editor(undefined, client, undefined, undefined, VERSION);
    await screen.findByRole('list', { name: 'Layers' });
    fireEvent.click(await screen.findByRole('button', { name: 'Show preparation details' }));
    await screen.findByText('Source-switch image: media/source-switch.png');
    fireEvent.click(await screen.findByRole('button', { name: 'Relink from Library' }));
    const picker = await screen.findByRole('dialog', { name: 'Add Library image' });
    let resolveOldPreview!: (value: {
      id: string; assetId: string; checksum: string; mimeType: string;
      fileName: string; width: number; height: number; signedUrl: string;
    }) => void;
    nextPinnedArtworkPreviewRequest = new Promise((resolve) => { resolveOldPreview = resolve; });
    fireEvent.click(within(picker).getByRole('button', { name: 'Pick exact Library image' }));
    expect(await screen.findByText(/Verifying the selected image version and dimensions/)).toBeTruthy();

    view.rerender(
      <QueryClientProvider client={client}>
        <TemplateLayerEditor
          brandId={nextBrand}
          assetId="a"
          versionId={nextVersion}
          name="Card B"
          parse={AUTHORING_PARSE}
          active
          onSaved={async () => {}}
          onOpenVariant={() => {}}
        />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(authoringDocumentReads).toHaveBeenCalledWith('a', nextBrand, nextVersion));
    await screen.findByRole('list', { name: 'Layers' });
    await waitFor(() => expect(authoringDraftReads).toHaveBeenCalledWith('a', nextBrand, nextVersion));
    const newSourceWrites = () => authoringDraftWrites.mock.calls
      .filter(([, request]) => request.brandId === nextBrand && request.baseVersionId === nextVersion)
      .flatMap(([, request]) => request.commands);
    resolveOldPreview({
      id: '10000000-0000-4000-8000-000000000102',
      assetId: '10000000-0000-4000-8000-000000000101',
      checksum: 'd'.repeat(64), mimeType: 'image/png', fileName: 'Pinned.png',
      width: 320, height: 180, signedUrl: '/fixture/pinned-image.png',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(newSourceWrites()).not.toContainEqual(expect.objectContaining({ type: 'dependency.relink' }));
    expect(newSourceWrites()).not.toContainEqual(expect.objectContaining({ type: 'artwork.create' }));
    expect(screen.queryByText(/queued for this private package.*verify the relink during compilation/i)).toBeNull();
    expect(screen.queryByText('Could not verify the selected Library image once.')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('automatically prepares the persisted revision and keeps version saving pending without After Effects', async () => {
    enablePrivateDraftTestStorage();
    authoringProjectionSource = {
      ...authoringDocument,
      dependencies: [{
        footageItemId: 777,
        name: 'Backdrop',
        mediaCode: 'png!',
        footageFramerate: 0,
        originalFile: 'media/backdrop.png',
        width: 320,
        height: 180,
        affectedLayers: [{ compId: 63, layerUid: 114 }],
        relinkReason: null,
      }, ...[778, 779].map((footageItemId) => ({
        footageItemId,
        name: 'Ambiguous',
        mediaCode: 'png!',
        footageFramerate: 0,
        originalFile: 'media/ambiguous.png',
        width: 320,
        height: 180,
        affectedLayers: [{ compId: 63, layerUid: 114 }],
        relinkReason: null,
      }))],
      compositions: authoringDocument.compositions.map((composition) => ({
        ...composition,
        creationReason: composition.compId === 63 ? null : composition.creationReason,
      })),
    };
    authoringDocumentReads.mockImplementation(async (_assetId, brandId, baseVersionId) => ({
      ...authoringProjectionSource,
      scope: { ...authoringScope, brandId, baseVersionId },
      sourceHeadVersionId: baseVersionId,
      opaqueSourceRef: { ...authoringProjectionSource.opaqueSourceRef, versionId: baseVersionId },
    }));
    authoringPreparation = {
      ...authoringPreparation,
      state: 'pending',
      runId: null,
      forgeState: null,
      errorCode: 'authoring_preparation_provider_activation_pending',
      progress: {
        stage: 'private_preflight_complete',
        checks: { format: 'passed', dependencies: 'passed' },
        providerActivation: 'pending',
        diagnostics: [
          {
            code: 'template_preparation_fonts_missing',
            reason: 'Add exact font files for Foundry Sans.',
            affectedFontPostScriptNames: ['FoundrySans-Regular'],
          },
          {
            code: 'authoring_preparation_artwork_missing',
            reason: 'The package still has missing footage dependencies.',
            missingFootage: [
              { name: 'Backdrop', file: 'media/backdrop.png' },
              { name: 'Ambiguous', file: 'media/ambiguous.png' },
            ],
          },
        ],
      },
    };
    const openFontRepair = mock(() => {});
    editor(undefined, undefined, undefined, undefined, VERSION, undefined, openFontRepair);
    await screen.findByRole('list', { name: 'Layers' });
    expect(screen.getByTestId('library-media-picker').getAttribute('data-open')).toBe('false');
    fireEvent.click(await screen.findByRole('button', { name: 'Create and artboard tools' }));
    const width = await screen.findByRole('spinbutton', { name: 'Composition width' });
    const height = await screen.findByRole('spinbutton', { name: 'Composition height' });
    await waitFor(() => expect((width as HTMLInputElement).disabled).toBe(false));
    fireEvent.change(width, { target: { value: '640' } });
    fireEvent.change(height, { target: { value: '360' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply composition size' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Apply composition size' }));
    await waitFor(() => expect(authoringDraftWrites).toHaveBeenCalledTimes(1));
    expect(authoringDraft?.projectedDocument?.dependencies).toEqual(authoringProjectionSource.dependencies);
    await waitFor(() => expect(compileAuthoring).toHaveBeenCalledTimes(1), { timeout: 2500 });
    expect(compileAuthoring.mock.calls[0]?.[1]).toEqual({
      brandId: BRAND,
      baseVersionId: VERSION,
      expectedRevision: 1,
    });
    await waitFor(() => expect(prepareAuthoring).toHaveBeenCalledTimes(1));
    expect(prepareAuthoring.mock.calls[0]?.[3]).toMatchObject({
      artifactId: authoringArtifact.artifactId,
      expectedDraftRevision: 1,
      sourceChecksum: authoringChecksum,
      commandDigest: authoringArtifact.commandDigest,
      packageChecksum,
    });
    // Auto-preparation may finish package checks, but rendering waits until the
    // exact revision reaches review_ready.
    expect(nativeRenders).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Show preparation details' }));
    expect(await screen.findByText(/private package preflight passed.*provider activation is pending.*After Effects verification waits for a runner/i)).toBeTruthy();
    expect(screen.getByText('Package preflight: format passed, dependencies passed · Forge provider pending')).toBeTruthy();
    expect(screen.getByText('Add exact font files for Foundry Sans.')).toBeTruthy();
    expect(screen.getByText(/Affected font faces: FoundrySans-Regular/)).toBeTruthy();
    expect(screen.getByText('Backdrop: media/backdrop.png')).toBeTruthy();
    expect(screen.getByText('Ambiguous: media/ambiguous.png')).toBeTruthy();
    expect(screen.getByText(/Multiple package dependencies match; no automatic target was chosen/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Relink from Library' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Package details and verification' }));
    expect(screen.getByText('private-template.aep')).toBeTruthy();
    expect(screen.getByTestId('preparation-next-step').textContent).toMatch(/Open Fonts check to resolve the exact listed faces/i);
    expect(screen.queryByRole('button', { name: 'Approve for version saving' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Review and publish variant' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Open Fonts check' }));
    expect(openFontRepair).toHaveBeenCalledTimes(1);
    const createTools = screen.getByRole('button', { name: 'Create and artboard tools' });
    fireEvent.click(createTools);
    expect(createTools.getAttribute('aria-expanded')).toBe('false');
    const writesBeforeCancel = authoringDraftWrites.mock.calls.length;
    const commandsBeforeCancel = structuredClone(authoringDraft?.commands ?? []);
    fireEvent.click(screen.getAllByRole('button', { name: 'Relink from Library' })[0]!);
    let picker = await screen.findByRole('dialog', { name: 'Add Library image' });
    expect(within(picker).getByText('Choose a verified Library image with the exact format and dimensions required by this package dependency.')).toBeTruthy();
    expect(createTools.getAttribute('aria-expanded')).toBe('false');
    fireEvent.keyDown(picker, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(authoringDraftWrites.mock.calls.length).toBe(writesBeforeCancel);
    expect(authoringDraft?.commands).toEqual(commandsBeforeCancel);
    fireEvent.click(screen.getByRole('button', { name: 'Add Library image' }));
    picker = await screen.findByRole('dialog', { name: 'Add Library image' });
    expect(within(picker).getByText('Choose a PNG or JPEG version already in this brand Library. The selected version stays pinned in this draft.')).toBeTruthy();
    expect(createTools.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(within(picker).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(authoringDraftWrites.mock.calls.length).toBe(writesBeforeCancel);
    expect(authoringDraft?.commands).toEqual(commandsBeforeCancel);
    fireEvent.click(createTools);
    expect(createTools.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(screen.getAllByRole('button', { name: 'Relink from Library' })[0]!);
    picker = await screen.findByRole('dialog', { name: 'Add Library image' });
    expect(within(picker).getByText('Choose a verified Library image with the exact format and dimensions required by this package dependency.')).toBeTruthy();

    let rejectPendingPreview!: (reason: Error) => void;
    nextPinnedArtworkPreviewRequest = new Promise((_resolve, reject) => { rejectPendingPreview = reject; });
    const commandsBeforeFreshCreate = structuredClone(authoringDraft?.commands ?? []);
    fireEvent.click(screen.getByRole('button', { name: 'Pick exact Library image' }));
    expect(await screen.findByText(/Verifying the selected image version and dimensions/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add Library image' }));
    picker = await screen.findByRole('dialog', { name: 'Add Library image' });
    expect(within(picker).getByText('Choose a PNG or JPEG version already in this brand Library. The selected version stays pinned in this draft.')).toBeTruthy();
    rejectPendingPreview(new Error('Could not verify a stale Library image response.'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText('Could not verify a stale Library image response.')).toBeNull();
    expect(within(picker).getByText('Choose a PNG or JPEG version already in this brand Library. The selected version stays pinned in this draft.')).toBeTruthy();
    fireEvent.click(within(picker).getByRole('button', { name: 'Cancel' }));
    expect(authoringDraft?.commands).toEqual(commandsBeforeFreshCreate);
    fireEvent.click(createTools);
    expect(createTools.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(screen.getAllByRole('button', { name: 'Relink from Library' })[0]!);
    picker = await screen.findByRole('dialog', { name: 'Add Library image' });
    expect(within(picker).getByText('Choose a verified Library image with the exact format and dimensions required by this package dependency.')).toBeTruthy();
    failNextPinnedArtworkPreview = true;
    fireEvent.click(screen.getByRole('button', { name: 'Pick exact Library image' }));
    expect(await screen.findByText('Could not verify the selected Library image once.')).toBeTruthy();
    expect(screen.queryByText(/queued for this private package.*verify the relink during compilation/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Choose image again' }));
    picker = await screen.findByRole('dialog', { name: 'Add Library image' });
    expect(within(picker).getByText('Choose a verified Library image with the exact format and dimensions required by this package dependency.')).toBeTruthy();
    let resolvePendingPreview!: (value: {
      id: string; assetId: string; checksum: string; mimeType: string;
      fileName: string; width: number; height: number; signedUrl: string;
    }) => void;
    nextPinnedArtworkPreviewRequest = new Promise((resolve) => { resolvePendingPreview = resolve; });
    // Start the confirmed repair first, then switch to Create while its exact
    // pinned preview is pending. The edit must still be recorded for target 777.
    fireEvent.click(within(picker).getByRole('button', { name: 'Pick exact Library image' }));
    expect(await screen.findByText(/Verifying the selected image version and dimensions/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add Library image' }));
    picker = await screen.findByRole('dialog', { name: 'Add Library image' });
    expect(within(picker).getByText('Choose a PNG or JPEG version already in this brand Library. The selected version stays pinned in this draft.')).toBeTruthy();
    resolvePendingPreview({
      id: '10000000-0000-4000-8000-000000000102',
      assetId: '10000000-0000-4000-8000-000000000101',
      checksum: 'd'.repeat(64), mimeType: 'image/png', fileName: 'Pinned.png',
      width: 320, height: 180, signedUrl: '/fixture/pinned-image.png',
    });
    await waitFor(() => expect(authoringDraftWrites.mock.calls.at(-1)?.[1].commands).toContainEqual({
      type: 'dependency.relink',
      footageItemId: 777,
      assetRef: {
        assetId: '10000000-0000-4000-8000-000000000101',
        versionId: '10000000-0000-4000-8000-000000000102',
        sha256: 'd'.repeat(64),
      },
    }));
    expect(authoringDraftWrites.mock.calls.at(-1)?.[1].commands).not.toContainEqual(expect.objectContaining({ type: 'artwork.create' }));
    expect(within(picker).getByText('Choose a PNG or JPEG version already in this brand Library. The selected version stays pinned in this draft.')).toBeTruthy();
    expect(screen.queryByText(/queued for this private package.*verify the relink during compilation/i)).toBeNull();
    expect(createTools.getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryByRole('button', { name: /pin .*library image/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Approve for version saving' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Review and publish variant' }).hasAttribute('disabled')).toBe(true);
    expect(saves).not.toHaveBeenCalled();
  });

  test('one version action reviews and commits only after native verification passes', async () => {
    enablePrivateDraftTestStorage();
    const passed = {
      packageIntegrity: 'passed' as const,
      writerReadback: 'passed' as const,
      sourcePreservation: 'passed' as const,
      dependencies: 'passed' as const,
      format: 'passed' as const,
      nativeAfterEffects: 'passed' as const,
      status: 'passed' as const,
    };
    authoringArtifact = { ...authoringArtifact, verification: passed };
    authoringPreparation = { ...authoringPreparation, state: 'review_ready' };
    nativeRenders.mockImplementation(async (_assetId, _artifactId, _scope, request) => ({
      renderId: '10000000-0000-4000-8000-000000000303',
      artifactId: authoringArtifact.artifactId,
      scope: authoringScope,
      userId: '10000000-0000-4000-8000-000000000302',
      draftRevision: request.expectedDraftRevision,
      sourceChecksum: request.sourceChecksum,
      commandDigest: request.commandDigest,
      packageChecksum: request.packageChecksum,
      requestDigest: 'a'.repeat(64),
      engine: 'after-effects',
      state: 'completed',
      errorCode: null,
      frames: [{
        frameId: '10000000-0000-4000-8000-000000000306',
        compId: 63,
        frameIndex: 74,
        frameTimeSeconds: 74 / 30,
        formatId: 'Middle Text line',
        mimeType: 'image/png',
        width: 400,
        height: 300,
        frameRate: { numerator: 30, denominator: 1 },
        checksum: 'b'.repeat(64),
        stale: false,
      }],
      updatedAt: '2026-10-11T00:00:00.000Z',
    }));
    const onOpenVariant = mock((_id: string) => {});
    editor(onOpenVariant);
    fireEvent.click(await screen.findByRole('button', { name: 'Create and artboard tools' }));
    const width = await screen.findByRole('spinbutton', { name: 'Composition width' });
    const height = await screen.findByRole('spinbutton', { name: 'Composition height' });
    await waitFor(() => expect((width as HTMLInputElement).disabled).toBe(false));
    fireEvent.change(width, { target: { value: '640' } });
    fireEvent.change(height, { target: { value: '360' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply composition size' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Apply composition size' }));

    await waitFor(() => expect(compileAuthoring).toHaveBeenCalledTimes(1), { timeout: 2500 });
    await waitForAuthoringReadyToPublish('Review and publish variant');
    expect(screen.queryByRole('button', { name: 'Approve for version saving' })).toBeNull();
    const publish = screen.getByRole('button', { name: 'Review and publish variant' });
    fireEvent.click(publish);
    fireEvent.click(publish);
    await waitFor(() => expect(reviewAuthoring).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(commitAuthoring).toHaveBeenCalledTimes(1));
    expect(commitAuthoring.mock.calls[0]?.[3]).toMatchObject({
      artifactId: authoringArtifact.artifactId,
      expectedDraftRevision: 1,
      sourceChecksum: authoringChecksum,
      commandDigest: authoringArtifact.commandDigest,
      packageChecksum,
      saveTo: 'new_variant',
      name: 'Card B variant',
      parentRevisionId: '10000000-0000-4000-8000-000000000204',
      expectedHeadRevisionId: '10000000-0000-4000-8000-000000000204',
    });
    await waitFor(() => expect(onOpenVariant).toHaveBeenCalledWith('10000000-0000-4000-8000-000000000304'));
    expect(saves).not.toHaveBeenCalled();
  });

  test('does not commit after the draft changes while exact-package review is in flight', async () => {
    enablePrivateDraftTestStorage();
    enableVerifiedAuthoringFixture();
    let finishReview: ((artifact: typeof authoringArtifact) => void) | undefined;
    reviewAuthoring.mockImplementation(() => new Promise((resolve) => {
      finishReview = resolve;
    }));
    const onOpenVariant = mock((_id: string) => {});
    editor(onOpenVariant);
    const position = await screen.findByLabelText('Position X');
    fireEvent.change(position, { target: { value: '140' } });
    fireEvent.blur(position);
    await waitFor(() => expect(authoringDraftWrites.mock.calls.at(-1)?.[1].commands).toContainEqual(
      expect.objectContaining({ type: 'layer.edit', edit: expect.objectContaining({ x: 140 }) }),
    ));
    await waitForAuthoringReadyToPublish('Review and publish variant');
    fireEvent.click(screen.getByRole('button', { name: 'Review and publish variant' }));
    await waitFor(() => expect(reviewAuthoring).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Position X'), { target: { value: '160' } });
    fireEvent.blur(screen.getByLabelText('Position X'));
    finishReview!({ ...authoringArtifact, state: 'reviewed', reviewedAt: '2026-10-11T00:00:00.000Z' });

    expect(await screen.findByText(/did not return a saved version/i)).toBeTruthy();
    expect(commitAuthoring).not.toHaveBeenCalled();
    expect(onOpenVariant).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Position X') as HTMLInputElement).value).toBe('160');
  });

  test('authorized font selection falls back to the readable PostScript face name', async () => {
    authoringDocumentReads.mockImplementation(async (_assetId, brandId, baseVersionId) => ({
      ...authoringDocument,
      scope: { ...authoringScope, brandId, baseVersionId },
      fontChoices: [{
        fontId: '10000000-0000-4000-8000-000000000201',
        postScriptName: 'DejaVuSerif', sha256: 'e'.repeat(64), scope: 'brand',
      }],
    }));
    editor();
    fireEvent.click(await screen.findByRole('button', { name: 'Create and artboard tools' }));
    const font = await screen.findByRole('combobox', { name: 'Authorized text font' });
    await waitFor(() => expect(font.textContent).toContain('DejaVuSerif'));
    expect(font.textContent).not.toContain('10000000-0000-4000-8000-000000000201');
  });

  test('a private seed workspace retains the existing variant lineage and revision destination', async () => {
    enablePrivateDraftTestStorage();
    inventory = fresh({ lineage: { role: 'variant', parent: { assetId: 'g', name: 'Original campaign' } } });
    authoringDraft = seededDraftForTest(2);
    editor();
    await screen.findByRole('list', { name: 'Layers' });
    await screen.findByText('Variant', { exact: true });
    expect(revisionVariants).toHaveBeenCalledWith(BRAND, 'a');
    expect(screen.getByRole('button', { name: 'Review and publish revision' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Review and publish new variant' })).toBeTruthy();
    expect(screen.queryByText('Golden source', { exact: true })).toBeNull();
    expect(inventories).not.toHaveBeenCalled();
  });

  test('seed font preview retries explicitly and stays cached across transform revisions', async () => {
    enablePrivateDraftTestStorage();
    authoringProjectionSource = packageFontAuthoringDocument;
    authoringDraft = {
      ...seededDraftForTest(2),
      projectedDocument: projectTemplateAuthoringCommands(packageFontAuthoringDocument, []),
    };
    authoringDocumentReads.mockImplementation(async (_assetId, brandId, baseVersionId) => ({
      ...packageFontAuthoringDocument,
      scope: { ...authoringScope, brandId, baseVersionId },
      sourceHeadVersionId: baseVersionId,
    }));
    authoringDraftWrites.mockImplementation(async (_assetId, request) => {
      authoringDraft = {
        ...seededDraftForTest(request.expectedRevision + 1),
        commands: structuredClone(request.commands),
        projectedDocument: projectTemplateAuthoringCommands(packageFontAuthoringDocument, request.commands),
      };
      return authoringDraft;
    });
    authoringFontPreviews.mockImplementation(async () => {
      if (authoringFontPreviews.mock.calls.length === 1) throw new Error('Temporary font transport failure');
      return { bytes: new ArrayBuffer(16), contentType: 'font/ttf', sha256: packageFontChoice.sha256 };
    });
    Object.defineProperty(globalThis, 'FontFace', {
      configurable: true,
      value: class {
        load() { return Promise.resolve(this); }
      },
    });
    Object.defineProperty(document, 'fonts', { configurable: true, value: { add: () => {} } });

    editor();
    fireEvent.click(await screen.findByRole('button', { name: 'Create and artboard tools' }));
    await screen.findByText('This font could not be verified.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('Exact font verified for preview.');
    expect(authoringFontPreviews).toHaveBeenCalledTimes(2);
    expect(authoringFontPreviews.mock.calls[1]).toEqual([
      'a', { brandId: BRAND, baseVersionId: VERSION }, packageFontChoice,
      { seedArtifactId: seedWorkspacePackage.artifactId, seedPackageChecksum: seedWorkspacePackage.packageChecksum, expectedRevision: 2 },
    ]);

    const position = await screen.findByLabelText('Position X');
    fireEvent.change(position, { target: { value: '110' } });
    fireEvent.blur(position);
    await waitFor(() => expect(authoringDraftWrites).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Position X'), { target: { value: '120' } });
    fireEvent.blur(screen.getByLabelText('Position X'));
    await waitFor(() => expect(authoringDraftWrites).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(authoringDraft?.seed?.artifactId).toBe(seedWorkspacePackage.artifactId);
    expect(authoringFontPreviews).toHaveBeenCalledTimes(2);
  });

  test('creates text with the exact workspace-package font ref and reuses its stable choice key', async () => {
    enablePrivateDraftTestStorage();
    authoringProjectionSource = packageFontAuthoringDocument;
    authoringDraft = {
      ...seededDraftForTest(2),
      projectedDocument: projectTemplateAuthoringCommands(packageFontAuthoringDocument, []),
    };
    authoringDocumentReads.mockImplementation(async (_assetId, brandId, baseVersionId) => ({
      ...packageFontAuthoringDocument,
      scope: { ...authoringScope, brandId, baseVersionId },
      sourceHeadVersionId: baseVersionId,
    }));
    Object.defineProperty(globalThis, 'FontFace', {
      configurable: true,
      value: class {
        load() { return Promise.resolve(this); }
      },
    });
    Object.defineProperty(document, 'fonts', { configurable: true, value: { add: () => {} } });

    editor();
    fireEvent.click(await screen.findByRole('button', { name: 'Create and artboard tools' }));
    const font = await screen.findByRole('combobox', { name: 'Authorized text font' });
    await waitFor(() => expect(font.textContent).toContain('DejaVuSans'));
    await waitFor(() => expect(authoringFontPreviews).toHaveBeenCalledWith(
      'a', { brandId: BRAND, baseVersionId: VERSION }, packageFontChoice,
      { seedArtifactId: seedWorkspacePackage.artifactId, seedPackageChecksum: seedWorkspacePackage.packageChecksum, expectedRevision: 2 },
    ));
    fireEvent.change(screen.getByRole('textbox', { name: 'New text layer content' }), { target: { value: 'Package font headline' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Add text layer' }));

    await waitFor(() => expect(authoringDraftWrites).toHaveBeenCalled());
    const command = authoringDraftWrites.mock.calls.at(-1)?.[1].commands.at(-1);
    expect(command).toMatchObject({
      type: 'text.create',
      fontRef: {
        kind: 'workspace_package',
        packageChecksum: seedWorkspacePackage.packageChecksum,
        postScriptName: 'DejaVuSans',
        sha256: packageFontChoice.sha256,
      },
    });
    expect((command as { fontRef?: object } | undefined)?.fontRef).not.toHaveProperty('fontId');
  });

  test('groups eligible same-composition layers, animates the three proven group channels, then locks static edits', async () => {
    const memberIds = new Set(['aep:63:114', 'aep:63:71']);
    authoringDocumentReads.mockImplementation(async (_assetId, brandId, baseVersionId) => ({
      ...authoringDocument,
      scope: { ...authoringScope, brandId, baseVersionId },
      nodes: authoringDocument.nodes.map((node) => memberIds.has(node.nodeId)
        ? { ...node, capabilities: { ...node.capabilities, grouping: true }, groupingReason: null }
        : node),
    }));
    editor();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Include MENOS DE 2.5 in group' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include Red Box in group' }));
    fireEvent.click(screen.getByRole('button', { name: 'Group' }));
    await waitFor(() => expect(authoringDraftWrites).toHaveBeenCalled());
    expect(authoringDraftWrites.mock.calls.at(-1)?.[1].commands).toContainEqual(expect.objectContaining({
      type: 'layer.group',
      compId: 63,
      memberNodeIds: ['aep:63:114', 'aep:63:71'],
    }));
    const rotation = await screen.findByRole('textbox', { name: 'Group rotation' });
    expect((rotation as HTMLInputElement).disabled).toBe(false);
    fireEvent.change(rotation, { target: { value: '12.5' } });
    await waitFor(() => expect(authoringDraftWrites.mock.calls.at(-1)?.[1].commands).toContainEqual({
      type: 'layer.group.transform',
      nodeId: expect.any(String),
      transform: { rotation: 12.5 },
    }));
    const scaleX = screen.getByRole('textbox', { name: 'Group scale X' });
    expect((scaleX as HTMLInputElement).disabled).toBe(false);
    fireEvent.change(scaleX, { target: { value: '125' } });
    await waitFor(() => expect(authoringDraftWrites.mock.calls.at(-1)?.[1].commands.at(-1)).toMatchObject({
      type: 'layer.group.transform',
      transform: { scale: [125, 100] },
    }));
    expect((screen.getByRole('spinbutton', { name: 'Layer in time' }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/Group timing stays locked because its parent layer does not trim child layers/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Edit keyframes/ }));
    const motionChannels = await screen.findByRole('list', { name: 'Motion channels' });
    expect(screen.queryByRole('button', { name: /Opacity/ })).toBeNull();
    fireEvent.click(within(motionChannels).getByRole('button', { name: /^Rotation / }));
    fireEvent.click(screen.getByRole('button', { name: 'Add at playhead' }));
    await waitFor(() => expect(authoringDraftWrites.mock.calls.at(-1)?.[1].commands.at(-1)).toMatchObject({
      type: 'layer.keyframes.replace',
      nodeId: expect.any(String),
      channel: 'rotation',
    }));
    expect((screen.getByRole('textbox', { name: 'Group rotation' }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Ungroup' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Static group edits and ungroup are locked while unsupported or nested motion must stay intact/i)).toBeTruthy();
  });

  test('locks static transform and ungroup once a generated group contains keyframes', async () => {
    const memberIds = new Set(['aep:63:114', 'aep:63:71']);
    authoringDocumentReads.mockImplementation(async (_assetId, brandId, baseVersionId) => ({
      ...authoringDocument,
      scope: { ...authoringScope, brandId, baseVersionId },
      sourceHeadVersionId: baseVersionId,
      nodes: authoringDocument.nodes.map((node) => memberIds.has(node.nodeId)
        ? { ...node, capabilities: { ...node.capabilities, grouping: true }, groupingReason: null }
        : node),
    }));
    authoringDraftWrites.mockImplementation(async (_assetId, request) => {
      const projected = projectTemplateAuthoringCommands(authoringProjectionSource, request.commands);
      const animatedProjection = {
        ...projected,
        nodes: projected.nodes.map((node) => node.kind !== 'group' ? node : {
          ...node,
          keyframeChannels: node.keyframeChannels.map((channel) => channel.channel !== 'rotation' ? channel : {
            ...channel,
            keyframes: [{
              keyframeId: 'draft:00000000-0000-4000-8000-000000000001',
              timeSec: 0,
              value: 12.5,
              inInterpolation: 'LINEAR' as const,
              outInterpolation: 'LINEAR' as const,
            }],
          }),
        }),
      };
      authoringDraft = {
        scope: { ...authoringScope, baseVersionId: request.baseVersionId },
        sourceChecksum: authoringChecksum,
        requiresReconciliation: false,
        currentSource: {
          templateSourceVersionId: request.baseVersionId,
          templateSourceChecksum: authoringChecksum,
          assetHeadVersionId: request.baseVersionId,
          assetHeadChecksum: authoringChecksum,
        },
        revision: request.expectedRevision + 1,
        commands: structuredClone(request.commands) as TemplateAuthoringCommand[],
        projectedDocument: animatedProjection,
        updatedAt: '2026-10-11T00:00:00.000Z',
      };
      return authoringDraft;
    });
    enablePrivateDraftTestStorage();
    editor();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Include MENOS DE 2.5 in group' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include Red Box in group' }));
    fireEvent.click(screen.getByRole('button', { name: 'Group' }));

    const rotation = await screen.findByRole('textbox', { name: 'Group rotation' });
    await waitFor(() => expect((rotation as HTMLInputElement).disabled).toBe(true));
    expect((screen.getByRole('button', { name: 'Ungroup' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(rotation, { target: { value: '20' } });
    await waitFor(() => expect(authoringDraftWrites.mock.calls.at(-1)?.[1].commands).not.toContainEqual(expect.objectContaining({
      type: 'layer.group.transform',
      transform: { rotation: 20 },
    })));
    expect(screen.getByText(/Static group edits and ungroup are locked while unsupported or nested motion must stay intact/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Move selected group' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Resize selected layer from nw' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rotate selected layer' })).toBeNull();
    fireEvent.keyDown(screen.getByRole('application', { name: 'Interactive template preview' }), { key: 'ArrowRight' });
    await waitFor(() => expect(authoringDraftWrites.mock.calls.at(-1)?.[1].commands).not.toContainEqual(expect.objectContaining({
      type: 'layer.group.transform',
      transform: { position: expect.any(Array) },
    })));
  });

  test('edits and ungroups a committed source group from exact version context without recreating it', async () => {
    const groupId = 'draft:20000000-0000-4000-8000-000000000081';
    const firstId = 'draft:20000000-0000-4000-8000-000000000082';
    const secondId = 'draft:20000000-0000-4000-8000-000000000083';
    const base = structuredClone(authoringDocument);
    const group = {
      ...base.nodes[0]!, nodeId: groupId, sourceRef: { compId: 63, layerId: 50 },
      sourceCompositionId: 63, parentNodeId: null, name: 'Committed group', textContent: null,
      fontRef: null, fillColor: null, kind: 'group' as const, shape: null, size: null, pathPosition: null,
      fill: null, stroke: null, font: null, fontSize: null, position: [40, 50] as [number, number],
      rotation: 0, scale: [100, 100] as [number, number], opacity: 100,
      keyframeChannels: [
        { channelId: `${groupId}:ADBE Position`, channel: 'position' as const, matchName: 'ADBE Position', frameRate: 30, dimensions: 3, separated: false, baseValue: [40, 50, 0] as [number, number, number], reason: null, keyframes: [] },
        { channelId: `${groupId}:ADBE Scale`, channel: 'scale' as const, matchName: 'ADBE Scale', frameRate: 30, dimensions: 3, separated: false, baseValue: [100, 100, 100] as [number, number, number], reason: null, keyframes: [] },
        { channelId: `${groupId}:ADBE Rotate Z`, channel: 'rotation' as const, matchName: 'ADBE Rotate Z', frameRate: 30, dimensions: 1, separated: false, baseValue: 0, reason: null, keyframes: [] },
      ],
    };
    const members = [
      { ...base.nodes.find((node) => node.sourceRef?.layerId === 114)!, nodeId: firstId, parentNodeId: groupId },
      { ...base.nodes.find((node) => node.sourceRef?.layerId === 71)!, nodeId: secondId, parentNodeId: groupId },
    ];
    const sourceDoc: TemplateAuthoringDocument = {
      ...base,
      sourceAuthoringContext: {
        artifactId: '10000000-0000-4000-8000-000000000084',
        versionId: authoringScope.baseVersionId,
        packageChecksum: authoringChecksum,
        identityMap: [{ nodeId: groupId, compId: 63, persistedUid: 50, sourceUid: 500, members: [
          { nodeId: firstId, persistedUid: 114, parentUid: 50 },
          { nodeId: secondId, persistedUid: 71, parentUid: 50 },
        ] }],
        freshArtboardReceipts: [],
      },
      compositions: base.compositions.map((composition) => composition.compId === 63
        ? { ...composition, nodeIds: [groupId, firstId, secondId] } : composition),
      nodes: [...base.nodes.filter((node) => node.sourceRef?.compId !== 63), group, ...members],
    };
    authoringProjectionSource = sourceDoc;
    authoringDocumentReads.mockImplementation(async (_assetId, brandId, baseVersionId) => ({
      ...sourceDoc,
      scope: { ...authoringScope, brandId, baseVersionId },
      sourceHeadVersionId: baseVersionId,
      sourceAuthoringContext: { ...sourceDoc.sourceAuthoringContext!, versionId: baseVersionId },
      opaqueSourceRef: { ...sourceDoc.opaqueSourceRef, versionId: baseVersionId },
    }));
    editor();
    const rows = await screen.findByRole('list', { name: 'Layers' });
    fireEvent.click(within(rows).getAllByText('Committed group')[0]!);
    const rotation = await screen.findByRole('textbox', { name: 'Group rotation' });
    expect((rotation as HTMLInputElement).disabled).toBe(false);
    fireEvent.change(rotation, { target: { value: '12' } });
    await waitFor(() => expect(authoringDraftWrites.mock.calls.at(-1)?.[1].commands).toContainEqual({
      type: 'layer.group.transform', nodeId: groupId, transform: { rotation: 12 },
    }));
    expect(authoringDraftWrites.mock.calls.at(-1)?.[1].commands.some((command) => command.type === 'layer.group')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Ungroup' }));
    await waitFor(() => expect(authoringDraftWrites.mock.calls.at(-1)?.[1].commands.at(-1)).toEqual({ type: 'layer.ungroup', nodeId: groupId }));
    const reopened = authoringDraft!.projectedDocument!;
    expect(reopened.nodes.some((node) => node.nodeId === groupId)).toBe(false);
    expect(reopened.nodes.find((node) => node.nodeId === firstId)).toMatchObject({
      parentNodeId: null, sourceRef: { compId: 63, layerId: 114 },
    });
    expect(reopened.nodes.find((node) => node.nodeId === secondId)).toMatchObject({
      parentNodeId: null, sourceRef: { compId: 63, layerId: 71 },
    });
  });

  test('enables only receipt-backed constant-translation ungroup for animated direct children', async () => {
    const groupId = 'draft:20000000-0000-4000-8000-000000000121';
    const firstId = 'draft:20000000-0000-4000-8000-000000000122';
    const secondId = 'draft:20000000-0000-4000-8000-000000000123';
    const base = structuredClone(authoringDocument);
    const group = {
      ...base.nodes[0]!, nodeId: groupId, sourceRef: { compId: 63, layerId: 50 }, sourceCompositionId: 63,
      parentNodeId: null, name: 'Translated animated group', kind: 'group' as const, textContent: null,
      fontRef: null, fillColor: null, shape: null, size: null, pathPosition: null, fill: null, stroke: null,
      font: null, fontSize: null, position: [40, 50] as [number, number], rotation: 0,
      scale: [100, 100] as [number, number], opacity: 0,
      ungroupTranslationReason: null,
      transformLocks: { position: 'authoring_animated_group_static_transform_locked',
        rotation: 'authoring_animated_group_static_transform_locked', scale: 'authoring_animated_group_static_transform_locked' },
      positionSource: { kind: 'explicit' as const, value: [40, 50, 0] as [number, number, number], reason: null },
      keyframeChannels: [
        { channelId: `${groupId}:ADBE Position`, channel: 'position' as const, matchName: 'ADBE Position', frameRate: 30, dimensions: 3, separated: false, baseValue: [40, 50, 0] as [number, number, number], reason: null, propertyReason: null, keyframes: [] },
        { channelId: `${groupId}:ADBE Scale`, channel: 'scale' as const, matchName: 'ADBE Scale', frameRate: 30, dimensions: 3, separated: false, baseValue: [100, 100, 100] as [number, number, number], reason: null, propertyReason: null, keyframes: [] },
        { channelId: `${groupId}:ADBE Rotate Z`, channel: 'rotation' as const, matchName: 'ADBE Rotate Z', frameRate: 30, dimensions: 1, separated: false, baseValue: 0, reason: null, propertyReason: null, keyframes: [] },
      ],
    };
    const members = [
      { ...base.nodes.find((node) => node.sourceRef?.layerId === 114)!, nodeId: firstId, parentNodeId: groupId,
        ungroupTranslationReason: null,
        position: [10, 20] as [number, number],
        positionSource: { kind: 'keyframed' as const, value: null, reason: null },
        keyframeChannels: [{ channelId: `${firstId}:ADBE Position`, channel: 'position' as const,
          matchName: 'ADBE Position', frameRate: 30, dimensions: 3, separated: false,
          baseValue: null, propertyBaseValue: null, reason: null, propertyReason: null, keyframes: [{
            keyframeId: 'source-position-key', timeSec: 0.5, nativeTimeSec: 0.5, value: [15, 25, 3],
            inInterpolation: 'BEZIER' as const, outInterpolation: 'BEZIER' as const,
            inEase: [{ speed: 1, influence: 30 }], outEase: [{ speed: 2, influence: 40 }], nativeFrame: 15,
          }] }],
      },
      { ...base.nodes.find((node) => node.sourceRef?.layerId === 71)!, nodeId: secondId, parentNodeId: groupId,
        ungroupTranslationReason: null,
        position: [30, 40] as [number, number],
        positionSource: { kind: 'explicit' as const, value: [30, 40, 0] as [number, number, number], reason: null },
        keyframeChannels: [] },
    ];
    const sourceDoc: TemplateAuthoringDocument = {
      ...base,
      sourceAuthoringContext: {
        artifactId: '10000000-0000-4000-8000-000000000124', versionId: authoringScope.baseVersionId,
        packageChecksum: authoringChecksum,
        identityMap: [{ nodeId: groupId, compId: 63, persistedUid: 50, sourceUid: 500, members: [
          { nodeId: firstId, persistedUid: 114, parentUid: 50 }, { nodeId: secondId, persistedUid: 71, parentUid: 50 },
        ] }], freshArtboardReceipts: [],
      },
      compositions: base.compositions.map((composition) => composition.compId === 63
        ? { ...composition, nodeIds: [groupId, firstId, secondId] } : composition),
      nodes: [...base.nodes.filter((node) => node.sourceRef?.compId !== 63), group, ...members],
    };
    authoringProjectionSource = sourceDoc;
    authoringDocumentReads.mockImplementation(async (_assetId, brandId, baseVersionId) => ({
      ...sourceDoc, scope: { ...authoringScope, brandId, baseVersionId }, sourceHeadVersionId: baseVersionId,
      sourceAuthoringContext: { ...sourceDoc.sourceAuthoringContext!, versionId: baseVersionId },
      opaqueSourceRef: { ...sourceDoc.opaqueSourceRef, versionId: baseVersionId },
    }));
    editor();
    const rows = await screen.findByRole('list', { name: 'Layers' });
    fireEvent.click(within(rows).getAllByText('Translated animated group')[0]!);
    expect((await screen.findByRole('textbox', { name: 'Group rotation' }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('textbox', { name: 'Group scale X' }) as HTMLInputElement).disabled).toBe(true);
    const ungroup = await screen.findByRole('button', { name: 'Ungroup' }) as HTMLButtonElement;
    expect(ungroup.disabled).toBe(false);
    fireEvent.click(ungroup);
    await waitFor(() => expect(authoringDraftWrites.mock.calls.at(-1)?.[1].commands.at(-1))
      .toEqual({ type: 'layer.ungroup', nodeId: groupId }));
    const reopened = authoringDraft!.projectedDocument!;
    expect(reopened.nodes.some((node) => node.nodeId === groupId)).toBe(false);
    expect(reopened.nodes.find((node) => node.nodeId === firstId)).toMatchObject({
      parentNodeId: null, position: [50, 70], positionSource: { kind: 'keyframed', value: null },
      keyframeChannels: [{ baseValue: null, keyframes: [{ keyframeId: 'source-position-key', value: [55, 75, 3],
        inInterpolation: 'BEZIER', outInterpolation: 'BEZIER', nativeFrame: 15 }] }],
    });
  });

  test('keeps a root static committed group locked when any transform channel has an unknown lock', async () => {
    enablePrivateDraftTestStorage();
    const groupId = 'draft:20000000-0000-4000-8000-000000000111';
    const firstId = 'draft:20000000-0000-4000-8000-000000000112';
    const secondId = 'draft:20000000-0000-4000-8000-000000000113';
    const base = structuredClone(authoringDocument);
    const group = {
      ...base.nodes[0]!, nodeId: groupId, sourceRef: { compId: 63, layerId: 50 }, sourceCompositionId: 63,
      sourceNodeId: null, parentNodeId: null, name: 'Locked root group', textContent: null, fontRef: null,
      fillColor: null, kind: 'group' as const, shape: null, size: null, pathPosition: null, fill: null, stroke: null,
      font: null, fontSize: null, position: [40, 50] as [number, number], rotation: 0,
      scale: [100, 100] as [number, number], opacity: 100,
      transformLocks: { position: 'unknown_native_position_lock' },
      capabilities: { ...base.nodes[0]!.capabilities, transform: true },
      keyframeChannels: [
        { channelId: `${groupId}:ADBE Position`, channel: 'position' as const, matchName: 'ADBE Position', frameRate: 30, dimensions: 3, separated: false, baseValue: [40, 50, 0] as [number, number, number], reason: null, keyframes: [] },
        { channelId: `${groupId}:ADBE Scale`, channel: 'scale' as const, matchName: 'ADBE Scale', frameRate: 30, dimensions: 3, separated: false, baseValue: [100, 100, 100] as [number, number, number], reason: null, keyframes: [] },
        { channelId: `${groupId}:ADBE Rotate Z`, channel: 'rotation' as const, matchName: 'ADBE Rotate Z', frameRate: 30, dimensions: 1, separated: false, baseValue: 0, reason: null, keyframes: [] },
      ],
    };
    const members = [
      { ...base.nodes.find((node) => node.sourceRef?.layerId === 114)!, nodeId: firstId, parentNodeId: groupId },
      { ...base.nodes.find((node) => node.sourceRef?.layerId === 71)!, nodeId: secondId, parentNodeId: groupId },
    ];
    const sourceDoc: TemplateAuthoringDocument = {
      ...base,
      sourceAuthoringContext: {
        artifactId: '10000000-0000-4000-8000-000000000114', versionId: authoringScope.baseVersionId,
        packageChecksum: authoringChecksum,
        identityMap: [{ nodeId: groupId, compId: 63, persistedUid: 50, sourceUid: 500, members: [
          { nodeId: firstId, persistedUid: 114, parentUid: 50 }, { nodeId: secondId, persistedUid: 71, parentUid: 50 },
        ] }], freshArtboardReceipts: [],
      },
      compositions: base.compositions.map((composition) => composition.compId === 63
        ? { ...composition, nodeIds: [groupId, firstId, secondId] } : composition),
      nodes: [...base.nodes.filter((node) => node.sourceRef?.compId !== 63), group, ...members],
    };
    authoringProjectionSource = sourceDoc;
    authoringDocumentReads.mockImplementation(async (_assetId, brandId, baseVersionId) => ({
      ...sourceDoc, scope: { ...authoringScope, brandId, baseVersionId }, sourceHeadVersionId: baseVersionId,
      sourceAuthoringContext: { ...sourceDoc.sourceAuthoringContext!, versionId: baseVersionId },
      opaqueSourceRef: { ...sourceDoc.opaqueSourceRef, versionId: baseVersionId },
    }));
    editor();
    const rows = await screen.findByRole('list', { name: 'Layers' });
    fireEvent.click(within(rows).getAllByText('Locked root group')[0]!);
    expect((await screen.findByRole('textbox', { name: 'X position' }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('textbox', { name: 'Y position' }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('textbox', { name: 'Group rotation' }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('textbox', { name: 'Group scale X' }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('textbox', { name: 'Group scale Y' }) as HTMLInputElement).disabled).toBe(true);
    expect((await screen.findByRole('button', { name: 'Ungroup' }) as HTMLButtonElement).disabled).toBe(true);
  });

  test('keeps a receipt-verified nested source group static controls and ungroup locked', async () => {
    const groupId = 'draft:20000000-0000-4000-8000-000000000105';
    const parentId = 'draft:20000000-0000-4000-8000-000000000106';
    const firstId = 'draft:20000000-0000-4000-8000-000000000107';
    const secondId = 'draft:20000000-0000-4000-8000-000000000108';
    const extraId = 'draft:20000000-0000-4000-8000-000000000109';
    const base = structuredClone(authoringDocument);
    const group = {
      ...base.nodes[0]!, nodeId: groupId, sourceRef: { compId: 63, layerId: 50 }, sourceCompositionId: 63,
      sourceNodeId: null, parentNodeId: parentId, name: 'Nested group', textContent: null, fontRef: null, fillColor: null,
      kind: 'group' as const, shape: null, size: null, pathPosition: null, fill: null, stroke: null, font: null,
      fontSize: null, position: [40, 50] as [number, number], rotation: 0, scale: [100, 100] as [number, number], opacity: 100,
      capabilities: { ...base.nodes[0]!.capabilities, transform: true },
      keyframeChannels: [
        { channelId: `${groupId}:ADBE Position`, channel: 'position' as const, matchName: 'ADBE Position', frameRate: 30, dimensions: 3, separated: false, baseValue: [40, 50, 0] as [number, number, number], reason: null, keyframes: [] },
        { channelId: `${groupId}:ADBE Scale`, channel: 'scale' as const, matchName: 'ADBE Scale', frameRate: 30, dimensions: 3, separated: false, baseValue: [100, 100, 100] as [number, number, number], reason: null, keyframes: [] },
        { channelId: `${groupId}:ADBE Rotate Z`, channel: 'rotation' as const, matchName: 'ADBE Rotate Z', frameRate: 30, dimensions: 1, separated: false, baseValue: 0, reason: null, keyframes: [] },
      ],
    };
    const members = [
      { ...base.nodes.find((node) => node.sourceRef?.layerId === 114)!, nodeId: firstId, parentNodeId: groupId },
      { ...base.nodes.find((node) => node.sourceRef?.layerId === 71)!, nodeId: secondId, parentNodeId: groupId },
    ];
    const extra = { ...members[1]!, nodeId: extraId, sourceRef: { compId: 63, layerId: 72 }, parentNodeId: parentId };
    const parent = { ...group, nodeId: parentId, sourceRef: { compId: 63, layerId: 60 }, parentNodeId: null, name: 'Outer group' };
    const sourceDoc: TemplateAuthoringDocument = {
      ...base,
      sourceAuthoringContext: {
        artifactId: '10000000-0000-4000-8000-000000000110', versionId: authoringScope.baseVersionId,
        packageChecksum: authoringChecksum,
        identityMap: [
          { nodeId: groupId, compId: 63, persistedUid: 50, sourceUid: 500, members: [
            { nodeId: firstId, persistedUid: 114, parentUid: 50 }, { nodeId: secondId, persistedUid: 71, parentUid: 50 },
          ] },
          { nodeId: parentId, compId: 63, persistedUid: 60, sourceUid: 600, members: [
            { nodeId: groupId, persistedUid: 50, parentUid: 60 }, { nodeId: extraId, persistedUid: 72, parentUid: 60 },
          ] },
        ],
        freshArtboardReceipts: [{ compId: 63, sourceCompId: null, name: 'Fresh board', width: 640, height: 480, frameRate: 30, durationSec: 5, layerUidMap: [] }],
      },
      compositions: base.compositions.map((composition) => composition.compId === 63
        ? { ...composition, nodeIds: [parentId, groupId, firstId, secondId, extraId] } : composition),
      nodes: [...base.nodes.filter((node) => node.sourceRef?.compId !== 63), parent, group, ...members, extra],
    };
    authoringProjectionSource = sourceDoc;
    authoringDocumentReads.mockImplementation(async (_assetId, brandId, baseVersionId) => ({
      ...sourceDoc, scope: { ...authoringScope, brandId, baseVersionId }, sourceHeadVersionId: baseVersionId,
      sourceAuthoringContext: { ...sourceDoc.sourceAuthoringContext!, versionId: baseVersionId },
      opaqueSourceRef: { ...sourceDoc.opaqueSourceRef, versionId: baseVersionId },
    }));
    editor();
    const rows = await screen.findByRole('list', { name: 'Layers' });
    fireEvent.click(within(rows).getAllByText('Nested group')[0]!);
    expect(screen.queryByRole('textbox', { name: 'Group rotation' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Ungroup' }) as HTMLButtonElement).disabled).toBe(true);
  });

  test('keeps verified animated source-group transform channels editable while locking static handles and ungroup', async () => {
    const groupId = 'draft:20000000-0000-4000-8000-000000000085';
    const firstId = 'draft:20000000-0000-4000-8000-000000000086';
    const secondId = 'draft:20000000-0000-4000-8000-000000000087';
    const base = structuredClone(authoringDocument);
    const group = {
      ...base.nodes[0]!, nodeId: groupId, sourceRef: { compId: 63, layerId: 50 }, sourceCompositionId: 63,
      parentNodeId: null, name: 'Animated committed group', textContent: null, fontRef: null, fillColor: null,
      kind: 'group' as const, shape: null, size: null, pathPosition: null, fill: null, stroke: null,
      font: null, fontSize: null, position: [40, 50] as [number, number], rotation: 0,
      scale: [100, 100] as [number, number], opacity: 100,
      capabilities: { ...base.nodes[0]!.capabilities, transform: true, keyframes: true },
      keyframeChannels: [
        { channelId: `${groupId}:ADBE Position`, channel: 'position' as const, matchName: 'ADBE Position', frameRate: 30, dimensions: 3, separated: false, baseValue: [40, 50, 0] as [number, number, number], reason: null, keyframes: [
          { keyframeId: 'draft:20000000-0000-4000-8000-000000000088', timeSec: 0.5, value: [55, 65, 0], inInterpolation: 'LINEAR' as const, outInterpolation: 'LINEAR' as const, inEase: [], outEase: [] },
        ] },
        { channelId: `${groupId}:ADBE Scale`, channel: 'scale' as const, matchName: 'ADBE Scale', frameRate: 30, dimensions: 3, separated: false, baseValue: [100, 100, 100] as [number, number, number], reason: null, keyframes: [] },
        { channelId: `${groupId}:ADBE Rotate Z`, channel: 'rotation' as const, matchName: 'ADBE Rotate Z', frameRate: 30, dimensions: 1, separated: false, baseValue: 0, reason: null, keyframes: [] },
      ],
    };
    const members = [
      { ...base.nodes.find((node) => node.sourceRef?.layerId === 114)!, nodeId: firstId, parentNodeId: groupId },
      { ...base.nodes.find((node) => node.sourceRef?.layerId === 71)!, nodeId: secondId, parentNodeId: groupId },
    ];
    const sourceDoc: TemplateAuthoringDocument = {
      ...base,
      sourceAuthoringContext: {
        artifactId: '10000000-0000-4000-8000-000000000089', versionId: authoringScope.baseVersionId,
        packageChecksum: authoringChecksum,
        identityMap: [{ nodeId: groupId, compId: 63, persistedUid: 50, sourceUid: 500, members: [
          { nodeId: firstId, persistedUid: 114, parentUid: 50 }, { nodeId: secondId, persistedUid: 71, parentUid: 50 },
        ] }], freshArtboardReceipts: [],
      },
      compositions: base.compositions.map((composition) => composition.compId === 63
        ? { ...composition, nodeIds: [groupId, firstId, secondId] } : composition),
      nodes: [...base.nodes.filter((node) => node.sourceRef?.compId !== 63), group, ...members],
    };
    authoringProjectionSource = sourceDoc;
    authoringDocumentReads.mockImplementation(async (_assetId, brandId, baseVersionId) => ({
      ...sourceDoc, scope: { ...authoringScope, brandId, baseVersionId }, sourceHeadVersionId: baseVersionId,
      sourceAuthoringContext: { ...sourceDoc.sourceAuthoringContext!, versionId: baseVersionId },
      opaqueSourceRef: { ...sourceDoc.opaqueSourceRef, versionId: baseVersionId },
    }));
    editor();
    const rows = await screen.findByRole('list', { name: 'Layers' });
    fireEvent.click(within(rows).getAllByText('Animated committed group')[0]!);
    expect((await screen.findByRole('textbox', { name: 'Group rotation' }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('textbox', { name: 'X position' }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Ungroup' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Edit keyframes/ }));
    expect((await screen.findByRole('button', { name: 'Add at playhead' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Add at playhead' }));
    await waitFor(() => expect(authoringDraftWrites.mock.calls.at(-1)?.[1].commands).toContainEqual(
      expect.objectContaining({ type: 'layer.keyframes.replace', nodeId: groupId, channel: 'position' }),
    ));
    expect(authoringDraftWrites.mock.calls.at(-1)?.[1].commands.some((command) => command.type === 'layer.group')).toBe(false);
  });

  test('Library artwork is pinned, privately saved, and excluded from version saves', async () => {
    authoringDocumentReads.mockImplementation(async (_assetId, brandId, baseVersionId) => ({
      ...authoringDocument,
      scope: { ...authoringScope, brandId, baseVersionId },
      compositions: authoringDocument.compositions.map((composition) => ({
        ...composition,
        creationReason: composition.compId === 63 ? null : composition.creationReason,
      })),
    }));
    editor();
    await screen.findByRole('list', { name: 'Layers' });
    expect(screen.getByTestId('library-media-picker').getAttribute('data-open')).toBe('false');
    fireEvent.click(await screen.findByRole('button', { name: 'Create and artboard tools' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Choose from Library' }));
    const picker = await screen.findByRole('dialog', { name: 'Add Library image' });
    expect(within(picker).getByText('Choose a PNG or JPEG version already in this brand Library. The selected version stays pinned in this draft.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pick exact Library image' }));
    await waitFor(() => expect(authoringDraft?.commands).toHaveLength(1));
    expect(authoringDraft?.commands[0]).toMatchObject({
      type: 'artwork.create',
      assetRef: {
        assetId: '10000000-0000-4000-8000-000000000101',
        versionId: '10000000-0000-4000-8000-000000000102',
        sha256: 'd'.repeat(64),
      },
      size: [320, 180],
    });
    expect(screen.getByRole('button', { name: 'Review and publish variant' }).hasAttribute('disabled')).toBe(true);
    expect(saves).not.toHaveBeenCalled();
  });

  test('undo and redo restore layer edits and report dirty state to the guard', async () => {
    let draft: LayerDraftState | null = null;
    editor(undefined, undefined, (next) => {
      draft = next;
    });
    fireEvent.change(await screen.findByLabelText('Position X'), { target: { value: '140' } });
    await waitFor(() => expect(draft?.dirty).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Undo layer change' }));
    await waitFor(() => expect(draft?.dirty).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Redo layer change' }));
    await waitFor(() => expect(draft?.dirty).toBe(true));
    expect((screen.getByLabelText('Position X') as HTMLInputElement).value).toBe('140');
    const nativeInput = screen.getByLabelText('Variant name');
    const nativeUndo = fireEvent.keyDown(nativeInput, { key: 'z', ctrlKey: true });
    expect(nativeUndo).toBe(true);
    expect(draft?.dirty).toBe(true);
  });

  test('separate transform edits and a re-order each have their own undo step', async () => {
    editor();
    const list = await screen.findByRole('list', { name: 'Layers' });
    const rotation = await screen.findByLabelText('Rotation');
    fireEvent.change(rotation, { target: { value: '20' } });
    fireEvent.blur(rotation);
    fireEvent.change(screen.getByLabelText('Rotation'), { target: { value: '10' } });
    fireEvent.blur(screen.getByLabelText('Rotation'));
    fireEvent.click(within(list).getByRole('button', { name: 'Send MENOS DE 2.5 backward' }));
    await waitFor(() =>
      expect(within(list).getAllByRole('listitem')[0]?.textContent).toContain('Red Box'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo layer change' }));
    expect(within(list).getAllByRole('listitem')[0]?.textContent).toContain('MENOS');
    fireEvent.click(screen.getByRole('button', { name: 'Undo layer change' }));
    expect((screen.getByLabelText('Rotation') as HTMLInputElement).value).toBe('20');
    fireEvent.click(screen.getByRole('button', { name: 'Redo layer change' }));
    expect((screen.getByLabelText('Rotation') as HTMLInputElement).value).toBe('10');
  });

  test('an external version refresh pins a dirty draft until undo or discard', async () => {
    let draft: LayerDraftState | null = null;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = editor(undefined, client, (next) => {
      draft = next;
    });
    fireEvent.change(await screen.findByLabelText('Position X'), { target: { value: '140' } });
    await waitFor(() => expect(draft?.dirty).toBe(true));
    const latestVersion = '00000000-0000-4000-8000-000000000009';
    view.rerender(
      <QueryClientProvider client={client}>
        <TemplateLayerEditor
          brandId={BRAND}
          assetId="a"
          versionId={latestVersion}
          name="Card B"
          active
          onSaved={async () => {}}
          onDraftChange={(next) => {
            draft = next;
          }}
        />
      </QueryClientProvider>,
    );
    expect(
      await screen.findByText(/source version changed while this draft was open/i),
    ).toBeTruthy();
    expect((screen.getByLabelText('Position X') as HTMLInputElement).value).toBe('140');
    expect(inventories.mock.calls.some(([, , version]) => version === latestVersion)).toBe(false);
    expect(draft?.saveLabel).toBe('Save private draft');
    fireEvent.click(screen.getByRole('button', { name: 'Undo layer change' }));
    await waitFor(() => expect(draft?.dirty).toBe(false));
    await waitFor(() =>
      expect(inventories.mock.calls.some(([, , version]) => version === latestVersion)).toBe(true),
    );
  });

  test('several numeric scrub updates commit as one undo step', async () => {
    let draft: LayerDraftState | null = null;
    editor(undefined, undefined, (next) => {
      draft = next;
    });
    const x = await screen.findByLabelText('Position X');
    fireEvent.change(x, { target: { value: '110' } });
    fireEvent.change(x, { target: { value: '120' } });
    fireEvent.blur(x);
    await waitFor(() => expect(draft?.dirty).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Undo layer change' }));
    await waitFor(() => expect(draft?.dirty).toBe(false));
  });

  test('multi-sample canvas drag coalesces into one editor history step', async () => {
    const { container } = editor();
    const canvas = await screen.findByRole('application', { name: 'Interactive template preview' });
    const svg = container.querySelector('svg');
    Object.assign(canvas, { setPointerCapture: mock(() => {}), hasPointerCapture: () => false });
    Object.defineProperty(svg, 'getScreenCTM', {
      value: () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1 }) }),
    });
    const target = container.querySelector('[data-layer-id="114"] text')!;
    fireEvent.pointerDown(target, { button: 0, pointerId: 3, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(canvas, { pointerId: 3, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(canvas, { pointerId: 3, clientX: 30, clientY: 40 });
    fireEvent.pointerMove(canvas, { pointerId: 3, clientX: 40, clientY: 50 });
    fireEvent.pointerUp(canvas, { pointerId: 3 });
    fireEvent.click(screen.getByRole('button', { name: 'Undo layer change' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Undo layer change' }).hasAttribute('disabled'),
      ).toBe(true),
    );
    expect((screen.getByLabelText('Position X') as HTMLInputElement).value).toBe('100');
  });

  test('exposure changes undo and redo with the rest of the layer draft', async () => {
    enablePrivateDraftTestStorage();
    fieldReads.mockImplementation(async () => ({
      variables: [
        {
          key: 'headline',
          label: 'Headline',
          kind: 'text',
          required: false,
          multiple: false,
          accept: [],
          options: [],
          description: null,
          reserved: false,
          role: null,
          roleSource: null,
          charBudget: null,
          comps: [],
          sample: null,
          placement: null,
          exposed: true,
          clip: null,
        },
      ],
      edits: [],
      parseState: 'parsed',
    }));
    let draft: LayerDraftState | null = null;
    const { container } = editor(undefined, undefined, (next) => {
      draft = next;
    });
    fireEvent.click(await screen.findByText('Fields each render row asks for'));
    await waitFor(() =>
      expect(container.querySelector('label[for="expose-headline"]')).toBeTruthy(),
    );
    fireEvent.click(container.querySelector('label[for="expose-headline"]')!);
    await waitFor(() => expect(draft?.dirty).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Undo layer change' }));
    await waitFor(() => expect(draft?.dirty).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Redo layer change' }));
    await waitFor(() => expect(draft?.dirty).toBe(true));
    await waitFor(() => expect(authoringDraftWrites.mock.calls.at(-1)?.[1].commands).toContainEqual({
      type: 'exposure.set', slotKey: 'headline', exposed: false,
    }));
    await waitFor(() => expect(compileAuthoring).toHaveBeenCalled());
    await waitFor(() => expect(prepareAuthoring).toHaveBeenCalled());
    expect(authoringDraftWrites.mock.calls.at(-1)?.[1].commands).toContainEqual({
      type: 'exposure.set', slotKey: 'headline', exposed: false,
    });
    expect(nativeRenders).not.toHaveBeenCalled();
    expect(saves).not.toHaveBeenCalled();
  });

  test('guard save writes a private draft and never creates a variant or version', async () => {
    const onOpenVariant = mock((_id: string) => {});
    const onSaved = mock(async () => {});
    let draft: LayerDraftState | null = null;
    editor(
      onOpenVariant,
      undefined,
      (next) => {
        draft = next;
      },
      onSaved,
    );
    fireEvent.change(await screen.findByLabelText('Position X'), { target: { value: '140' } });
    await waitFor(() => expect(draft?.dirty).toBe(true));
    expect(draft?.saveLabel).toBe('Save private draft');
    expect(await draft!.save()).toBe(true);
    expect(authoringDraftWrites).toHaveBeenCalledTimes(1);
    expect(authoringDraftWrites.mock.calls[0]?.[1]).toMatchObject({
      expectedRevision: 0,
      brandId: BRAND,
      baseVersionId: VERSION,
    });
    expect(saves).not.toHaveBeenCalled();
    expect(onOpenVariant).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    await waitFor(() => expect(draft?.dirty).toBe(false));
    await waitFor(() => expect(authoringDraft?.revision).toBe(1));
    expect(authoringDraft?.projectedDocument.nodes.find((node) => node.nodeId === 'aep:63:114')?.position).toEqual([140, 200]);
    expect(screen.queryByText(/newer server draft exists/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /use server draft/i })).toBeNull();
  });

  test('a server draft is restored on reload without making a variant', async () => {
    authoringDraft = persistedDraftForTest(3, [
      {
        type: 'layer.edit',
        nodeId: 'aep:63:114',
        edit: { compId: 63, layerId: 114, x: 141.25, y: 202.5 },
      },
    ]);
    editor();
    const x = await screen.findByLabelText('Position X');
    await waitFor(() => expect((x as HTMLInputElement).value).toBe('141.25'));
    expect((screen.getByLabelText('Position Y') as HTMLInputElement).value).toBe('202.5');
    expect(authoringDraft?.projectedDocument?.nodes.find((node) => node.nodeId === 'aep:63:114')?.position).toEqual([141.25, 202.5]);
    expect(screen.queryByText(/a newer server draft exists/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /use server draft/i })).toBeNull();
    expect(authoringDraftWrites).not.toHaveBeenCalled();
    expect(saves).not.toHaveBeenCalled();
  });

  test('a pending source readback keeps an already-read private draft visible', async () => {
    authoringDraft = persistedDraftForTest(3, [
      {
        type: 'layer.edit',
        nodeId: 'aep:63:114',
        edit: { compId: 63, layerId: 114, rotation: 17.25 },
      },
    ]);
    authoringDocumentReads.mockImplementation(async () => {
      throw new Error('Source readback is still pending.');
    });
    editor();
    const rotation = await screen.findByLabelText('Rotation');
    await waitFor(() => expect((rotation as HTMLInputElement).value).toBe('17.25'));
    expect(await screen.findAllByText(/Draft loaded; source preview is unavailable/)).not.toHaveLength(0);
    expect(saves).not.toHaveBeenCalled();
  });

  test('a draft whose pinned source drifted stays visible and blocks authoring', async () => {
    authoringDraft = {
      ...persistedDraftForTest(3, [
        {
          type: 'layer.edit',
          nodeId: 'aep:63:114',
          edit: { compId: 63, layerId: 114, rotation: 12.5 },
        },
      ]),
      requiresReconciliation: true,
      currentSource: {
        templateSourceVersionId: nextRevision.versionId,
        templateSourceChecksum: nextRevision.checksum,
        assetHeadVersionId: nextRevision.versionId,
        assetHeadChecksum: nextRevision.checksum,
      },
    };
    let draft: LayerDraftState | null = null;
    editor(undefined, undefined, (next) => {
      draft = next;
    });
    await waitFor(() => expect(authoringDraftReads).toHaveBeenCalled());
    expect(await screen.findByText(/pinned source changed\. Current source:/i)).toBeTruthy();
    expect(((await screen.findByLabelText('Rotation')) as HTMLInputElement).disabled).toBe(true);
    expect(draft?.status).toBe('source-mismatch');
    expect(authoringDraftWrites).not.toHaveBeenCalled();
    expect(saves).not.toHaveBeenCalled();
  });

  test('a delayed save preserves edits made while the write is in flight', async () => {
    inventory = fresh({ lineage: { role: 'variant', parent: { assetId: 'g', name: 'Card B' } } });
    let resolveWrite: ((value: TemplateAuthoringDraft) => void) | undefined;
    authoringDraftWrites.mockImplementation(async (_assetId, request) => {
      if (authoringDraftWrites.mock.calls.length === 1) {
        return new Promise((resolve) => {
          resolveWrite = resolve;
        });
      }
      return persistedDraftForTest(request.expectedRevision + 1, request.commands);
    });
    let draft: LayerDraftState | null = null;
    editor(undefined, undefined, (next) => {
      draft = next;
    });
    fireEvent.change(await screen.findByLabelText('Rotation'), { target: { value: '20' } });
    fireEvent.blur(screen.getByLabelText('Rotation'));
    await waitFor(() => expect(draft?.dirty).toBe(true));
    const savePromise = draft!.save();
    await waitFor(() => expect(authoringDraftWrites).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Rotation'), { target: { value: '10' } });
    fireEvent.blur(screen.getByLabelText('Rotation'));
    resolveWrite!({ ...persistedDraftForTest(1, authoringDraftWrites.mock.calls[0]![1].commands) });
    expect(await savePromise).toBe(true);
    await waitFor(() => expect(authoringDraftWrites).toHaveBeenCalledTimes(2));
    expect(authoringDraftWrites.mock.calls[1]?.[1].expectedRevision).toBe(1);
    await waitFor(() => expect(draft?.dirty).toBe(false));
    expect(saves).not.toHaveBeenCalled();
  });

  test('saving with newer edits keeps them pinned to the version they were authored against', async () => {
    enablePrivateDraftTestStorage();
    enableVerifiedAuthoringFixture();
    inventory = fresh({ lineage: { role: 'variant', parent: { assetId: 'g', name: 'Card B' } } });
    let resolveWrite: ((value: typeof authoringArtifact) => void) | undefined;
    commitAuthoring.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveWrite = resolve;
        }),
    );
    let draft: LayerDraftState | null = null;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let view: ReturnType<typeof render>;
    const refreshVersion: () => Promise<void> = async () => {
      inventory = fresh({
        lineage: { role: 'variant', parent: { assetId: 'g', name: 'Card B' } },
        layers: LAYERS.map((entry) => (entry.layerId === 114 ? { ...entry, rotation: 20 } : entry)),
      });
      view.rerender(
        <QueryClientProvider client={client}>
          <TemplateLayerEditor
            brandId={BRAND}
            assetId="a"
            versionId={nextRevision.versionId}
            name="Card B"
            active
            onSaved={refreshVersion}
            onDraftChange={(next) => {
              draft = next;
            }}
          />
        </QueryClientProvider>,
      );
    };
    view = editor(
      undefined,
      client,
      (next) => {
        draft = next;
      },
      refreshVersion,
    );
    fireEvent.change(await screen.findByLabelText('Rotation'), { target: { value: '20' } });
    fireEvent.blur(screen.getByLabelText('Rotation'));
    await waitFor(() => expect(draft?.dirty).toBe(true));
    await waitForAuthoringReadyToPublish('Review and publish revision');
    fireEvent.click(screen.getByRole('button', { name: 'Review and publish revision' }));
    await waitFor(() => expect(commitAuthoring).toHaveBeenCalledTimes(1));
    expect(commitAuthoring.mock.calls[0]?.[2].baseVersionId).toBe(VERSION);
    fireEvent.change(screen.getByLabelText('Rotation'), { target: { value: '25' } });
    fireEvent.blur(screen.getByLabelText('Rotation'));
    resolveWrite!({ ...authoringArtifact, state: 'committed', commit: {
      assetId: '10000000-0000-4000-8000-000000000304', versionId: nextRevision.versionId, packageChecksum,
    } });
    expect(inventories.mock.calls.some(([, , version]) => version === nextRevision.versionId)).toBe(
      false,
    );
    expect(await screen.findByText(/The reviewed version was saved\. Your newer edits stay in this private draft\./i)).toBeTruthy();
    expect((screen.getByLabelText('Rotation') as HTMLInputElement).value).toBe('25');
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Undo layer change' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo layer change' }));
    expect(((await screen.findByLabelText('Rotation')) as HTMLInputElement).value).toBe('20');
  });

  test('a clean save adopts the new file baseline for typing and Reset', async () => {
    enablePrivateDraftTestStorage();
    enableVerifiedAuthoringFixture();
    inventory = fresh({ lineage: { role: 'variant', parent: { assetId: 'g', name: 'Card B' } } });
    let draft: LayerDraftState | null = null;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let view: ReturnType<typeof render>;
    const refreshVersion: () => Promise<void> = async () => {
      inventory = fresh({
        lineage: { role: 'variant', parent: { assetId: 'g', name: 'Card B' } },
        layers: LAYERS.map((entry) =>
          entry.layerId === 114 ? { ...entry, x: 140, y: 200 } : entry,
        ),
      });
      authoringDocumentReads.mockImplementation(async (_assetId, brandId, baseVersionId) => ({
        ...authoringDocument,
        nodes: authoringDocument.nodes.map((node) =>
          node.sourceRef?.layerId === 114 ? { ...node, position: [140, 200] as [number, number] } : node,
        ),
        scope: { ...authoringScope, brandId, baseVersionId },
        sourceHeadVersionId: baseVersionId,
        opaqueSourceRef: { ...authoringDocument.opaqueSourceRef, versionId: baseVersionId },
      }));
      view.rerender(
        <QueryClientProvider client={client}>
          <TemplateLayerEditor
            brandId={BRAND}
            assetId="a"
            versionId={nextRevision.versionId}
            name="Card B"
            active
            onSaved={refreshVersion}
            onDraftChange={(next) => {
              draft = next;
            }}
          />
        </QueryClientProvider>,
      );
    };
    view = editor(
      undefined,
      client,
      (next) => {
        draft = next;
      },
      refreshVersion,
    );
    fireEvent.change(await screen.findByLabelText('Position X'), { target: { value: '140' } });
    fireEvent.blur(screen.getByLabelText('Position X'));
    await waitFor(() => expect(draft?.dirty).toBe(true));
    await waitForAuthoringReadyToPublish('Review and publish revision');
    fireEvent.click(screen.getByRole('button', { name: 'Review and publish revision' }));
    await waitFor(() => expect(commitAuthoring).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        inventories.mock.calls.some(([, , version]) => version === nextRevision.versionId),
      ).toBe(true),
    );
    await waitFor(() => expect(draft?.dirty).toBe(false));
    const x = await screen.findByLabelText('Position X');
    expect((x as HTMLInputElement).value).toBe('140');
    fireEvent.change(x, { target: { value: '140' } });
    fireEvent.blur(x);
    expect(draft?.dirty).toBe(false);
    fireEvent.change(x, { target: { value: '160' } });
    await waitFor(() => expect(draft?.dirty).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(draft?.dirty).toBe(false));
  });

  test('regular save rechecks dirty state after refresh before opening the new variant', async () => {
    enablePrivateDraftTestStorage();
    enableVerifiedAuthoringFixture();
    const onOpenVariant = mock((_id: string) => {});
    let finishRefresh: (() => void) | undefined;
    const onSaved = mock(
      () =>
        new Promise<void>((resolve) => {
          finishRefresh = resolve;
        }),
    );
    let draft: LayerDraftState | null = null;
    editor(
      onOpenVariant,
      undefined,
      (next) => {
        draft = next;
      },
      onSaved,
    );
    fireEvent.change(await screen.findByLabelText('Position X'), { target: { value: '140' } });
    await waitFor(() => expect(authoringDraftWrites.mock.calls.at(-1)?.[1].commands).toContainEqual(
      expect.objectContaining({ type: 'layer.edit', edit: expect.objectContaining({ x: 140 }) }),
    ));
    await waitForAuthoringReadyToPublish('Review and publish variant');
    fireEvent.click(screen.getByRole('button', { name: 'Review and publish variant' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Rotation'), { target: { value: '10' } });
    fireEvent.blur(screen.getByLabelText('Rotation'));
    finishRefresh!();
    await waitFor(() =>
      expect(
        screen.getByText('The reviewed version was saved. Your newer edits stay in this private draft.'),
      ).toBeTruthy(),
    );
    expect(onOpenVariant).not.toHaveBeenCalled();
    expect(draft?.dirty).toBe(true);
  });

  test('a failed private draft write stays recoverable and Retry preserves its command', async () => {
    let draft: LayerDraftState | null = null;
    authoringDraftWrites.mockImplementation(async () => {
      throw new Error('Write unavailable');
    });
    editor(undefined, undefined, (next) => {
      draft = next;
    });
    fireEvent.change(await screen.findByLabelText('Position X'), { target: { value: '140' } });
    await waitFor(() => expect(draft?.dirty).toBe(true));
    expect(await draft!.save()).toBe(false);
    expect(saves).not.toHaveBeenCalled();
    expect(draft?.dirty).toBe(true);
    await screen.findByText('Write unavailable');
    authoringDraftWrites.mockImplementation(async (_assetId, request) => ({
      scope: { ...authoringScope, baseVersionId: request.baseVersionId },
      sourceChecksum: authoringChecksum,
      revision: request.expectedRevision + 1,
      commands: structuredClone(request.commands),
      updatedAt: '2026-10-11T00:00:00.000Z',
    }));
    expect(await draft!.retry?.()).toBe(true);
    await waitFor(() => expect(draft?.dirty).toBe(false));
  });

  test('a golden source only forks: Save as variant sends the move and a name', async () => {
    enablePrivateDraftTestStorage();
    enableVerifiedAuthoringFixture();
    const onOpenVariant = mock((_id: string) => {});
    editor(onOpenVariant);
    await screen.findByText('Golden source');
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    const x = await screen.findByLabelText('Position X');
    fireEvent.change(x, { target: { value: '140' } });
    fireEvent.blur(x);
    await waitForAuthoringReadyToPublish('Review and publish variant');
    fireEvent.click(screen.getByRole('button', { name: 'Review and publish variant' }));
    await waitFor(() => expect(commitAuthoring).toHaveBeenCalledTimes(1));
    expect(commitAuthoring.mock.calls[0]?.[3]).toMatchObject({ saveTo: 'new_variant', name: 'Card B variant' });
    expect(authoringDraftWrites.mock.calls.at(-1)?.[1].commands).toContainEqual({
      type: 'layer.edit', nodeId: 'aep:63:114', edit: { compId: 63, layerId: 114, x: 140 },
    });
    await waitFor(() =>
      expect(onOpenVariant).toHaveBeenCalledWith('10000000-0000-4000-8000-000000000304'),
    );
    expect(saves).not.toHaveBeenCalled();
  });

  test('on a variant, Save writes this variant without a name', async () => {
    enablePrivateDraftTestStorage();
    enableVerifiedAuthoringFixture();
    inventory = fresh({ lineage: { role: 'variant', parent: { assetId: 'g', name: 'Card B' } } });
    editor();
    await screen.findByText('Save writes this variant’s next revision.');
    const rotation = await screen.findByLabelText('Rotation');
    fireEvent.change(rotation, { target: { value: '15' } });
    fireEvent.blur(rotation);
    await waitForAuthoringReadyToPublish('Review and publish revision');
    fireEvent.click(screen.getByRole('button', { name: 'Review and publish revision' }));
    await waitFor(() => expect(commitAuthoring).toHaveBeenCalledTimes(1));
    expect(commitAuthoring.mock.calls[0]?.[3]).toMatchObject({ saveTo: 'this_variant' });
    expect(commitAuthoring.mock.calls[0]?.[3]).not.toHaveProperty('name');
    expect(authoringDraftWrites.mock.calls.at(-1)?.[1].commands).toContainEqual({
      type: 'layer.edit', nodeId: 'aep:63:114', edit: { compId: 63, layerId: 114, rotation: 15 },
    });
    expect(saves).not.toHaveBeenCalled();
  });

  test('re-stacking a comp updates the visible stack and saves its front-first order', async () => {
    enablePrivateDraftTestStorage();
    editor();
    const list = await screen.findByRole('list', { name: 'Layers' });
    fireEvent.click(within(list).getByRole('button', { name: 'Send MENOS DE 2.5 backward' }));
    const visibleStack = [...list.querySelectorAll('li')].map((item) => item.textContent ?? '');
    expect(visibleStack.map((label) => ['Red Box', 'MENOS DE 2.5', 'White Box'].find((name) => label.includes(name))))
      .toEqual(['Red Box', 'MENOS DE 2.5', 'White Box']);
    await waitFor(() => expect(compileAuthoring).toHaveBeenCalled());
    await waitFor(() => expect(prepareAuthoring).toHaveBeenCalled());
    expect(authoringDraftWrites.mock.calls.at(-1)?.[1].commands).toContainEqual({
      type: 'composition.order', compId: 63, nodeIds: ['aep:63:71', 'aep:63:114', 'aep:63:70'],
    });
    expect(nativeRenders).not.toHaveBeenCalled();
    expect(saves).not.toHaveBeenCalled();
  });

  test('a locked property is shown but cannot be written', async () => {
    editor();
    const list = await screen.findByRole('list', { name: 'Layers' });
    fireEvent.click(within(list).getByRole('button', { name: 'White Box' }));
    expect((await screen.findByLabelText('Position X')).hasAttribute('disabled')).toBe(true);
    expect(
      screen.getByText('Position is set by an expression and must be edited in its source.'),
    ).toBeTruthy();
    expect((screen.getByLabelText('Rotation') as HTMLInputElement).disabled).toBe(false);
  });

  test('a comp found by layer position cannot be re-stacked, and says why', async () => {
    inventory = fresh({ compId: 412 });
    editor();
    const list = await screen.findByRole('list', { name: 'Layers' });
    expect(within(list).getAllByRole('listitem').length).toBe(1);
    expect(within(list).queryByRole('button', { name: /Drag|forward|backward/ })).toBeNull();
    expect(screen.getByText(/order is fixed/)).toBeTruthy();
  });

  test('an edit shows in the preview at once, before the forge composes it', async () => {
    const { container } = editor();
    const x = await screen.findByLabelText('Position X');
    await waitFor(() => expect(container.querySelector('[data-layer-id="114"]')).toBeTruthy());
    fireEvent.change(x, { target: { value: '140' } });
    fireEvent.blur(x);
    await waitFor(() =>
      expect(container.querySelector('[data-layer-id="114"]')?.getAttribute('transform')).toContain(
        'translate(140 200)',
      ),
    );
    expect(previews).not.toHaveBeenCalled();
  });

  test('searching another composition selects the same layer in the inspector and preview', async () => {
    inventory = fresh();
    editor();
    await screen.findByRole('list', { name: 'Layers' });
    fireEvent.change(screen.getByLabelText('Search layers'), { target: { value: 'Card' } });
    fireEvent.click(
      within(screen.getByRole('list', { name: 'Layers' })).getByRole('button', { name: /^Card/ }),
    );
    await waitFor(() => expect(scenes.mock.calls.at(-1)?.[3]).toBe(412));
    expect(screen.getByText('Selected: Card')).toBeTruthy();
    expect(
      within(screen.getByRole('combobox', { name: 'Composition' })).getByText('Card B'),
    ).toBeTruthy();
  });

  test('a failed composition is a local estimate with a retry, not a successful preview', async () => {
    previews.mockImplementation(async () => {
      throw new Error('Composition unavailable');
    });
    editor();
    fireEvent.change(await screen.findByLabelText('Position X'), { target: { value: '140' } });
    await waitFor(
      () => expect(screen.getByText('Local estimate · composition unavailable')).toBeTruthy(),
      { timeout: 3000 },
    );
    expect(screen.queryByText('Composed preview')).toBeNull();
    expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toContain('Composition unavailable');
    expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toContain('Private recovery storage is unavailable in this browser.');
    fireEvent.change(screen.getByLabelText('Position X'), { target: { value: '160' } });
    expect(screen.getByText('Local estimate · updating')).toBeTruthy();
    expect(screen.queryAllByRole('alert').some((alert) => alert.textContent === 'Composition unavailable')).toBe(false);
    await waitFor(
      () => expect(screen.getByText('Local estimate · composition unavailable')).toBeTruthy(),
      { timeout: 3000 },
    );
    previews.mockImplementation(compose);
    fireEvent.click(screen.getByRole('button', { name: 'Retry preview' }));
    await screen.findByText('Composed preview');
  });

  test('a failed refresh keeps the fidelity of an already composed current preview', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    editor(undefined, client);
    fireEvent.change(await screen.findByLabelText('Position X'), { target: { value: '140' } });
    await screen.findByText('Composed preview', {}, { timeout: 3000 });
    previews.mockImplementation(async () => {
      throw new Error('Refresh unavailable');
    });
    await client.refetchQueries({ queryKey: ['forge-layer-preview'], type: 'active' });
    await screen.findByText('Composed preview · refresh unavailable');
    expect(screen.queryByText('Local estimate · composition unavailable')).toBeNull();
    expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toContain('Refresh unavailable');
  });

  test('opening the author tab uses the pinned revision registry without duplicating beta variant selectors', async () => {
    editor();
    await screen.findByRole('list', { name: 'Layers' });
    expect(inventories).toHaveBeenCalledTimes(1);
    expect(scenes).toHaveBeenCalledTimes(1);
    expect(fieldReads).not.toHaveBeenCalled();
    await waitFor(() => expect(revisionVariants).toHaveBeenCalledWith(BRAND, 'a'));
    fireEvent.click(screen.getByRole('button', { name: /Fields each render row asks for/ }));
    await waitFor(() => expect(fieldReads).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: /Variants of this template/ })).toBeNull();
  });

  test('the shell stands in until the layer list lands, and the scene can arrive first', async () => {
    let land: (value: TemplateLayerInventoryResponse) => void = () => {};
    readInventory = () => new Promise((resolve) => (land = resolve));
    const { container } = editor();
    expect(await screen.findByRole('status', { name: 'Reading template layers…' })).toBeTruthy();
    await waitFor(() => expect(container.querySelector('[data-layer-id="114"]')).toBeTruthy());
    expect(
      (screen.getByRole('button', { name: 'Review and publish variant' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    land(inventory);
    expect(await screen.findByRole('list', { name: 'Layers' })).toBeTruthy();
  });
});
