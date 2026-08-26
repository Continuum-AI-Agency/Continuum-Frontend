import { describe, expect, it } from 'bun:test';
import type { RegisterVersionRequest } from '@continuum/contracts';
import {
  type AssetVersionRow,
  buildBackfillV1Row,
  buildRegisterRow,
  buildRollbackRow,
  buildVersionStoragePath,
  headUpdateFromRegister,
  headUpdateFromVersion,
  isHeadVersion,
  nextVersionNumber,
  versionRowToContract,
} from './versionMapping';

const BRAND_ID = '4b1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a10';
const ASSET_ID = '9a1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a22';

function makeVersionRow(overrides: Partial<AssetVersionRow> = {}): AssetVersionRow {
  return {
    id: 'v-row-1',
    brand_id: BRAND_ID,
    asset_id: ASSET_ID,
    version_number: 1,
    bucket: 'media-library',
    storage_path: `${BRAND_ID}/${ASSET_ID}/hero.png`,
    file_name: 'hero.png',
    mime_type: 'image/png',
    size_bytes: 1024,
    width: 800,
    height: 600,
    duration_ms: null,
    checksum: 'abc123',
    note: null,
    created_by: 'user-1',
    created_at: '2026-07-10T00:00:00.000Z',
    ...overrides,
  };
}

describe('nextVersionNumber', () => {
  it('treats the head as implicit v1 when no history exists', () => {
    expect(nextVersionNumber(null)).toBe(2);
  });

  it('increments the highest existing version', () => {
    expect(nextVersionNumber(1)).toBe(2);
    expect(nextVersionNumber(7)).toBe(8);
  });
});

describe('buildVersionStoragePath', () => {
  it('builds brand/asset/vN/sanitized-name', () => {
    expect(
      buildVersionStoragePath({
        brandId: BRAND_ID,
        assetId: ASSET_ID,
        versionNumber: 3,
        fileName: 'Brand Logo (final).PNG',
      }),
    ).toBe(`${BRAND_ID}/${ASSET_ID}/v3/brand-logo-final.png`);
  });
});

describe('isHeadVersion', () => {
  it('matches on bucket AND storage path', () => {
    const row = makeVersionRow();
    expect(isHeadVersion(row, { bucket: row.bucket, storage_path: row.storage_path })).toBe(true);
    expect(isHeadVersion(row, { bucket: 'other-bucket', storage_path: row.storage_path })).toBe(
      false,
    );
    expect(isHeadVersion(row, { bucket: row.bucket, storage_path: 'elsewhere/file.png' })).toBe(
      false,
    );
  });
});

describe('buildBackfillV1Row', () => {
  it('copies the head file columns into a v1 row attributed to the asset creator', () => {
    const row = buildBackfillV1Row({
      id: ASSET_ID,
      brand_id: BRAND_ID,
      created_by: 'creator-1',
      bucket: 'brand-profile-assets',
      storage_path: 'old/path.png',
      file_name: 'path.png',
      mime_type: 'image/png',
      size_bytes: 555,
      width: 100,
      height: 200,
      duration_ms: null,
      checksum: 'sum',
    });
    expect(row).toEqual({
      brand_id: BRAND_ID,
      asset_id: ASSET_ID,
      version_number: 1,
      bucket: 'brand-profile-assets',
      storage_path: 'old/path.png',
      file_name: 'path.png',
      mime_type: 'image/png',
      size_bytes: 555,
      width: 100,
      height: 200,
      duration_ms: null,
      checksum: 'sum',
      note: null,
      created_by: 'creator-1',
    });
  });
});

describe('buildRegisterRow / headUpdateFromRegister', () => {
  const request: RegisterVersionRequest = {
    brandId: BRAND_ID,
    assetId: ASSET_ID,
    bucket: 'media-library',
    storagePath: `${BRAND_ID}/${ASSET_ID}/v2/new.png`,
    fileName: 'new.png',
    mimeType: 'image/png',
    sizeBytes: 2048,
    note: 'sharpened export',
  };

  it('inserts the uploaded file with unanalyzed dimensions', () => {
    const row = buildRegisterRow(request, { versionNumber: 2, createdBy: 'uploader-1' });
    expect(row.version_number).toBe(2);
    expect(row.created_by).toBe('uploader-1');
    expect(row.note).toBe('sharpened export');
    expect(row.width).toBeNull();
    expect(row.height).toBeNull();
    expect(row.duration_ms).toBeNull();
    expect(row.checksum).toBeNull();
  });

  it('promotes the head to the new file and clears stale analysis columns', () => {
    expect(headUpdateFromRegister(request)).toEqual({
      bucket: 'media-library',
      storage_path: `${BRAND_ID}/${ASSET_ID}/v2/new.png`,
      file_name: 'new.png',
      mime_type: 'image/png',
      size_bytes: 2048,
      width: null,
      height: null,
      duration_ms: null,
      checksum: null,
    });
  });

  it('carries browser-measured geometry into the row and the promoted head', () => {
    const measured: RegisterVersionRequest = {
      ...request,
      width: 1920,
      height: 1080,
      durationMs: 15_400,
    };
    const row = buildRegisterRow(measured, { versionNumber: 2, createdBy: 'uploader-1' });
    expect(row.width).toBe(1920);
    expect(row.height).toBe(1080);
    expect(row.duration_ms).toBe(15_400);
    // Integrity stays server-side territory even when geometry is client-supplied.
    expect(row.checksum).toBeNull();

    expect(headUpdateFromRegister(measured)).toMatchObject({
      width: 1920,
      height: 1080,
      duration_ms: 15_400,
      checksum: null,
    });
  });
});

describe('buildRollbackRow / headUpdateFromVersion', () => {
  it('appends a new row copying the target file columns with a rollback note', () => {
    const target = makeVersionRow({ version_number: 2 });
    const row = buildRollbackRow(target, { versionNumber: 4, createdBy: 'roller-1' });
    expect(row.version_number).toBe(4);
    expect(row.note).toBe('Rolled back to v2');
    expect(row.created_by).toBe('roller-1');
    expect(row.storage_path).toBe(target.storage_path);
    expect(row.width).toBe(800);
    expect(row.checksum).toBe('abc123');
  });

  it('promotes the head with the target version known dimensions intact', () => {
    const target = makeVersionRow({ width: 1920, height: 1080, duration_ms: 4500 });
    const update = headUpdateFromVersion(target);
    expect(update.width).toBe(1920);
    expect(update.height).toBe(1080);
    expect(update.duration_ms).toBe(4500);
    expect(update.storage_path).toBe(target.storage_path);
  });
});

describe('versionRowToContract', () => {
  it('maps snake_case rows into the strict contracts shape', () => {
    const contract = versionRowToContract(makeVersionRow(), {
      signedUrl: 'https://signed/url',
      authorName: 'duane@continuumai.agency',
      isHead: true,
    });
    expect(contract.versionNumber).toBe(1);
    expect(contract.brandId).toBe(BRAND_ID);
    expect(contract.assetId).toBe(ASSET_ID);
    expect(contract.storagePath).toBe(`${BRAND_ID}/${ASSET_ID}/hero.png`);
    expect(contract.signedUrl).toBe('https://signed/url');
    expect(contract.authorName).toBe('duane@continuumai.agency');
    expect(contract.isHead).toBe(true);
  });
});
