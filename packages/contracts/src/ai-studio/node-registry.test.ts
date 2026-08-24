import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  NANO_GEN_SIGNATURE_FIELDS,
  STUDIO_MEDIA_NODE_TYPES,
  STUDIO_NODE_CATEGORY_ORDER,
  STUDIO_NODE_REGISTRY,
  STUDIO_PUBLISHER_NODE_KINDS,
  STUDIO_RUNNABLE_NODE_TYPES,
  studioNodeDefinition,
  studioNodeTypesWhere,
  VIDEO_GENERATOR_SIGNATURE_FIELDS,
} from './node-registry';
import { STUDIO_NODE_TYPES, type StudioNodeType } from './workflow-graph';

const sorted = (values: Iterable<string>) => [...values].sort();

describe('STUDIO_NODE_REGISTRY', () => {
  // `satisfies Record<StudioNodeType, …>` already fails the typecheck in both directions.
  // This is the runtime mirror, because `bun test` does not typecheck and a registry that
  // silently lost a key would take every derived set down with it.
  it('describes every node type, and nothing that is not one', () => {
    expect(sorted(Object.keys(STUDIO_NODE_REGISTRY))).toEqual(sorted(STUDIO_NODE_TYPES));
  });

  it('says something real about each type', () => {
    for (const type of STUDIO_NODE_TYPES) {
      const definition = studioNodeDefinition(type);
      expect(definition.label.length, `${type} label`).toBeGreaterThan(0);
      expect(definition.description.length, `${type} description`).toBeGreaterThan(0);
      // The purpose is rendered verbatim into the agent prompt. A placeholder here is a
      // node the model does not understand. The floor is low because some of the shipped
      // sentences really are that short ("image generator") and accurate — this catches an
      // empty or stub entry, not terseness.
      expect(definition.purpose.length, `${type} purpose`).toBeGreaterThan(10);
      expect(STUDIO_NODE_CATEGORY_ORDER).toContain(definition.category);
    }
  });

  it('cannot claim to make media without being runnable', () => {
    for (const type of STUDIO_NODE_TYPES) {
      const definition = studioNodeDefinition(type);
      if (definition.producesMedia) expect(definition.runnable, `${type}`).toBe(true);
    }
  });

  // A `sink` is a terminal DELIVERY HANDOFF: a run walks up to it and deliberately does
  // not execute it, because publishing is gated on a human confirmation. Anything both
  // runnable and a sink would publish itself on Run.
  it('never marks a delivery handoff runnable', () => {
    for (const type of STUDIO_NODE_TYPES) {
      const definition = studioNodeDefinition(type);
      if (definition.sink) expect(definition.runnable, `${type}`).toBe(false);
    }
  });

  it('leaves export out of the publisher handoffs even though it is terminal', () => {
    expect(studioNodeDefinition('export').sink).toBeUndefined();
    expect(studioNodeDefinition('export').runnable).toBe(true);
  });
});

describe('derived sets', () => {
  // Pinned to exact membership, not "contains": these three sets REPLACE three
  // hand-maintained copies in the Frontend that had already drifted apart from each
  // other, and the whole point of the registry is that they cannot drift again.
  it('replaces MEDIA_NODE_TYPES exactly', () => {
    expect(sorted(STUDIO_MEDIA_NODE_TYPES)).toEqual([
      'action',
      'extendVideo',
      'frameExtract',
      'hyperframesAgent',
      'layerEditor',
      'nanoGen',
      'omniGen',
      'timelineEditor',
      'veoDirector',
      'veoFast',
      'videoGen',
    ]);
  });

  it('replaces RUNNABLE_NODE_TYPES, including the three types it was missing', () => {
    expect(sorted(STUDIO_RUNNABLE_NODE_TYPES)).toEqual([
      'action',
      'batch',
      'export',
      'extendVideo',
      // omniGen / hyperframesAgent / frameExtract produced media and were executed, but
      // canvasRunRequests' copy left them out, so an MCP run summary never mentioned them.
      'frameExtract',
      'hyperframesAgent',
      'layerEditor',
      'nanoGen',
      'omniGen',
      'router',
      'string',
      'timelineEditor',
      'veoDirector',
      'veoFast',
      'videoDecode',
      'videoGen',
    ]);
  });

  it('replaces PUBLISHER_NODE_KINDS exactly', () => {
    expect(STUDIO_PUBLISHER_NODE_KINDS).toEqual({
      plannerDraft: 'organic',
      organicPublish: 'organic',
      paidPublisher: 'paid',
      apiRender: 'render',
    });
  });

  it('derives any other set from the same source', () => {
    const images = studioNodeTypesWhere((definition) => definition.category === 'image');
    expect(images.has('nanoGen')).toBe(true);
    expect(images.has('element')).toBe(true);
    expect(images.has('videoGen')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The generation-signature pin
// ---------------------------------------------------------------------------
//
// The signature is `field=value` joined IN LIST ORDER. Change the order or the
// membership and the string no longer matches what is stored on any existing node, so
// every nanoGen on every saved canvas reads as stale and regenerates on the next Run —
// that is bug #221, and it costs real generation credits across every brand at once.
//
// So this is pinned twice: once against a literal transcribed from the Frontend, and
// once against the Frontend source itself.

const FRONTEND_SIGNATURE_SOURCE = fileURLToPath(
  new URL(
    '../../../../Continuum-Frontend/src/StudioCanvas/utils/generationSignature.ts',
    import.meta.url,
  ),
);

/** The live `OWN_FIELDS_BY_TYPE.nanoGen` literal, read out of the Frontend source.
 *  `SIG1_OWN_FIELDS_BY_TYPE` also has a nanoGen key, so the search starts at the
 *  current-version map and takes the first match after it. */
function frontendNanoGenFields(): string[] | null {
  if (!existsSync(FRONTEND_SIGNATURE_SOURCE)) return null;
  const source = readFileSync(FRONTEND_SIGNATURE_SOURCE, 'utf8');
  const mapStart = source.indexOf('const OWN_FIELDS_BY_TYPE');
  if (mapStart === -1) return null;
  const match = /nanoGen:\s*\[([^\]]*)\]/.exec(source.slice(mapStart));
  if (!match) return null;
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
}

describe('generation signature recipes', () => {
  it('pins the nanoGen recipe to the transcribed Frontend literal, in order', () => {
    expect([...NANO_GEN_SIGNATURE_FIELDS]).toEqual([
      'positivePrompt',
      'negativePrompt',
      'model',
      'aspectRatio',
      'imageSize',
      'stylePreset',
      'skillIds',
      'seed',
      'steps',
      'guidance',
      'scheduler',
      'promptEnhancement',
      'brandBookPieces',
    ]);
    expect(studioNodeDefinition('nanoGen').signatureFields).toEqual(NANO_GEN_SIGNATURE_FIELDS);
  });

  // The transcription above can be faithfully wrong the day somebody edits the Frontend.
  // In the monorepo this reads the real file; in the standalone Frontend repo (where
  // contracts is a vendored copy and the app source is not at that path) it says so out
  // loud rather than passing on an unread file.
  it('matches the live Frontend OWN_FIELDS_BY_TYPE.nanoGen', () => {
    const live = frontendNanoGenFields();
    if (live === null) {
      console.warn(
        `[node-registry.test] SKIPPED live signature cross-check — ${FRONTEND_SIGNATURE_SOURCE} is not reachable from this checkout. The transcribed pin above still ran.`,
      );
      return;
    }
    expect(live).toEqual([...NANO_GEN_SIGNATURE_FIELDS]);
  });

  it('gives every video generator the same recipe, and only the tracked types one', () => {
    for (const type of ['videoGen', 'veoDirector', 'veoFast'] as const) {
      expect(studioNodeDefinition(type).signatureFields).toEqual(VIDEO_GENERATOR_SIGNATURE_FIELDS);
    }
    const tracked = STUDIO_NODE_TYPES.filter(
      (type: StudioNodeType) => studioNodeDefinition(type).signatureFields !== undefined,
    );
    expect(sorted(tracked)).toEqual(['nanoGen', 'veoDirector', 'veoFast', 'videoGen']);
  });
});
