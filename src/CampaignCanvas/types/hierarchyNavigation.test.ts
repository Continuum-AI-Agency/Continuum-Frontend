import { describe, expect, it } from 'bun:test';
import { getNodeTypeToCreateFromHandle, getTargetHandleIdFor } from './hierarchyNavigation';
import { AUDIENCE_HANDLE_ID } from './index';

describe('getNodeTypeToCreateFromHandle', () => {
  it("creates an audience off the ad set's side handle and its campaign off the top one", () => {
    expect(getNodeTypeToCreateFromHandle('ad-set', 'target', AUDIENCE_HANDLE_ID)).toBe('audience');
    expect(getNodeTypeToCreateFromHandle('ad-set', 'target', null)).toBe('campaign');
  });

  it("creates an ad set off the audience's source handle, and nothing off a target it lacks", () => {
    expect(getNodeTypeToCreateFromHandle('audience', 'source', null)).toBe('ad-set');
    expect(getNodeTypeToCreateFromHandle('audience', 'target', null)).toBeNull();
  });

  it('keeps the vertical chain', () => {
    expect(getNodeTypeToCreateFromHandle('campaign', 'source')).toBe('ad-set');
    expect(getNodeTypeToCreateFromHandle('ad-set', 'source')).toBe('ad');
    expect(getNodeTypeToCreateFromHandle('ad', 'source')).toBe('creative');
    expect(getNodeTypeToCreateFromHandle('creative', 'target')).toBe('ad');
  });
});

describe('getTargetHandleIdFor', () => {
  it('names the side handle only for audience -> ad set', () => {
    expect(getTargetHandleIdFor('audience', 'ad-set')).toBe(AUDIENCE_HANDLE_ID);
    expect(getTargetHandleIdFor('campaign', 'ad-set')).toBeNull();
    expect(getTargetHandleIdFor('ad', 'creative')).toBeNull();
  });
});
