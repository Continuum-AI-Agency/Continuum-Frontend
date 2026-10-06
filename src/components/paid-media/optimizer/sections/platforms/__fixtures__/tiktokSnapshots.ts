// The `tiktok_snapshots` envelope exactly as the edge answers it, captured from the REAL
// paid-media-metrics router (scripts/optimizer-multiplatform/tiktok-read-driver.ts) fed the
// doc-shaped TikTok Marketing API v1.3 rows in packages/optimization-engine/tests/fixtures/
// multiplatform/tiktok-*.json. Doc-shaped, not live: there is no approved TikTok app, the ids
// are invented, and the campaign and ad-group names are the fixtures' own data.

import envelope from './tiktok-doc-shaped-snapshots.json';

export const TIKTOK_DOC_SHAPED_ENVELOPE: unknown = envelope;

export const TIKTOK_ADVERTISER_ID = '7000000000000000001';
