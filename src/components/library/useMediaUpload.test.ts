import { describe, expect, it } from 'bun:test';

import {
  isAcceptedUploadFile,
  moveUploadItem,
  NETWORK_WAIT_MESSAGE,
  pauseUploadsForNetwork,
  pickNextUploads,
  requeueUpload,
  resumeNetworkPausedUploads,
  type UploadItem,
} from './useMediaUpload';

function file(name: string, type: string): File {
  return new File(['bytes'], name, { type });
}

describe('isAcceptedUploadFile', () => {
  it('accepts the supported image and video registry', () => {
    expect(isAcceptedUploadFile(file('photo.png', 'image/png'))).toBe(true);
    expect(isAcceptedUploadFile(file('clip.mov', 'video/quicktime'))).toBe(true);
  });

  it('accepts the core design and After Effects set by extension', () => {
    expect(isAcceptedUploadFile(file('intro.aep', ''))).toBe(true);
    expect(isAcceptedUploadFile(file('Intro.AEP', 'application/octet-stream'))).toBe(true);
    expect(isAcceptedUploadFile(file('layout.psd', 'image/vnd.adobe.photoshop'))).toBe(true);
    expect(isAcceptedUploadFile(file('deck.pdf', 'application/pdf'))).toBe(true);
    expect(isAcceptedUploadFile(file('logo.ai', 'application/pdf'))).toBe(true);
    expect(isAcceptedUploadFile(file('mark.svg', 'image/svg+xml'))).toBe(true);
    expect(isAcceptedUploadFile(file('scan.tiff', 'image/tiff'))).toBe(true);
    expect(isAcceptedUploadFile(file('photo.heic', 'image/heic'))).toBe(true);
    expect(isAcceptedUploadFile(file('collected-files.zip', 'application/zip'))).toBe(true);
  });

  it('rejects formats outside the explicit registry', () => {
    expect(isAcceptedUploadFile(file('raw.cr3', 'image/x-canon-cr3'))).toBe(false);
    expect(isAcceptedUploadFile(file('clip.mkv', 'video/x-matroska'))).toBe(false);
    expect(isAcceptedUploadFile(file('aep', ''))).toBe(false);
  });
});

describe('upload queue transitions', () => {
  function item(
    id: string,
    status: UploadItem['status'],
    extra: Partial<UploadItem> = {},
  ): UploadItem {
    return { id, name: `${id}.mp4`, sizeBytes: 1, progress: 0, status, ...extra };
  }

  it('fills free slots from the FIRST queued items in the current order', () => {
    const items = [
      item('a', 'uploading'),
      item('b', 'queued'),
      item('c', 'done'),
      item('d', 'queued'),
      item('e', 'queued'),
    ];
    expect(pickNextUploads(items, 3)).toEqual(['b', 'd']);
    expect(pickNextUploads(items, 1)).toEqual([]);
  });

  it('starts whatever was moved to the top next', () => {
    const items = [item('a', 'uploading'), item('b', 'queued'), item('c', 'queued')];
    const reordered = moveUploadItem(items, 'c', 'top');
    expect(reordered.map((u) => u.id)).toEqual(['c', 'a', 'b']);
    expect(pickNextUploads(reordered, 2)).toEqual(['c']);
  });

  it('moves one step up or down and ignores moves off either end', () => {
    const items = [item('a', 'queued'), item('b', 'queued'), item('c', 'queued')];
    expect(moveUploadItem(items, 'b', 'up').map((u) => u.id)).toEqual(['b', 'a', 'c']);
    expect(moveUploadItem(items, 'b', 'down').map((u) => u.id)).toEqual(['a', 'c', 'b']);
    expect(moveUploadItem(items, 'a', 'up').map((u) => u.id)).toEqual(['a', 'b', 'c']);
    expect(moveUploadItem(items, 'c', 'down').map((u) => u.id)).toEqual(['a', 'b', 'c']);
  });

  it('skips a sidecar until its source is ready', () => {
    const items = [
      item('src', 'uploading'),
      item('side', 'queued', { afterId: 'src' }),
      item('x', 'queued'),
    ];
    expect(pickNextUploads(items, 3, (u) => !u.afterId)).toEqual(['x']);
  });

  it('pauses in-flight uploads on offline and resumes only those on online', () => {
    const items = [
      item('a', 'uploading'),
      item('b', 'paused', { pausedBy: 'user' }),
      item('c', 'queued'),
    ];
    const offline = pauseUploadsForNetwork(items);
    expect(offline[0]).toMatchObject({
      status: 'paused',
      pausedBy: 'network',
      error: NETWORK_WAIT_MESSAGE,
    });
    expect(offline[1]).toMatchObject({ status: 'paused', pausedBy: 'user' });
    expect(offline[2].status).toBe('queued');

    const online = resumeNetworkPausedUploads(offline);
    expect(online[0]).toMatchObject({ status: 'queued', error: undefined, pausedBy: undefined });
    expect(online[1]).toMatchObject({ status: 'paused', pausedBy: 'user' });
  });

  it('re-queues a paused or failed upload in place', () => {
    const items = [
      item('a', 'queued'),
      item('b', 'error', { error: 'boom' }),
      item('c', 'paused', { pausedBy: 'user' }),
    ];
    const retried = requeueUpload(requeueUpload(items, 'b'), 'c');
    expect(retried.map((u) => [u.id, u.status, u.error])).toEqual([
      ['a', 'queued', undefined],
      ['b', 'queued', undefined],
      ['c', 'queued', undefined],
    ]);
  });
});
