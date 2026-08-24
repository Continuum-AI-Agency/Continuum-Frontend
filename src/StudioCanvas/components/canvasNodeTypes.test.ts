// Pins the node-type registry that was extracted verbatim out of StudioCanvas.tsx.
// The point of the file is the drift guard: NODE_TYPES and nodeTypes are two hand
// written lists of the same thing, and adding a node to one but not the other is the
// bug class. Everything else here anchors createNodeConfig's literal defaults so a
// behaviour-preserving refactor stays behaviour-preserving.

import { describe, expect, it } from 'bun:test';
import type { StudioNodeType } from '@continuum/contracts';
import {
  DEFAULT_VIDEO_GENERATOR_MODEL,
  getVideoGeneratorReferenceMode,
  type VideoGeneratorModel,
} from '../utils/videoModel';
import {
  createNodeConfig,
  edgeTypes,
  isStudioCanvasNodeType,
  NODE_TYPES,
  nodeTypes,
} from './canvasNodeTypes';

describe('NODE_TYPES vs nodeTypes — the drift guard', () => {
  it('registers a component for exactly the declared node types', () => {
    const registered = Object.keys(nodeTypes);

    expect(registered.length).toBe(NODE_TYPES.size);
    expect(new Set(registered)).toEqual(NODE_TYPES as Set<string>);

    for (const type of NODE_TYPES) {
      expect(registered).toContain(type);
    }
    for (const type of registered) {
      expect(NODE_TYPES.has(type as StudioNodeType)).toBe(true);
    }
  });

  it('points every registered node type at a component', () => {
    for (const [type, component] of Object.entries(nodeTypes)) {
      expect(component, `nodeTypes.${type}`).toBeDefined();
    }
  });
});

describe('edgeTypes', () => {
  it('registers button and dataType against the same component', () => {
    expect(Object.keys(edgeTypes).sort()).toEqual(['button', 'dataType']);
    expect(edgeTypes.button).toBeDefined();
    expect(edgeTypes.button).toBe(edgeTypes.dataType);
  });
});

describe('isStudioCanvasNodeType', () => {
  it('accepts every member of NODE_TYPES', () => {
    for (const type of NODE_TYPES) {
      expect(isStudioCanvasNodeType(type)).toBe(true);
    }
  });

  it('rejects an unknown string', () => {
    expect(isStudioCanvasNodeType('notARealNode')).toBe(false);
  });
});

describe('createNodeConfig — literal defaults', () => {
  it('extendVideo', () => {
    expect(createNodeConfig('extendVideo')).toEqual({
      data: { prompt: '' },
      style: { width: 360, height: 200 },
    });
  });

  it('note', () => {
    expect(createNodeConfig('note')).toEqual({
      data: { content: '' },
      style: { width: 260, height: 160 },
    });
  });

  it('string carries no style', () => {
    const config = createNodeConfig('string');

    expect(config.data).toEqual({ value: '' });
    expect(config.style).toBeUndefined();
    expect('style' in config).toBe(false);
  });

  it('timelineEditor', () => {
    expect(createNodeConfig('timelineEditor')).toEqual({
      data: {
        items: [],
        outputFormat: 'mp4',
        videoCodec: 'avc',
        audioCodec: 'aac',
        committed: false,
      },
      style: { width: 320, height: 260 },
    });
  });

  it('videoDecode', () => {
    expect(createNodeConfig('videoDecode')).toEqual({
      data: { value: '' },
      style: { width: 360, height: 320 },
    });
  });

  // The literal `undefined` keys below are load-bearing for toStrictEqual: the module
  // seeds `image`/`audio`/`video` as explicitly-undefined keys, unlike the contracts
  // factory which strips them.
  it('image keeps an explicitly undefined image key', () => {
    expect(createNodeConfig('image')).toStrictEqual({
      data: { image: undefined, aspectRatio: '1:1' },
      style: { width: 192, height: 192 },
    });
  });

  it('audio keeps an explicitly undefined audio key', () => {
    expect(createNodeConfig('audio')).toStrictEqual({
      data: { audio: undefined },
      style: { width: 192, height: 100 },
    });
  });

  it('document', () => {
    expect(createNodeConfig('document')).toStrictEqual({
      data: { documents: [] },
      style: { width: 200, height: 200 },
    });
  });

  it('falls back to the video reference shape for an unhandled type', () => {
    expect(createNodeConfig('video')).toStrictEqual({
      data: { video: undefined },
      style: { width: 192, height: 192 },
    });
  });
});

describe('createNodeConfig — video generator family', () => {
  const cases: ReadonlyArray<[StudioNodeType, VideoGeneratorModel]> = [
    ['veoDirector', 'veo-3.1'],
    ['veoFast', 'veo-3.1-fast'],
    ['videoGen', DEFAULT_VIDEO_GENERATOR_MODEL],
  ];

  for (const [type, expectedModel] of cases) {
    it(`${type} derives model ${expectedModel} and its reference mode`, () => {
      const { data } = createNodeConfig(type);

      expect(data.model).toBe(expectedModel);
      expect(data.referenceMode).toBe(getVideoGeneratorReferenceMode(expectedModel));
    });
  }

  it('lets an explicit options.model override the type-derived default', () => {
    const { data } = createNodeConfig('veoDirector', { model: 'veo-3.1-fast' });

    expect(data.model).toBe('veo-3.1-fast');
    expect(data.referenceMode).toBe(getVideoGeneratorReferenceMode('veo-3.1-fast'));
  });
});

describe('createNodeConfig — contracts-backed types', () => {
  const contractsBacked: readonly StudioNodeType[] = [
    'nanoGen',
    'hyperframesAgent',
    'omniGen',
    'frameExtract',
    'plannerDraft',
    'organicPublish',
    'paidPublisher',
    'apiRender',
    'action',
    'router',
    'element',
    'designRef',
  ];

  for (const type of contractsBacked) {
    it(`${type} returns a data object`, () => {
      const { data } = createNodeConfig(type);

      expect(data).toBeDefined();
      expect(data).not.toBeNull();
      expect(typeof data).toBe('object');
    });
  }
});

describe('Canvas V3 registration', () => {
  it('registers action and router, and nothing without an implementation', () => {
    // A registered type with no component renders as an empty box — worse than an
    // absent one, because it looks like the node broke rather than like it is not
    // built yet. batch/export/layerEditor/element/designRef stay contracts-only until
    // their own shells land.
    expect(NODE_TYPES.has('action')).toBe(true);
    expect(NODE_TYPES.has('router')).toBe(true);
    for (const notYet of ['batch', 'export', 'layerEditor'] as const) {
      expect(NODE_TYPES.has(notYet), notYet).toBe(false);
    }
  });

  it('gives an action node no op until one is chosen', () => {
    // Contracts gives an `actionId: null` node zero handles and refuses every
    // connection. Seeding some default op would wire a clip into whatever it guessed.
    expect(createNodeConfig('action').data).toEqual({ actionId: null, config: {} });
  });

  it('gives a router no locked modality until it is connected', () => {
    expect(createNodeConfig('router').data).toEqual({ lockedType: null });
  });

  it('accepts every registered type and still rejects an unregistered contracts type', () => {
    expect(isStudioCanvasNodeType('action')).toBe(true);
    expect(isStudioCanvasNodeType('router')).toBe(true);
    expect(isStudioCanvasNodeType('layerEditor')).toBe(false);
    // Landed alongside this shell by the elements / design-reference shells.
    expect(isStudioCanvasNodeType('element')).toBe(true);
    expect(isStudioCanvasNodeType('designRef')).toBe(true);
  });
});
