// "Who approved which version, and when" — one row per verdict, from the two
// places a verdict is recorded: a reviewer's decision on a review request
// (media.review_assignments, pinned to the request's version) and a direct status
// change (media.asset_review_events, pinned to the version that was head at that
// moment). decide_asset_review writes BOTH in one transaction, so an event that
// mirrors a decision (same asset, actor, verdict and transaction timestamp) is
// dropped rather than counted twice.

export type ReportDecisionRow = {
  assetId: string;
  versionId: string | null;
  reviewerUserId: string;
  decision: 'approved' | 'needs_changes';
  note: string | null;
  decidedAt: string;
};

export type ReportEventRow = {
  assetId: string;
  actor: string | null;
  toStatus: string;
  note: string | null;
  createdAt: string;
};

export type ReportVersionRow = {
  id: string;
  assetId: string;
  versionNumber: number;
  createdAt: string;
};

export type ApprovalReportRow = {
  assetId: string;
  assetName: string;
  versionId: string | null;
  versionNumber: number | null;
  decision: 'approved' | 'needs_changes';
  userId: string | null;
  userEmail: string | null;
  at: string;
  via: 'review_request' | 'status_change';
  note: string | null;
};

const VERDICTS = new Set(['approved', 'needs_changes']);

function headAt(
  versions: ReportVersionRow[],
  assetId: string,
  at: string,
): ReportVersionRow | null {
  let head: ReportVersionRow | null = null;
  for (const version of versions) {
    if (version.assetId !== assetId || version.createdAt > at) continue;
    if (!head || version.versionNumber > head.versionNumber) head = version;
  }
  return head;
}

export function buildApprovalReport(input: {
  decisions: ReportDecisionRow[];
  events: ReportEventRow[];
  versions: ReportVersionRow[];
  assetNames: Map<string, string>;
  emails: Map<string, string>;
}): ApprovalReportRow[] {
  const versionsById = new Map(input.versions.map((version) => [version.id, version]));
  const decisionKeys = new Set(
    input.decisions.map(
      (d) => `${d.assetId}|${d.reviewerUserId}|${d.decision}|${Date.parse(d.decidedAt)}`,
    ),
  );
  const name = (assetId: string) => input.assetNames.get(assetId) ?? assetId;
  const email = (userId: string | null) => (userId ? (input.emails.get(userId) ?? null) : null);

  const fromDecisions: ApprovalReportRow[] = input.decisions.map((decision) => ({
    assetId: decision.assetId,
    assetName: name(decision.assetId),
    versionId: decision.versionId,
    versionNumber: decision.versionId
      ? (versionsById.get(decision.versionId)?.versionNumber ?? null)
      : null,
    decision: decision.decision,
    userId: decision.reviewerUserId,
    userEmail: email(decision.reviewerUserId),
    at: decision.decidedAt,
    via: 'review_request',
    note: decision.note,
  }));

  const fromEvents: ApprovalReportRow[] = input.events
    .filter((event) => VERDICTS.has(event.toStatus))
    .filter(
      (event) =>
        !decisionKeys.has(
          `${event.assetId}|${event.actor}|${event.toStatus}|${Date.parse(event.createdAt)}`,
        ),
    )
    .map((event) => {
      const head = headAt(input.versions, event.assetId, event.createdAt);
      return {
        assetId: event.assetId,
        assetName: name(event.assetId),
        versionId: head?.id ?? null,
        versionNumber: head?.versionNumber ?? null,
        decision: event.toStatus as ApprovalReportRow['decision'],
        userId: event.actor,
        userEmail: email(event.actor),
        at: event.createdAt,
        via: 'status_change',
        note: event.note,
      };
    });

  return [...fromDecisions, ...fromEvents].sort((a, b) => b.at.localeCompare(a.at));
}

function csvCell(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function approvalReportToCsv(rows: ApprovalReportRow[]): string {
  const header = [
    'Asset',
    'Asset ID',
    'Version',
    'Version ID',
    'Decision',
    'By',
    'By User ID',
    'At',
    'Via',
    'Note',
  ];
  const lines = rows.map((row) =>
    [
      row.assetName,
      row.assetId,
      row.versionNumber === null ? '' : `v${row.versionNumber}`,
      row.versionId,
      row.decision,
      row.userEmail,
      row.userId,
      row.at,
      row.via,
      row.note,
    ].map(csvCell),
  );
  return `${[header, ...lines].map((line) => line.join(',')).join('\r\n')}\r\n`;
}
