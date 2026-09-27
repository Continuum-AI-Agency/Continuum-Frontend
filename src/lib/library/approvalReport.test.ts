import { describe, expect, it } from 'bun:test';
import { approvalReportToCsv, buildApprovalReport } from './approvalReport';

const versions = [
  { id: 'v1', assetId: 'a', versionNumber: 1, createdAt: '2026-09-01T00:00:00.000Z' },
  { id: 'v2', assetId: 'a', versionNumber: 2, createdAt: '2026-09-10T00:00:00.000Z' },
];
const base = {
  versions,
  assetNames: new Map([['a', 'Hero, cut']]),
  emails: new Map([
    ['ana', 'ana@brand.test'],
    ['bo', 'bo@brand.test'],
  ]),
};

describe('buildApprovalReport', () => {
  it('pins a reviewer decision to its request version', () => {
    const [row] = buildApprovalReport({
      ...base,
      decisions: [
        {
          assetId: 'a',
          versionId: 'v1',
          reviewerUserId: 'ana',
          decision: 'approved',
          note: null,
          decidedAt: '2026-09-12T00:00:00.000Z',
        },
      ],
      events: [],
    });
    expect(row).toMatchObject({
      versionNumber: 1,
      userEmail: 'ana@brand.test',
      via: 'review_request',
    });
  });

  it('pins a direct status change to the head at that moment', () => {
    const rows = buildApprovalReport({
      ...base,
      decisions: [],
      events: [
        {
          assetId: 'a',
          actor: 'bo',
          toStatus: 'approved',
          note: 'ok',
          createdAt: '2026-09-05T00:00:00.000Z',
        },
        {
          assetId: 'a',
          actor: 'bo',
          toStatus: 'needs_changes',
          note: null,
          createdAt: '2026-09-11T00:00:00.000Z',
        },
        {
          assetId: 'a',
          actor: 'bo',
          toStatus: 'in_review',
          note: null,
          createdAt: '2026-09-11T01:00:00.000Z',
        },
      ],
    });
    expect(rows.map((row) => [row.decision, row.versionNumber])).toEqual([
      ['needs_changes', 2],
      ['approved', 1],
    ]);
  });

  it('counts a decision and the event it wrote once', () => {
    const rows = buildApprovalReport({
      ...base,
      decisions: [
        {
          assetId: 'a',
          versionId: 'v2',
          reviewerUserId: 'ana',
          decision: 'approved',
          note: null,
          decidedAt: '2026-09-12T00:00:00.123456+00:00',
        },
      ],
      events: [
        {
          assetId: 'a',
          actor: 'ana',
          toStatus: 'approved',
          note: null,
          createdAt: '2026-09-12T00:00:00.123Z',
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.via).toBe('review_request');
  });
});

describe('approvalReportToCsv', () => {
  it('escapes asset names and labels versions', () => {
    const csv = approvalReportToCsv(
      buildApprovalReport({
        ...base,
        decisions: [
          {
            assetId: 'a',
            versionId: 'v2',
            reviewerUserId: 'ana',
            decision: 'approved',
            note: null,
            decidedAt: '2026-09-12T00:00:00.000Z',
          },
        ],
        events: [],
      }),
    );
    expect(csv.split('\r\n')[1]).toBe(
      '"Hero, cut",a,v2,v2,approved,ana@brand.test,ana,2026-09-12T00:00:00.000Z,review_request,',
    );
  });
});
