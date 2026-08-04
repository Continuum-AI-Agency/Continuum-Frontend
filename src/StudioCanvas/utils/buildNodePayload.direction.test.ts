// The creative-direction tri-state has to survive the trip to the wire.
//
// Every other link in this chain already existed — `ImageGenBlock` writes the selection to
// node data, `GroundingPopover` renders it, `toBackendPayload` maps it to
// `brand_direction_pieces`, the wire schema declares it, and the Backend reads it on both
// compiler arms. `buildNanoGenPayload` dropped it, so `request.brandPieces` was `undefined`
// on every production generation and the control was decorative.
//
// The empty array is the case that matters. `undefined` and `[]` mean OPPOSITE things —
// "no preference, admit everything the plan allows" versus "the user switched every piece
// off" — and a `??` or a spread-with-default anywhere on this path silently converts the
// second into the first, which is the one mistake this field cannot survive.

import { describe, expect, it } from 'bun:test';
import type { BrandDirectionPiece } from '@continuum/contracts';
import type { StudioNode } from '../types';
import type { NodeOutput } from '../types/execution';
import { buildNanoGenPayload, toBackendPayload } from './buildNodePayload';

const nanoNode = (brandDirectionPieces?: BrandDirectionPiece[]): StudioNode =>
  ({
    id: 'nano1',
    type: 'nanoGen',
    position: { x: 0, y: 0 },
    data: {
      positivePrompt: 'a cat',
      model: 'nano-banana',
      ...(brandDirectionPieces === undefined ? {} : { brandDirectionPieces }),
    },
  }) as unknown as StudioNode;

const build = (pieces?: BrandDirectionPiece[]) => {
  const node = nanoNode(pieces);
  const payload = buildNanoGenPayload(node, new Map<string, NodeOutput>(), [node], [], 'brand-1');
  if (!payload) throw new Error('expected a payload');
  return { payload, backend: toBackendPayload(payload) };
};

describe('the creative-direction selection reaches the wire', () => {
  it('carries a named list through to brand_direction_pieces', () => {
    const { payload, backend } = build(['colour-behaviour', 'composition']);

    expect(payload.brandDirectionPieces).toEqual(['colour-behaviour', 'composition']);
    expect(backend.brand_direction_pieces).toEqual(['colour-behaviour', 'composition']);
  });

  it('keeps an empty selection EMPTY — off must not become all', () => {
    const { payload, backend } = build([]);

    // The assertion the whole file exists for. `toBeUndefined()` here would mean the user
    // switched every piece off and the Backend admitted all of them.
    expect(payload.brandDirectionPieces).toEqual([]);
    expect(backend.brand_direction_pieces).toEqual([]);
  });

  it('leaves "no preference" absent rather than inventing a selection', () => {
    const { payload, backend } = build(undefined);

    expect(payload.brandDirectionPieces).toBeUndefined();
    expect(backend.brand_direction_pieces).toBeUndefined();
  });
});
