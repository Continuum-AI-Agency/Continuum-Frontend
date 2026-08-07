import { describe, expect, it } from 'bun:test';
import { canvasRoomHref } from './canvasRoomLocation';

describe('canvasRoomHref', () => {
  it('persists the selected workspace while preserving other canvas context', () => {
    expect(canvasRoomHref('focusNodeId=node-7&source=planner', 'room-2')).toBe(
      '?focusNodeId=node-7&source=planner&roomId=room-2',
    );
  });

  it('replaces a stale room instead of adding a second selector', () => {
    expect(canvasRoomHref('roomId=room-1&draftId=draft-1', 'room-2')).toBe(
      '?roomId=room-2&draftId=draft-1',
    );
  });

  it('removes the room selector while a brand switch resolves its new default', () => {
    expect(canvasRoomHref('roomId=room-1&source=planner')).toBe('?source=planner');
  });
});
