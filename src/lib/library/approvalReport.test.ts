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

  it('credits a status change to the version it was cast on, with its custom state', () => {
    // v1 approved on 09-12 while v2 (09-10) is head: the event names v1.
    const [row] = buildApprovalReport({
      ...base,
      stateNames: new Map([['legal', 'Client signed off']]),
      decisions: [],
      events: [
        {
          assetId: 'a',
          versionId: 'v1',
          stateId: 'legal',
          actor: 'bo',
          toStatus: 'approved',
          note: null,
          createdAt: '2026-09-12T00:00:00.000Z',
        },
      ],
    });
    expect(row).toMatchObject({ versionId: 'v1', versionNumber: 1, state: 'Client signed off' });
    expect(approvalReportToCsv([row as NonNullable<typeof row>]).split('\r\n')[1]).toContain(
      ',v1,v1,approved,Client signed off,',
    );
  });

  it('reports every custom-state move, whatever its base, and leaves plain non-verdicts out', () => {
    const rows = buildApprovalReport({
      ...base,
      stateNames: new Map([['legal', 'Legal review']]),
      decisions: [],
      events: [
        {
          assetId: 'a',
          versionId: 'v2',
          stateId: 'legal',
          actor: 'ana',
          toStatus: 'in_review',
          note: null,
          createdAt: '2026-09-13T00:00:00.000Z',
        },
        {
          assetId: 'a',
          versionId: 'v2',
          actor: 'ana',
          toStatus: 'draft',
          note: null,
          createdAt: '2026-09-14T00:00:00.000Z',
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      decision: 'in_review',
      state: 'Legal review',
      versionNumber: 2,
      userEmail: 'ana@brand.test',
      at: '2026-09-13T00:00:00.000Z',
    });
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
      '"Hero, cut",a,v2,v2,approved,,ana@brand.test,ana,2026-09-12T00:00:00.000Z,review_request,',
    );
  });
});
