import { beforeEach, describe, expect, it } from 'bun:test';
import type { Position } from '@xyflow/react';
import type { CampaignCanvasEdge } from '../types';

import {
  type AdData,
  AUDIENCE_HANDLE_ID,
  type CampaignCanvasNode,
  type CreativeAssetType,
  type CreativeData,
} from '../types';
import { graphFingerprint, useCampaignStore } from './useCampaignStore';

const resetStore = (nodes: CampaignCanvasNode[] = [], edges: CampaignCanvasEdge[] = []) =>
  useCampaignStore.setState({
    nodes,
    edges,
    history: [],
    redoStack: [],
    edgeStyle: 'curved',
    hydration: null,
    openAiHydration: null,
    isDirty: false,
  });

function createAdNode(id: string, adFormat: AdData['adFormat']): CampaignCanvasNode {
  return {
    id,
    type: 'ad',
    position: { x: 0, y: 0 },
    data: {
      label: 'Ad',
      adFormat,
      primaryText: 'Body',
      headline: 'Headline',
      callToAction: 'SHOP_NOW',
      validationStatus: 'valid',
    },
  };
}

function createAudienceNode(id: string): CampaignCanvasNode {
  return {
    id,
    type: 'audience',
    position: { x: -400, y: 0 },
    data: { label: 'Audience', mode: 'broad', locations: ['MX'], validationStatus: 'valid' },
  };
}

function createCreativeNode(id: string, assetType: CreativeAssetType): CampaignCanvasNode {
  return {
    id,
    type: 'creative',
    position: { x: 0, y: 300 },
    data: { label: 'Creative', assetType, validationStatus: 'valid' },
  };
}

function createCampaignNode(id: string): CampaignCanvasNode {
  return {
    id,
    type: 'campaign',
    position: { x: 0, y: -300 },
    data: {
      label: 'Campaign',
      objective: 'OUTCOME_SALES',
      buyingType: 'AUCTION',
      specialAdCategories: [],
      validationStatus: 'valid',
    },
  };
}

function createAdSetNode(id: string, position: Position): CampaignCanvasNode {
  return {
    id,
    type: 'ad-set',
    position,
    data: {
      label: 'Primary Ad Set',
      optimizationGoal: 'CONVERSIONS',
      billingEvent: 'IMPRESSIONS',
      validationStatus: 'valid',
    },
  };
}

describe('useCampaignStore.onConnect', () => {
  beforeEach(() => {
    useCampaignStore.setState({
      nodes: [],
      edges: [],
      history: [],
      redoStack: [],
      edgeStyle: 'curved',
      hydration: null,
    });
  });

  it('connects a campaign to a new ad set', () => {
    useCampaignStore.setState({
      nodes: [
        {
          id: 'campaign-1',
          type: 'campaign',
          position: { x: 0, y: 0 },
          data: {
            label: 'Campaign',
            objective: 'OUTCOME_SALES',
            buyingType: 'AUCTION',
            specialAdCategories: [],
            validationStatus: 'valid',
          },
        },
        {
          id: 'adset-1',
          type: 'ad-set',
          position: { x: 0, y: 200 },
          data: {
            label: 'Ad set',
            optimizationGoal: 'CONVERSIONS',
            billingEvent: 'IMPRESSIONS',
            validationStatus: 'valid',
          },
        },
      ],
    });

    useCampaignStore.getState().onConnect({
      source: 'campaign-1',
      target: 'adset-1',
      sourceHandle: null,
      targetHandle: null,
    });

    const state = useCampaignStore.getState();
    expect(state.edges).toHaveLength(1);
    expect(state.edges[0]?.source).toBe('campaign-1');
    expect(state.edges[0]?.target).toBe('adset-1');
    expect(
      state.connectionBlockReason({
        source: 'campaign-1',
        target: 'adset-1',
        sourceHandle: null,
        targetHandle: null,
      }),
    ).toBeNull();
  });

  it('refuses campaign → ad (skips the ad set)', () => {
    useCampaignStore.setState({
      nodes: [
        {
          id: 'campaign-1',
          type: 'campaign',
          position: { x: 0, y: 0 },
          data: {
            label: 'Campaign',
            objective: 'OUTCOME_SALES',
            buyingType: 'AUCTION',
            specialAdCategories: [],
            validationStatus: 'valid',
          },
        },
        {
          id: 'ad-1',
          type: 'ad',
          position: { x: 0, y: 200 },
          data: {
            label: 'Ad',
            adFormat: 'IMAGE',
            primaryText: 'Primary',
            headline: 'Headline',
            callToAction: 'SHOP_NOW',
            validationStatus: 'valid',
          },
        },
      ],
    });

    const reason = useCampaignStore.getState().connectionBlockReason({
      source: 'campaign-1',
      target: 'ad-1',
      sourceHandle: null,
      targetHandle: null,
    });
    expect(reason).toMatch(/cannot connect/);

    useCampaignStore.getState().onConnect({
      source: 'campaign-1',
      target: 'ad-1',
      sourceHandle: null,
      targetHandle: null,
    });
    expect(useCampaignStore.getState().edges).toHaveLength(0);
  });
});

describe('useCampaignStore.addConnectedNode', () => {
  beforeEach(() => {
    useCampaignStore.setState({
      nodes: [],
      edges: [],
      history: [],
      redoStack: [],
      edgeStyle: 'curved',
    });
  });

  it('attaches an audience to the LEFT of the ad set, feeding it through the side handle', () => {
    useCampaignStore.setState({
      nodes: [createAdSetNode('adset-1', { x: 120, y: 200 })],
    });

    useCampaignStore.getState().addConnectedNode('adset-1', 'audience');
    const state = useCampaignStore.getState();
    const audienceNode = state.nodes.find((node) => node.type === 'audience');

    expect(audienceNode).toBeTruthy();
    expect(audienceNode?.position).toEqual({ x: -320, y: 200 });
    expect(state.edges).toHaveLength(1);
    expect(state.edges[0]).toMatchObject({
      source: audienceNode?.id,
      target: 'adset-1',
      targetHandle: AUDIENCE_HANDLE_ID,
    });
  });

  it('does not add a second audience to an ad set that already has one', () => {
    useCampaignStore.setState({
      nodes: [createAdSetNode('adset-1', { x: 120, y: 200 })],
    });

    const store = useCampaignStore.getState();
    store.addConnectedNode('adset-1', 'audience');
    store.addConnectedNode('adset-1', 'audience');

    const state = useCampaignStore.getState();
    expect(state.nodes.filter((node) => node.type === 'audience')).toHaveLength(1);
    expect(state.edges).toHaveLength(1);
  });

  it('stacks non-audience children below the parent', () => {
    useCampaignStore.setState({
      nodes: [createAdSetNode('adset-1', { x: 120, y: 200 })],
    });

    useCampaignStore.getState().addConnectedNode('adset-1', 'ad');
    const state = useCampaignStore.getState();
    const adNode = state.nodes.find((node) => node.type === 'ad');

    expect(adNode).toBeTruthy();
    expect(adNode?.position).toEqual({ x: 120, y: 500 });
  });

  it('offsets sibling children horizontally while keeping top-down flow', () => {
    useCampaignStore.setState({
      nodes: [createAdSetNode('adset-1', { x: 120, y: 200 })],
    });

    const store = useCampaignStore.getState();
    store.addConnectedNode('adset-1', 'ad');
    store.addConnectedNode('adset-1', 'ad');

    const state = useCampaignStore.getState();
    const positions = state.nodes.filter((node) => node.id !== 'adset-1').map((node) => node.position);

    expect(positions).toContainEqual({ x: 120, y: 500 });
    expect(positions).toContainEqual({ x: -60, y: 500 });
  });

  it('starts a creative under a video ad as a video, so the edge it needs is accepted', () => {
    useCampaignStore.setState({ nodes: [createAdNode('ad-1', 'VIDEO')] });

    useCampaignStore.getState().addConnectedNode('ad-1', 'creative');
    const state = useCampaignStore.getState();
    const creative = state.nodes.find((node) => node.type === 'creative');

    expect((creative?.data as CreativeData | undefined)?.assetType).toBe('video');
    expect(state.edges).toHaveLength(1);
  });

  it('validates structure against graph rules and canonical payload schema', () => {
    useCampaignStore.setState({
      nodes: [
        {
          id: 'campaign-1',
          type: 'campaign',
          position: { x: 100, y: 100 },
          data: {
            label: 'Campaign 1',
            objective: 'OUTCOME_SALES',
            buyingType: 'AUCTION',
            specialAdCategories: [],
            validationStatus: 'valid',
          },
        },
      ],
      edges: [],
    });

    const result = useCampaignStore.getState().validateGraph();

    expect(result.payloadValid).toBe(true);
    expect(result.invalidNodeCount).toBe(0);
    expect(result.payloadError).toBeUndefined();
  });
});

describe('connection rules: an audience feeds an ad set from the side', () => {
  beforeEach(() => {
    resetStore([
      createCampaignNode('campaign-1'),
      createAdSetNode('adset-1', { x: 0, y: 0 }),
      createAdSetNode('adset-2', { x: 500, y: 0 }),
      createAudienceNode('audience-1'),
      createAudienceNode('audience-2'),
    ]);
  });

  const reasonFor = (source: string, target: string, targetHandle: string | null) =>
    useCampaignStore
      .getState()
      .connectionBlockReason({ source, target, sourceHandle: null, targetHandle });

  it('accepts audience -> ad set only on the ad set\'s audience handle', () => {
    expect(reasonFor('audience-1', 'adset-1', AUDIENCE_HANDLE_ID)).toBeNull();
    expect(reasonFor('audience-1', 'adset-1', null)).toMatch(/from the side/);
  });

  it('refuses anything else on the audience handle', () => {
    expect(reasonFor('campaign-1', 'adset-1', AUDIENCE_HANDLE_ID)).toMatch(/side handle/);
    expect(reasonFor('campaign-1', 'adset-1', null)).toBeNull();
  });

  it('refuses the old ad set -> audience direction', () => {
    expect(reasonFor('adset-1', 'audience-1', null)).toMatch(/cannot connect/);
  });

  it('refuses a second audience on one ad set, but lets one audience feed many', () => {
    useCampaignStore.getState().onConnect({
      source: 'audience-1',
      target: 'adset-1',
      sourceHandle: null,
      targetHandle: AUDIENCE_HANDLE_ID,
    });

    expect(reasonFor('audience-2', 'adset-1', AUDIENCE_HANDLE_ID)).toMatch(/one audience/);
    expect(reasonFor('audience-1', 'adset-2', AUDIENCE_HANDLE_ID)).toBeNull();

    useCampaignStore.getState().onConnect({
      source: 'audience-2',
      target: 'adset-1',
      sourceHandle: null,
      targetHandle: AUDIENCE_HANDLE_ID,
    });
    expect(useCampaignStore.getState().edges).toHaveLength(1);
  });
});

describe('connection rules: an ad and its creative share a format', () => {
  it('refuses an incompatible creative up front, before any edge exists', () => {
    resetStore([createAdNode('ad-1', 'VIDEO'), createCreativeNode('creative-1', 'image')]);
    const connection = {
      source: 'ad-1',
      target: 'creative-1',
      sourceHandle: null,
      targetHandle: null,
    };

    expect(useCampaignStore.getState().connectionBlockReason(connection)).toMatch(
      /A video ad cannot use an image creative/,
    );
    useCampaignStore.getState().onConnect(connection);
    expect(useCampaignStore.getState().edges).toHaveLength(0);
  });

  it('accepts a carousel creative only under a carousel ad', () => {
    resetStore([
      createAdNode('carousel-ad', 'CAROUSEL'),
      createAdNode('image-ad', 'IMAGE'),
      createCreativeNode('cards', 'carousel'),
    ]);
    const reason = (source: string) =>
      useCampaignStore
        .getState()
        .connectionBlockReason({ source, target: 'cards', sourceHandle: null, targetHandle: null });

    expect(reason('carousel-ad')).toBeNull();
    expect(reason('image-ad')).toMatch(/cannot use a carousel creative/);
  });
});

describe('useCampaignStore.updateNodeData history', () => {
  beforeEach(() => {
    resetStore([createAdNode('ad-1', 'IMAGE')]);
  });

  const headlineOf = () =>
    (useCampaignStore.getState().nodes.find((node) => node.id === 'ad-1')?.data as AdData).headline;

  it('records one undo step per edit, and undo restores the old value', () => {
    useCampaignStore.getState().updateNodeData('ad-1', { headline: 'New headline' });
    expect(headlineOf()).toBe('New headline');
    expect(useCampaignStore.getState().history).toHaveLength(1);

    useCampaignStore.getState().undo();
    expect(headlineOf()).toBe('Headline');

    useCampaignStore.getState().redo();
    expect(headlineOf()).toBe('New headline');
  });

  it('records nothing for an edit that changes nothing', () => {
    useCampaignStore.getState().updateNodeData('ad-1', { headline: 'Headline' });
    expect(useCampaignStore.getState().history).toHaveLength(0);
  });
});

describe('useCampaignStore.setCreativeFormat', () => {
  it("moves the creative and its ad to the new format in one undo step", () => {
    resetStore(
      [createAdNode('ad-1', 'IMAGE'), createCreativeNode('creative-1', 'image')],
      [{ id: 'ad-1->creative-1', source: 'ad-1', target: 'creative-1' }],
    );
    const dataOf = (id: string) =>
      useCampaignStore.getState().nodes.find((node) => node.id === id)?.data;

    useCampaignStore.getState().setCreativeFormat('creative-1', 'carousel');
    expect((dataOf('creative-1') as CreativeData).assetType).toBe('carousel');
    expect((dataOf('ad-1') as AdData).adFormat).toBe('CAROUSEL');

    useCampaignStore.getState().undo();
    expect((dataOf('creative-1') as CreativeData).assetType).toBe('image');
    expect((dataOf('ad-1') as AdData).adFormat).toBe('IMAGE');
  });
});

const HYDRATION = {
  scaffoldId: 's',
  scaffoldName: 'Scaffold',
  versionId: 'v',
  version: 1,
  lifecycle: 'proposed',
  adAccountId: 'act_1',
  contentHash: 'h',
  plan: null,
  specialAdCategories: [],
  sourceRows: {},
};

/** campaign → ad set → ad → creative, as a loaded record. */
const loadRecord = () => {
  useCampaignStore.getState().loadHydratedGraph({
    nodes: [
      createCampaignNode('c'),
      createAdSetNode('a', { x: 0, y: 0 }),
      createAdNode('ad', 'IMAGE'),
      createCreativeNode('cr', 'image'),
    ],
    edges: [
      { id: 'c->a', source: 'c', target: 'a' },
      { id: 'a->ad', source: 'a', target: 'ad' },
      { id: 'ad->cr', source: 'ad', target: 'cr' },
    ],
    hydration: HYDRATION,
  });
  useCampaignStore.setState({ editLocked: false });
};

describe('keyboard deletes (React Flow remove changes)', () => {
  beforeEach(loadRecord);

  it('mark the record dirty and remove the node with its edges as ONE undo step', () => {
    const store = useCampaignStore.getState();
    store.onNodesChange([{ id: 'ad', type: 'remove' }]);
    // React Flow sends the edge removals next; they must find nothing left and record nothing.
    useCampaignStore
      .getState()
      .onEdgesChange([
        { id: 'a->ad', type: 'remove' },
        { id: 'ad->cr', type: 'remove' },
      ]);

    let state = useCampaignStore.getState();
    expect(state.isDirty).toBe(true);
    expect(state.nodes.map((node) => node.id)).not.toContain('ad');
    expect(state.edges.map((edge) => edge.id)).toEqual(['c->a']);
    expect(state.history).toHaveLength(1);

    state.undo();
    state = useCampaignStore.getState();
    expect(state.nodes.map((node) => node.id)).toContain('ad');
    expect(state.edges.map((edge) => edge.id).sort()).toEqual(['a->ad', 'ad->cr', 'c->a']);
  });

  it('an edge deleted on its own is also an undoable, dirtying edit', () => {
    useCampaignStore.getState().onEdgesChange([{ id: 'ad->cr', type: 'remove' }]);
    const state = useCampaignStore.getState();
    expect(state.isDirty).toBe(true);
    state.undo();
    expect(useCampaignStore.getState().edges.map((edge) => edge.id)).toContain('ad->cr');
  });
});

describe('the edit lock held while a save is in flight', () => {
  beforeEach(() => {
    loadRecord();
    useCampaignStore.getState().setEditLocked(true);
  });

  it('refuses every mutation but still lets a node be selected', () => {
    const store = useCampaignStore.getState();
    const before = useCampaignStore.getState();
    store.updateNodeData('ad', { primaryText: 'edited mid-save' });
    store.onNodesChange([
      { id: 'cr', type: 'remove' },
      { id: 'ad', type: 'position', position: { x: 500, y: 500 } },
    ]);
    store.onEdgesChange([{ id: 'c->a', type: 'remove' }]);
    store.onConnect({ source: 'a', target: 'cr', sourceHandle: null, targetHandle: null });
    expect(store.addNode('creative', {})).toBe('');
    store.removeNode('a');
    store.duplicateNode('ad');
    store.setCreativeFormat('cr', 'video');
    store.undo();

    const after = useCampaignStore.getState();
    expect(after.nodes.map((node) => [node.id, node.position.x, node.data])).toEqual(
      before.nodes.map((node) => [node.id, node.position.x, node.data]),
    );
    expect(after.edges).toEqual(before.edges);
    expect(after.isDirty).toBe(false);

    store.onNodesChange([{ id: 'ad', type: 'select', selected: true }]);
    expect(useCampaignStore.getState().nodes.find((node) => node.id === 'ad')?.selected).toBe(true);
  });
});

describe('one creative per ad', () => {
  beforeEach(loadRecord);

  it('refuses wiring a second creative to an ad, and refuses drawing one off its handle', () => {
    useCampaignStore.setState((state) => ({
      nodes: [...state.nodes, createCreativeNode('cr2', 'image')],
    }));
    const store = useCampaignStore.getState();
    expect(
      store.connectionBlockReason({ source: 'ad', target: 'cr2', sourceHandle: null, targetHandle: null }),
    ).toContain('An ad takes one creative');
    expect(store.childBlockReason('ad', 'creative')).toContain('carousel');
    store.onConnect({ source: 'ad', target: 'cr2', sourceHandle: null, targetHandle: null });
    expect(useCampaignStore.getState().edges.some((edge) => edge.target === 'cr2')).toBe(false);
  });
});

describe('duplicate', () => {
  beforeEach(loadRecord);

  it('makes a draft: the copy carries no record provenance and no Meta id', () => {
    useCampaignStore.setState((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === 'a'
          ? {
              ...node,
              data: {
                ...node.data,
                metaId: '1200',
                provenance: { sourceId: 'row-a', pathKey: 'c0/a0', gate: null, metaStatus: 'PAUSED' },
              },
            }
          : node,
      ),
    }));
    useCampaignStore.getState().duplicateNode('a');
    const copy = useCampaignStore.getState().nodes.find((node) => node.data.label.endsWith('(Copy)'));
    expect(copy).toBeTruthy();
    expect(copy?.data.provenance).toBeUndefined();
    expect(copy?.data.metaId).toBeUndefined();
  });
});

describe('orphans are flagged on the node', () => {
  beforeEach(loadRecord);

  it('flags an ad set outside the campaign tree, and clears the flag once it is connected', () => {
    useCampaignStore.setState((state) => ({
      nodes: [...state.nodes, createAdSetNode('loose', { x: 400, y: 0 })],
    }));
    useCampaignStore.getState().onConnect({
      source: 'ad',
      target: 'cr',
      sourceHandle: null,
      targetHandle: null,
    });
    useCampaignStore.getState().validateGraph();
    const loose = () => useCampaignStore.getState().nodes.find((node) => node.id === 'loose');
    expect(loose()?.data.validationErrors?.join(' ')).toContain('Not connected');

    useCampaignStore.getState().onConnect({
      source: 'c',
      target: 'loose',
      sourceHandle: null,
      targetHandle: null,
    });
    expect(loose()?.data.validationErrors ?? []).toHaveLength(0);
  });
});

describe('graphFingerprint — what a save would write', () => {
  beforeEach(loadRecord);

  it('ignores selection and derived validation, and changes with any field, move or edge', () => {
    const fingerprint = () => {
      const { nodes, edges } = useCampaignStore.getState();
      return graphFingerprint(nodes, edges);
    };
    const before = fingerprint();
    useCampaignStore.getState().onNodesChange([{ id: 'ad', type: 'select', selected: true }]);
    useCampaignStore.getState().validateGraph();
    expect(fingerprint()).toBe(before);

    useCampaignStore.getState().updateNodeData('ad', { primaryText: 'changed' });
    expect(fingerprint()).not.toBe(before);
  });
});
